import { describe, it, expect } from "vitest";
import {
  buildSystemPrompt,
  buildOpeningSystemPrompt,
  buildAsideSystemPrompt,
  historyToMessages,
  renderPlan,
} from "./prompt.js";
import type { CampaignPlan } from "./types.js";

describe("buildSystemPrompt", () => {
  it("instructs the GM never to roll dice itself and to answer as JSON", () => {
    const p = buildSystemPrompt("Goblins im Nebelwald").toLowerCase();
    expect(p).toContain("würfl"); // matches würfle/würfeln
    expect(p).toContain("dicerequest");
  });
  it("embeds the campaign premise", () => {
    expect(buildSystemPrompt("Goblins im Nebelwald")).toContain("Goblins im Nebelwald");
  });

  it("instructs the GM to keep established names, places, and counts consistent", () => {
    const p = buildSystemPrompt("Goblins im Nebelwald").toLowerCase();
    expect(p).toContain("konsistent");
    // must warn against confusing a person's name with a place
    expect(p).toContain("person");
    expect(p).toContain("ort");
  });

  it("folds the opening narration into the prompt so its facts survive later turns", () => {
    const opening = "Ihr betretet das Dorf Einwindtal. Am Waldrand lauern vier Goblins.";
    const p = buildSystemPrompt("Goblins im Nebelwald", opening);
    expect(p).toContain("Einwindtal");
    expect(p).toContain("vier Goblins");
  });

  it("omits the opening section when no opening is given", () => {
    // A fresh campaign with no prior opening must not leave a dangling heading.
    expect(buildSystemPrompt("Goblins im Nebelwald")).not.toContain("BISHERIGER VERLAUF");
  });

  it("instructs the GM how to START combat via a combat start event", () => {
    // Without this, the model never emits combat.start and the tracker never
    // turns on. It must name the start event and tell the GM not to also ask
    // for an initiative roll (the app collects those).
    const p = buildSystemPrompt("Goblins im Nebelwald");
    expect(p).toContain("KAMPF-BEGINN");
    expect(p).toContain('"event":"start"');
    expect(p).toContain("Initiative"); // app collects it; GM sets diceRequest null
    expect(p).toContain("combat"); // combat field named in the response format
  });

  it("includes a one-shot example of a valid combat-start reply", () => {
    // Smaller/local models (NIM) copy the exact envelope shape from an example
    // far more reliably than from prose. The example must be a complete, valid
    // GM reply (narration + diceRequest null + combat start) that parses.
    const p = buildSystemPrompt("Goblins im Nebelwald");
    expect(p).toContain("BEISPIEL");
    const match = p.match(/\{"narration":.*"event":"start".*\}\}/);
    expect(match).not.toBeNull();
    const parsed = JSON.parse(match![0]);
    expect(parsed.diceRequest).toBeNull();
    expect(parsed.combat.event).toBe("start");
    expect(Array.isArray(parsed.combat.enemies)).toBe(true);
  });

  it("includes the combat-turn rule (one roll per action, resolve outcome, damage event, end)", () => {
    const p = buildSystemPrompt("Goblins im Nebelwald");
    expect(p).toContain("KAMPF-ZUG");
    // an action needs exactly one roll; on the result, resolve the outcome and
    // finish — no second (damage) roll, no re-narrating the setup.
    expect(p).toContain("GENAU EINEN Wurf");
    expect(p).toContain("separaten Schadenswurf"); // no second (damage) roll
    expect(p).toContain("Würfelergebnis");
    expect(p).toContain('{event:"damage"');
    expect(p).toContain('{event:"end"}');
  });
  it("keeps the combat-turn rule out of the aside prompt", () => {
    expect(buildAsideSystemPrompt("Goblins im Nebelwald")).not.toContain("KAMPF-ZUG");
  });
});

describe("buildOpeningSystemPrompt", () => {
  it("asks for an opening scene and embeds the premise", () => {
    const p = buildOpeningSystemPrompt("Ein Raumhafen auf dem Mars");
    expect(p).toContain("Eröffnungsszene");
    expect(p).toContain("Ein Raumhafen auf dem Mars");
  });
});

describe("buildSystemPrompt party injection", () => {
  const character = { id: "1", campaign_id: "c", name: "Thorin", concept: "Zwergischer Krieger", created_at: "x" };

  it("splices in the party roster when characters are present", () => {
    const p = buildSystemPrompt("Goblins im Nebelwald", undefined, [character]);
    expect(p).toContain("GRUPPE");
    expect(p).toContain("Thorin");
  });

  it("is byte-for-byte unchanged when the party is empty", () => {
    expect(buildSystemPrompt("Goblins im Nebelwald", undefined, [])).toBe(
      buildSystemPrompt("Goblins im Nebelwald", undefined),
    );
  });
});

describe("buildOpeningSystemPrompt party injection", () => {
  const character = { id: "1", campaign_id: "c", name: "Lyra", concept: "Elfische Magierin", created_at: "x" };

  it("splices in the party roster when characters are present", () => {
    const p = buildOpeningSystemPrompt("Ein Raumhafen auf dem Mars", [character]);
    expect(p).toContain("GRUPPE");
    expect(p).toContain("Lyra");
  });

  it("is byte-for-byte unchanged when the party is empty", () => {
    expect(buildOpeningSystemPrompt("Ein Raumhafen auf dem Mars", [])).toBe(
      buildOpeningSystemPrompt("Ein Raumhafen auf dem Mars"),
    );
  });
});

