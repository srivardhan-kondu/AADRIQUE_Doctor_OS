import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { KNOWN_VARIABLES, workflowProblem } from "@/lib/workflow/triggers";
import { parseSteps } from "@/lib/workflow/steps";
import { STARTER_TEMPLATES, STARTER_WORKFLOWS } from "@/server/setup/starter-kit";

/** Spec §28 — a new clinic's automations must work on day one, not be held back. */

const templates = STARTER_TEMPLATES.map((t) => ({
  key: t.key,
  channel: t.channel,
  placeholders: [...t.body.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]),
}));

describe("starter kit", () => {
  for (const workflow of STARTER_WORKFLOWS) {
    it(`"${workflow.name}" is a workflow the builder would accept`, () => {
      assert.equal(parseSteps(workflow.steps).ok, true);
      assert.equal(workflowProblem(workflow.trigger, workflow.steps, templates), null);
    });
  }

  it("declares exactly the placeholders each template uses, all known", () => {
    for (const t of templates) {
      const declared = STARTER_TEMPLATES.find((s) => s.key === t.key)!.variables;
      assert.deepEqual([...declared].sort(), [...new Set(t.placeholders)].sort(), t.key);
      for (const p of t.placeholders) assert.ok(KNOWN_VARIABLES.includes(p), `${t.key}: {{${p}}}`);
    }
  });
});
