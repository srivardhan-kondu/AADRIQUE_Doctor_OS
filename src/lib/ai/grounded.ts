import type {
  AIProvider,
  AIRequest,
  AIResult,
  AISection,
  AISource,
} from "./types";

/**
 * The grounded provider.
 *
 * It composes an answer deterministically from the retrieved sources and
 * nothing else. No model is called, so nothing can be invented — which makes
 * it both the offline fallback and the strictest reading of spec §10 ("never
 * invent patient history", "never present hallucinated facts as chart data").
 *
 * It is not a stub. The retrieval layer has already done the hard part: every
 * fact the brief needs is on the record, and the work left is selection,
 * ordering and phrasing. What a model adds on top is better prose and better
 * judgement about what matters — which is why `AIResult.grounded` is surfaced
 * in the UI rather than hidden. "Assembled from your records" and "written by
 * a model" are different promises to a doctor.
 */
export class GroundedProvider implements AIProvider {
  readonly name = "grounded";
  readonly model = null;

  async complete(request: AIRequest): Promise<AIResult> {
    const startedAt = Date.now();
    const sections = compose(request);

    return {
      sections,
      sources: request.sources,
      provider: this.name,
      model: null,
      latencyMs: Date.now() - startedAt,
      promptTokens: null,
      completionTokens: null,
      grounded: true,
    };
  }
}

function byKind(sources: AISource[], kind: AISource["kind"]): AISource[] {
  return sources.filter((s) => s.kind === kind);
}

function refs(sources: AISource[]): string[] {
  return sources.map((s) => s.ref);
}

function compose(request: AIRequest): AISection[] {
  switch (request.task) {
    case "PRE_CONSULTATION_BRIEF":
      return brief(request);
    case "PATIENT_SUMMARY":
      return summary(request);
    case "CONSULTATION_NOTE_DRAFT":
    case "VOICE_TO_NOTE":
      return noteDraft(request);
    case "FOLLOW_UP_MESSAGE":
      return followUpMessage(request);
    case "HISTORY_SEARCH":
      return historySearch(request);
    case "KNOWLEDGE_ANSWER":
      return knowledgeAnswer(request);
    case "MISSING_DOCUMENTATION":
      return missingDocumentation(request);
  }
}

/** Spec §8 — the pre-consultation brief, in the order the spec prints it. */
function brief(request: AIRequest): AISection[] {
  const { sources } = request;
  const sections: AISection[] = [];

  const reason = String(request.input?.reason ?? "").trim();
  const visitType = String(request.input?.visitType ?? "").trim();

  sections.push({
    heading: "Reason for visit",
    lines: [reason || visitType || "Not recorded at booking"],
    cites: refs(byKind(sources, "APPOINTMENT")),
  });

  const consultations = byKind(sources, "CONSULTATION");
  const last = consultations[0];

  sections.push({
    heading: "Last visit",
    lines: [last ? `${last.at ?? "Date not recorded"} · ${last.detail}` : "No previous consultation on record"],
    cites: last ? [last.ref] : [],
  });

  // Recent history: what actually happened, one line per event.
  const history = [
    ...consultations.slice(0, 3),
    ...byKind(sources, "PRESCRIPTION").slice(0, 2),
    ...byKind(sources, "LAB_REPORT").slice(0, 2),
  ];

  if (history.length > 0) {
    sections.push({
      heading: "Recent history",
      lines: history.map((s) => s.detail),
      cites: refs(history),
    });
  }

  // Open items: anything still outstanding, which is what the doctor is
  // scanning this brief for.
  const open = [
    ...byKind(sources, "FOLLOW_UP"),
    ...byKind(sources, "LAB_REPORT").filter((s) =>
      /abnormal|outside the reference/i.test(s.detail),
    ),
    ...byKind(sources, "ALLERGY"),
    ...byKind(sources, "CONDITION"),
  ];

  if (open.length > 0) {
    sections.push({
      heading: "Open items",
      lines: open.map((s) => s.detail),
      cites: refs(open),
    });
  }

  // Suggested review: a pointer to a record worth opening first. Phrased as a
  // prompt to look, never as a clinical conclusion (spec §10).
  const review = suggestReview(sources);
  if (review) {
    sections.push({
      heading: "Suggested review",
      lines: [review.line],
      cites: review.cites,
    });
  }

  return sections;
}

