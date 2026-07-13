import { SCENE_BRIEF } from "./scene.js";
import type { Turn } from "./types.js";

const CONTINUITY_RULES = `
KONSISTENZ (SEHR WICHTIG):
- Bleibe konsistent mit allem, was bereits etabliert wurde. Behalte einmal
  eingeführte Namen von Orten, Personen und Gegenständen unverändert bei und
  erfinde sie nicht neu — derselbe Ort behält denselben Namen.
- Behalte einmal genannte Zahlen bei (z. B. die Anzahl der Gegner). Ändere sie
  nur, wenn es eine erzählerische Ursache gibt (z. B. ein Gegner wurde besiegt).
- Verwechsle niemals den Namen einer Person mit dem eines Ortes oder umgekehrt.
  Wer als Person eingeführt wurde, bleibt eine Person; ein Ort bleibt ein Ort.
`.trim();

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

// The opening narration is a gm turn and is dropped from the message list
// (the Messages API requires a leading user message). But it is where the GM
// first establishes canonical facts — place names, NPC names, enemy counts —
// that are NOT in the premise. Fold it back into the system prompt so those
// facts survive on every later turn; otherwise the model re-invents them and
// the world drifts (renamed locations, 4 goblins → 3).
function openingSection(opening: string | undefined): string {
  const text = opening?.trim();
  return text ? `\n\nBISHERIGER VERLAUF (so hat das Abenteuer begonnen — bleibe dazu konsistent):\n${text}` : "";
}

export function buildSystemPrompt(premise: string, opening?: string): string {
  return `
Du bist der Spielleiter (Game Master).

${SCENE_BRIEF}

SZENE DIESER KAMPAGNE:
${premise}${openingSection(opening)}

${CONTINUITY_RULES}

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