describe("buildAsideSystemPrompt", () => {
  it("embeds the premise and instructs no dice roll, no scene advance", () => {
    const p = buildAsideSystemPrompt("Goblins im Nebelwald").toLowerCase();
    expect(p).toContain("goblins im nebelwald");
    expect(p).toContain("nachfrage");
    expect(p).toContain("dicerequest");
  });

  it("still carries the continuity rules so aside answers stay canon-consistent", () => {
    const p = buildAsideSystemPrompt("Goblins im Nebelwald").toLowerCase();
    expect(p).toContain("konsistent");
  });

  it("folds the opening narration in, same as the story prompt", () => {
    const opening = "Ihr betretet das Dorf Einwindtal.";
    expect(buildAsideSystemPrompt("Goblins im Nebelwald", opening)).toContain("Einwindtal");
  });

  it("does not carry the story prompt's dice/format rules", () => {
    // buildSystemPrompt tells the model to set diceRequest for skill checks;
    // the aside prompt must not — it always forces diceRequest to null.
    const storyPrompt = buildSystemPrompt("Goblins im Nebelwald");
    const asidePrompt = buildAsideSystemPrompt("Goblins im Nebelwald");
    expect(asidePrompt).not.toBe(storyPrompt);
    expect(asidePrompt.toLowerCase()).toContain("immer auf null");
  });
});

describe("historyToMessages", () => {
  it("reconstructs the envelope for a gm turn regardless of its kind", () => {
    // Asides must be replayed as context exactly like story turns, so the
    // model stays consistent with facts it invented in an aside answer.
    const msgs = historyToMessages([
      { role: "player", text: "Wie heißt der Wirt?", kind: "aside" },
      { role: "gm", text: "Er heißt Berthold.", diceRequest: null, kind: "aside" },
    ]);
    expect(msgs).toEqual([
      { role: "user", content: "Wie heißt der Wirt?" },
      { role: "assistant", content: '{"narration":"Er heißt Berthold.","diceRequest":null}' },
    ]);
  });


  it("wraps interior gm turns as the JSON envelope the model is asked to produce", () => {
    // The model few-shots off its own prior assistant turns. If those are bare
    // prose (not the JSON envelope), it eventually drops the envelope too and
    // parseGmReply fails. Reconstruct the envelope so the conversation is
    // self-consistent with the system prompt's format instruction.
    const msgs = historyToMessages([
      { role: "gm", text: "Ihr steht vor der Höhle." },
      { role: "player", text: "Ich schleiche hinein." },
      { role: "gm", text: "Es ist dunkel.", diceRequest: null },
    ]);
    expect(msgs).toEqual([
      { role: "user", content: "Ich schleiche hinein." },
      { role: "assistant", content: '{"narration":"Es ist dunkel.","diceRequest":null}' },
    ]);
  });

  it("includes a gm turn's diceRequest in the reconstructed envelope", () => {
    const msgs = historyToMessages([
      { role: "player", text: "Ich greife an." },
      { role: "gm", text: "Wirf!", diceRequest: { reason: "Angriff", hint: "W20 + STR" } },
    ]);
    expect(msgs[1]).toEqual({
      role: "assistant",
      content: JSON.stringify({
        narration: "Wirf!",
        diceRequest: { reason: "Angriff", hint: "W20 + STR" },
      }),
    });
  });

  it("returns an array beginning with a user message", () => {
    const result = historyToMessages([
      { role: "gm", text: "Ihr steht vor der Höhle." },
      { role: "player", text: "Ich schleiche hinein." },
    ]);
    expect(result[0].role).toBe("user");
  });
});

const samplePlan: CampaignPlan = {
  title: "Der Nebelwald",
  brief: "Ein Dorf bittet um Hilfe.",
  backstory: "GEHEIM_BACKSTORY: ein Kult.",
  npcs: [{ name: "Mara", role: "Wirtin", description: "nervös", secret: "GEHEIM_NPC: Spitzel" }],
  locations: [{ name: "Gasthaus", description: "warm", secret: "GEHEIM_LOC: Falltür" }],
  arc: { outline: "GEHEIM_ARC: Ritual", hooks: ["Aufhänger"], branchPoints: ["Weiche"] },
};

describe("renderPlan / plan in prompts", () => {
  it("renderPlan of undefined is empty", () => {
    expect(renderPlan(undefined)).toBe("");
  });

  it("the GM system prompt includes the full plan incl. secrets", () => {
    const sys = buildSystemPrompt("Prämisse", undefined, undefined, samplePlan);
    expect(sys).toContain("Der Nebelwald");
    expect(sys).toContain("GEHEIM_BACKSTORY");
    expect(sys).toContain("GEHEIM_NPC");
    expect(sys).toContain("GEHEIM_LOC");
    expect(sys).toContain("GEHEIM_ARC");
    expect(sys).toContain("Mara");
  });

  it("the opening prompt includes the plan", () => {
    expect(buildOpeningSystemPrompt("Prämisse", undefined, samplePlan)).toContain("GEHEIM_ARC");
  });
});

import { renderCombat } from "./prompt.js";
import type { CombatState } from "./types.js";

describe("renderCombat", () => {
  const state: CombatState = {
    active: true,
    phase: "in-turns",
    combatants: [
      { id: "pc-1", name: "Thalia", side: "pc", maxHp: 12, hp: 7, initiative: 18, defeated: false },
      { id: "goblin-1", name: "Goblin 1", side: "enemy", maxHp: 7, hp: 0, initiative: 12, defeated: true },
    ],
    turnIndex: 0,
    turnPhase: "ready",
  };

  it("returns empty string when no combat", () => {
    expect(renderCombat(null)).toBe("");
  });

  it("lists combatants with hp and marks the current turn", () => {
    const out = renderCombat(state);
    expect(out).toContain("Thalia");
    expect(out).toContain("7/12");
    expect(out).toContain("besiegt");
    expect(out).toContain("AM ZUG: Thalia");
  });
});
