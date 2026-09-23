import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AnthropicProvider } from "@/lib/ai/anthropic";
import { GroundedProvider } from "@/lib/ai/grounded";
import type { AIRequest, AISource } from "@/lib/ai/types";

/**
 * Spec §10 — the AI safety rules are unit tested, because they are product
 * requirements rather than guidance.
 *
 * Two properties matter most here and neither is visible by reading output:
 * that a dictated sentence is never silently dropped, and that a citation to
 * a record which was not supplied never reaches the doctor.
 */

function source(ref: string, over: Partial<AISource> = {}): AISource {
  return {
    ref,
    kind: "CONSULTATION",
    label: "Consultation",
    detail: "Chest pain on exertion",
    at: "11 Aug 2026",
    href: "/doctor/consultations/v1",
    ...over,
  };
}

function request(over: Partial<AIRequest> = {}): AIRequest {
  return {
    task: "PRE_CONSULTATION_BRIEF",
    instruction: "Brief the doctor",
    sources: [],
    ...over,
  };
}

describe("grounded provider", () => {
  it("marks itself as grounded and names no model", async () => {
    const result = await new GroundedProvider().complete(request());
    assert.equal(result.grounded, true);
    assert.equal(result.model, null);
    assert.equal(result.provider, "grounded");
  });

  it("builds the brief in the order spec §8 prints it", async () => {
    const result = await new GroundedProvider().complete(
      request({
        sources: [
          source("S1", { kind: "APPOINTMENT", label: "Today's appointment" }),
          source("S2"),
          source("S3", {
            kind: "LAB_REPORT",
            label: "Thyroid",
            detail: "Thyroid — one or more values outside the reference range",
          }),
        ],
        input: { reason: "Fever for three days" },
      }),
    );

    const headings = result.sections.map((s) => s.heading);
    assert.deepEqual(headings.slice(0, 2), ["Reason for visit", "Last visit"]);
    assert.ok(headings.includes("Open items"));
    assert.ok(headings.includes("Suggested review"));
  });

  it("cites only sources it was given", async () => {
    const sources = [source("S1"), source("S2", { kind: "ALLERGY" })];
    const result = await new GroundedProvider().complete(
      request({ sources }),
    );

    const known = new Set(sources.map((s) => s.ref));
    for (const section of result.sections) {
      for (const ref of section.cites) {
        assert.ok(known.has(ref), `cited unknown source ${ref}`);
      }
    }
  });

  it("says so rather than inventing when the record is empty", async () => {
    const result = await new GroundedProvider().complete(request());
    const text = result.sections.flatMap((s) => s.lines).join(" ");
    assert.match(text, /No previous consultation on record/);
  });

  describe("note draft", () => {
    const dictate = (dictation: string) =>
      new GroundedProvider().complete(
        request({ task: "CONSULTATION_NOTE_DRAFT", input: { dictation } }),
      );

    it("routes dictated sentences to clinical headings", async () => {
      const result = await dictate(
        "Patient reports headache for three days. Known case of hypertension. On examination BP 148 over 92. Impression likely tension headache. Advise hydration and review in two weeks.",
      );

      const heading = (name: string) =>
        result.sections.find((s) => s.heading === name)?.lines.join(" ") ?? "";

      assert.match(heading("Symptoms"), /headache/i);
      assert.match(heading("History"), /hypertension/i);
      assert.match(heading("Examination"), /148/);
      assert.match(heading("Assessment"), /tension headache/i);
      assert.match(heading("Plan"), /hydration/i);
    });

    it("never drops a dictated sentence", async () => {
      const sentences = [
        "Patient reports headache for three days",
        "Sleep is poor",
        "No fever",
        "Advise hydration",
      ];
      const result = await dictate(`${sentences.join(". ")}.`);
      const text = result.sections.flatMap((s) => s.lines).join(" ");

      for (const sentence of sentences) {
        assert.ok(
          text.toLowerCase().includes(sentence.toLowerCase()),
          `lost: ${sentence}`,
        );
      }
    });

    it("adds no clinical content of its own", async () => {
      const result = await dictate("Patient reports headache for three days.");
      const clinical = result.sections
        .filter((s) => s.heading !== "How this was produced")
        .flatMap((s) => s.lines)
        .join(" ");

      assert.equal(clinical.trim(), "Patient reports headache for three days.");
    });
  });

  it("does not claim an answer the documents do not contain", async () => {
    const result = await new GroundedProvider().complete(
      request({ task: "KNOWLEDGE_ANSWER", instruction: "parking policy" }),
    );
    const text = result.sections.flatMap((s) => s.lines).join(" ");
    assert.match(text, /Nothing in the approved hospital documents/);
  });
});

/** A stand-in for the SDK client, so no network call happens in a unit test. */
function stubClient(reply: string, stopReason = "end_turn") {
  return {
    messages: {
      create: async () => ({
        content: [{ type: "text", text: reply }],
        stop_reason: stopReason,
        usage: { input_tokens: 10, output_tokens: 20 },
      }),
    },
  } as unknown as ConstructorParameters<typeof AnthropicProvider>[0];
}

describe("anthropic provider", () => {
  const sources = [source("S1"), source("S2")];

  it("drops citations to records it was never given", async () => {
    const provider = new AnthropicProvider(
      stubClient(
        JSON.stringify({
          sections: [
            { heading: "Open items", lines: ["Lab pending"], cites: ["S1", "S9"] },
          ],
        }),
      ),
    );

    const result = await provider.complete(request({ sources }));

    assert.deepEqual(result.sections[0].cites, ["S1"]);
    assert.equal(result.grounded, false);
  });

  it("tolerates a code fence around the JSON", async () => {
    const provider = new AnthropicProvider(
      stubClient(
        '```json\n{"sections":[{"heading":"Last visit","lines":["11 Aug"],"cites":[]}]}\n```',
      ),
    );

    const result = await provider.complete(request({ sources }));
    assert.equal(result.sections[0].heading, "Last visit");
  });

  it("falls back to the record when the model refuses", async () => {
    const provider = new AnthropicProvider(stubClient("", "refusal"));
    const result = await provider.complete(request({ sources }));

    assert.equal(result.grounded, true);
    assert.equal(result.provider, "grounded");
    assert.match(result.note ?? "", /declined/);
  });

  it("falls back to the record when the reply is unusable", async () => {
    const provider = new AnthropicProvider(stubClient("not json at all"));
    const result = await provider.complete(request({ sources }));

    assert.equal(result.grounded, true);
    assert.ok(result.sections.length > 0);
  });

  it("falls back to the record when the call throws", async () => {
    const throwing = {
      messages: {
        create: async () => {
          throw new Error("401 authentication_error");
        },
      },
    } as unknown as ConstructorParameters<typeof AnthropicProvider>[0];

    const result = await new AnthropicProvider(throwing).complete(
      request({ sources }),
    );

    assert.equal(result.grounded, true);
    assert.match(result.note ?? "", /could not be reached/);
  });
});
