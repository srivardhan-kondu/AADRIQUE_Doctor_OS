import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { GroundedProvider } from "./grounded";
import type { AIProvider, AIRequest, AIResult, AISection } from "./types";

/**
 * The Claude provider (spec §23, §32).
 *
 * Two things make this safe to point at a clinical record:
 *
 *   1. Retrieval happens before the call. The model is handed the facts and
 *      told it may not go beyond them, so it is phrasing, not recalling.
 *   2. The response is validated before it is returned. A citation to a
 *      source that was not supplied is dropped rather than shown, because a
 *      plausible-looking reference to a record that does not exist is exactly
 *      the failure spec §10 forbids.
 *
 * If the call fails for any reason, the grounded provider answers instead and
 * the result says so. A doctor mid-consultation should never be left with an
 * error where a brief was.
 */

const MODEL = "claude-opus-5";

/** Spec §10, as the model's standing instruction. */
const SYSTEM = `You are a documentation assistant inside a clinical workspace, writing for a practising doctor in India.

You will be given FACTS drawn from one patient's medical record, each with an id like [S1]. Those facts are the only information you have.

Absolute rules:
- Never state anything that is not in the FACTS. If the record does not say it, you do not say it.
- Never diagnose, never recommend a specific medication or dose, and never state a clinical conclusion. You may point the doctor at a record worth reading.
- Cite the fact ids you used for each section. Only cite ids that appear in the FACTS.
- If the FACTS do not support a section, omit it rather than padding it.
- Write plainly and briefly. A doctor reads this in fifteen seconds between patients.

Reply with JSON only, no prose around it:
{"sections":[{"heading":"...","lines":["..."],"cites":["S1"]}]}`;

export class AnthropicProvider implements AIProvider {
  readonly name = "anthropic";
  readonly model = MODEL;

  private readonly client: Anthropic;
  private readonly fallback = new GroundedProvider();

  constructor(client?: Anthropic) {
    // The zero-arg client resolves credentials from the environment.
    this.client = client ?? new Anthropic();
  }

  async complete(request: AIRequest): Promise<AIResult> {
    const startedAt = Date.now();

    try {
      const response = await this.client.messages.create({
        model: MODEL,
        max_tokens: 4000,
        // Adaptive thinking: the model decides how much reasoning a given
        // brief needs, rather than a fixed budget per call.
        thinking: { type: "adaptive" },
        output_config: { effort: "low" },
        system: SYSTEM,
        messages: [{ role: "user", content: buildPrompt(request) }],
      });

      // Spec §10 — a refusal is a valid outcome, not a crash.
      if (response.stop_reason === "refusal") {
        return this.declineTo(
          request,
          "The model declined this request, so the brief was assembled from the record instead.",
        );
      }

      const text = response.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("")
        .trim();

      const sections = validate(parseSections(text), request);

      if (sections.length === 0) {
        return this.declineTo(
          request,
          "The model returned nothing usable, so the brief was assembled from the record instead.",
        );
      }

      return {
        sections,
        sources: request.sources,
        provider: this.name,
        model: MODEL,
        latencyMs: Date.now() - startedAt,
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
        grounded: false,
      };
    } catch (error) {
      console.error(
        "Claude call failed, falling back to the record",
        error instanceof Error ? error.message : error,
      );
      return this.declineTo(
        request,
        "The AI service could not be reached, so this was assembled from the record instead.",
      );
    }
  }

  private async declineTo(request: AIRequest, note: string): Promise<AIResult> {
    const result = await this.fallback.complete(request);
    return { ...result, note };
  }
}

function buildPrompt(request: AIRequest): string {
  const facts = request.sources.length
    ? request.sources
        .map((s) => `[${s.ref}] (${s.kind}) ${s.at ?? "undated"} — ${s.label}: ${s.detail}`)
        .join("\n")
    : "(none on record)";

  const input = request.input
    ? Object.entries(request.input)
        .filter(([, value]) => value !== null && value !== undefined && value !== "")
        .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
        .join("\n")
    : "";

  return [
    `TASK: ${request.task}`,
    `WHAT THE DOCTOR ASKED FOR: ${request.instruction}`,
    input && `\nADDITIONAL INPUT:\n${input}`,
    `\nFACTS:\n${facts}`,
    request.maxCharacters
      ? `\nKeep the whole answer under ${request.maxCharacters} characters.`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Pulls the JSON object out of the reply, tolerating a code fence around it. */
function parseSections(text: string): AISection[] {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return [];

  try {
    const parsed: unknown = JSON.parse(text.slice(start, end + 1));
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !Array.isArray((parsed as { sections?: unknown }).sections)
    ) {
      return [];
    }

    return (parsed as { sections: unknown[] }).sections.flatMap((raw) => {
      if (typeof raw !== "object" || raw === null) return [];
      const section = raw as Record<string, unknown>;

      const heading = typeof section.heading === "string" ? section.heading : "";
      const lines = Array.isArray(section.lines)
        ? section.lines.filter((l): l is string => typeof l === "string")
        : [];
      const cites = Array.isArray(section.cites)
        ? section.cites.filter((c): c is string => typeof c === "string")
        : [];

      if (!heading || lines.length === 0) return [];
      return [{ heading, lines, cites }];
    });
  } catch {
    return [];
  }
}

/**
 * Spec §10 — the validation step from §32's pipeline.
 *
 * A citation to a source that was never supplied is dropped. The sentence
 * survives; the false provenance does not. Showing a doctor "[S7]" that links
 * to nothing, or worse to the wrong record, is the failure this prevents.
 */
function validate(sections: AISection[], request: AIRequest): AISection[] {
  const known = new Set(request.sources.map((s) => s.ref));

  return sections.map((section) => ({
    ...section,
    cites: section.cites.filter((ref) => known.has(ref)),
  }));
}
