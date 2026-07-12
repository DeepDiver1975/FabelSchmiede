import { SCENE_BRIEF } from "./scene.js";
import type { Turn } from "./types.js";

const DICE_AND_FORMAT_RULES = `
REGELN FÜR DICH:
- Würfle niemals selbst und erfinde niemals Würfelergebnisse.
- Wenn eine Handlung eine Probe erfordert (Angriff, Fertigkeit, Rettungswurf),
  setze das Feld "diceRequest" mit einer kurzen Begründung ("reason") und einem
  Hinweis ("hint", z. B. "W20 + Geschicklichkeit"). Erzähle bis zu dem Punkt,
  an dem gewürfelt werden muss, und HALTE DANN AN. Warte auf das Ergebnis.
- Wenn keine Probe nötig ist, setze "diceRequest" auf null und erzähle weiter.
- Wenn dir das Ergebnis eines Wurfs mitgeteilt wird, erzähle den Ausgang darauf
  aufbauend. Widersprich niemals einem bereits mitgeteilten Ergebnis.

ANTWORTFORMAT:
Antworte ausschließlich als JSON-Objekt mit den Feldern "narration" (dein
deutscher Erzähltext) und "diceRequest" (Objekt {reason, hint} oder null).
`.trim();

export function buildSystemPrompt(premise: string): string {
  return `
Du bist der Spielleiter (Game Master).

${SCENE_BRIEF}

SZENE DIESER KAMPAGNE:
${premise}

${DICE_AND_FORMAT_RULES}
`.trim();
}

export function buildOpeningSystemPrompt(premise: string): string {
  return `
Du bist der Spielleiter (Game Master) und eröffnest eine neue Kampagne.

${SCENE_BRIEF}

SZENE DIESER KAMPAGNE:
${premise}

Erzähle eine kurze, atmosphärische Eröffnungsszene auf Deutsch, die die Gruppe
in diese Ausgangslage hineinversetzt, und ende mit einer offenen Frage wie
"Was tut ihr?".

${DICE_AND_FORMAT_RULES}
`.trim();
}

export function historyToMessages(
  history: Turn[],
): { role: "user" | "assistant"; content: string }[] {
  const messages = history.map((t) => ({
    role: (t.role === "gm" ? "assistant" : "user") as "user" | "assistant",
    content: t.text,
  }));
  // The Messages API requires the first message to have role "user". A campaign's
  // stored history begins with the opening narration (a gm turn → assistant), so
  // drop leading assistant turns; the opening's context is already in the system
  // prompt via the premise.
  while (messages[0]?.role === "assistant") {
    messages.shift();
  }
  return messages;
}