function suggestReview(
  sources: AISource[],
): { line: string; cites: string[] } | null {
  const abnormal = byKind(sources, "LAB_REPORT").find((s) =>
    /abnormal|outside the reference/i.test(s.detail),
  );
  if (abnormal) {
    return {
      line: "Review the latest lab report before finalizing today's note.",
      cites: [abnormal.ref],
    };
  }

  const allergy = byKind(sources, "ALLERGY")[0];
  if (allergy) {
    return {
      line: "Check the recorded allergies before prescribing.",
      cites: refs(byKind(sources, "ALLERGY")),
    };
  }

  const overdue = byKind(sources, "FOLLOW_UP").find((s) =>
    /overdue|late/i.test(s.detail),
  );
  if (overdue) {
    return {
      line: "This follow-up is overdue — confirm what has changed since the last visit.",
      cites: [overdue.ref],
    };
  }

  const prescription = byKind(sources, "PRESCRIPTION")[0];
  if (prescription) {
    return {
      line: "Confirm adherence to the current prescription before changing it.",
      cites: [prescription.ref],
    };
  }

  return null;
}

function summary(request: AIRequest): AISection[] {
  const { sources } = request;
  const sections: AISection[] = [];

  const groups: [string, AISource["kind"]][] = [
    ["Recent visits", "CONSULTATION"],
    ["Medication history", "PRESCRIPTION"],
    ["Recent reports", "LAB_REPORT"],
    ["Open follow-ups", "FOLLOW_UP"],
    ["Recorded conditions", "CONDITION"],
    ["Allergies", "ALLERGY"],
  ];

  for (const [heading, kind] of groups) {
    const rows = byKind(sources, kind);
    if (rows.length === 0) continue;
    sections.push({
      heading,
      lines: rows.map((s) => s.detail),
      cites: refs(rows),
    });
  }

  if (sections.length === 0) {
    sections.push({
      heading: "Nothing on record",
      lines: ["This patient has no clinical history recorded yet."],
      cites: [],
    });
  }

  return sections;
}

/**
 * Spec §9 — turn what the doctor said into a structured draft.
 *
 * Sentences are routed to a SOAP heading by the language clinicians actually
 * use when dictating. Anything that does not match a cue goes to Symptoms
 * rather than being dropped: losing a dictated sentence is far worse than
 * filing it under the wrong heading, and the doctor is editing this anyway.
 */
function noteDraft(request: AIRequest): AISection[] {
  const dictation = String(request.input?.dictation ?? "").trim();

  if (!dictation) {
    return [
      {
        heading: "Nothing to structure",
        lines: ["Dictate or paste the consultation, and it will be laid out here."],
        cites: [],
      },
    ];
  }

  const CUES: [string, RegExp][] = [
    ["History", /\b(history|previously|last visit|known case|past|since|chronic|family history)\b/i],
    ["Examination", /\b(exam|on examination|o\/e|palpation|auscultation|tender|bp|pulse|temperature|afebrile|vitals?|inspection|swelling)\b/i],
    ["Assessment", /\b(assessment|impression|likely|consistent with|suggestive of|diagnosis|rule out|differential)\b/i],
    ["Plan", /\b(plan|advise|advised|prescrib|start|continue|stop|review in|follow.?up|refer|investigat|repeat|x-?ray|scan)\b/i],
  ];

  const buckets = new Map<string, string[]>([
    ["Symptoms", []],
    ["History", []],
    ["Examination", []],
    ["Assessment", []],
    ["Plan", []],
  ]);

  for (const raw of dictation.split(/(?<=[.!?])\s+|\n+/)) {
    const sentence = raw.trim();
    if (!sentence) continue;

    const matched = CUES.find(([, pattern]) => pattern.test(sentence));
    const heading = matched ? matched[0] : "Symptoms";
    buckets.get(heading)?.push(capitalize(sentence));
  }

  const sections = [...buckets.entries()]
    .filter(([, lines]) => lines.length > 0)
    .map(([heading, lines]) => ({ heading, lines, cites: [] }));

  // Spec §10 — the draft is the doctor's own words rearranged. Say so, so it
  // is never mistaken for the system having decided something.
  sections.push({
    heading: "How this was produced",
    lines: [
      "Your dictation, split into headings. No clinical content was added, removed or interpreted.",
    ],
    cites: [],
  });

  return sections;
}

/** Spec §9 — a patient-friendly message the doctor approves before it sends. */
function followUpMessage(request: AIRequest): AISection[] {
  const patientName = String(request.input?.patientName ?? "there").split(" ")[0];
  const when = String(request.input?.when ?? "").trim();
  const reason = String(request.input?.reason ?? "").trim();

  const lines = [`Hello ${patientName},`, ""];

  if (when) {
    lines.push(`Your follow-up consultation is scheduled for ${when}.`);
  } else {
    lines.push("It is time for your follow-up consultation.");
  }

  if (reason) lines.push(`This visit is to review ${lowerFirst(reason)}.`);

  lines.push(
    "",
    "Please bring any reports from since your last visit.",
    "Reply to this message if you need a different time.",
  );

  return [
    { heading: "Draft message", lines, cites: refs(request.sources) },
    {
      heading: "Before sending",
      lines: [
        "Nothing clinical is included. Read it once — it goes out under the clinic's name.",
      ],
      cites: [],
    },
  ];
}

/** Spec §9 — natural-language retrieval over the record. */
function historySearch(request: AIRequest): AISection[] {
  const { sources, instruction } = request;

  if (sources.length === 0) {
    return [
      {
        heading: "Nothing matched",
        lines: [
          `No record on this patient matches “${instruction}”.`,
          "Try a symptom, a medication name, or a year.",
        ],
        cites: [],
      },
    ];
  }

  return [
    {
      heading: `${sources.length} ${sources.length === 1 ? "match" : "matches"}`,
      lines: sources.map((s) =>
        s.at ? `${s.at} · ${s.detail}` : s.detail,
      ),
      cites: refs(sources),
    },
  ];
}

/** Spec §42 — the hospital knowledge assistant, answering from approved docs. */
function knowledgeAnswer(request: AIRequest): AISection[] {
  const { sources, instruction } = request;

  if (sources.length === 0) {
    return [
      {
        heading: "Not covered by an approved document",
        lines: [
          `Nothing in the approved hospital documents answers “${instruction}”.`,
          "Ask an administrator to upload and approve the relevant policy.",
        ],
        cites: [],
      },
    ];
  }

  return [
    {
      heading: "From the hospital documents",
      lines: sources.map((s) => `${s.label} — ${s.detail}`),
      cites: refs(sources),
    },
    {
      heading: "Source",
      lines: [
        "This is quoted from approved documents, not summarised. Open a source to read it in full.",
      ],
      cites: [],
    },
  ];
}

/** Spec §10 — "highlight missing information" is an explicitly allowed job. */
function missingDocumentation(request: AIRequest): AISection[] {
  const gaps = (request.input?.gaps as string[] | undefined) ?? [];

  if (gaps.length === 0) {
    return [
      {
        heading: "Nothing missing",
        lines: ["Today's note has every section a signed consultation needs."],
        cites: [],
      },
    ];
  }

  return [
    {
      heading: `${gaps.length} ${gaps.length === 1 ? "gap" : "gaps"} before signing`,
      lines: gaps,
      cites: refs(request.sources),
    },
  ];
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}
