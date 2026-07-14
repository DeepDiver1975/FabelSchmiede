import { SCENE_BRIEF } from "./scene.js";
import { renderParty } from "./partyPrompt.js";
import type { Character, Turn } from "./types.js";

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

const ASIDE_RULES = `
NACHFRAGE-MODUS (WICHTIG):
- Der Spieler stellt hier eine Verständnisfrage zur Spielwelt "nebenbei"
  (z. B. Namen, Fakten, Hintergrund) — dies ist KEINE Spielhandlung.
- Beantworte die Frage informativ und knapp, direkt und aus der Warte des
  Spielleiters (nicht in der Rolle einer Spielfigur).
- Erfinde bei Bedarf plausible neue Fakten (Namen, Titel, Zusammenhänge), aber
  nur wenn die Frage nicht bereits durch etwas oben Etabliertes beantwortet
  ist — und diese Erfindungen werden ab sofort kanonisch und müssen in
  Zukunft konsistent bleiben.
- Führe die Szene NICHT weiter, verändere NICHTS an der aktuellen Situation,
  löse KEINE neuen Ereignisse aus und stelle KEINE neue offene Frage wie
  "Was tut ihr?".
- Setze "diceRequest" IMMER auf null. Nachfragen erfordern niemals einen Wurf.

ANTWORTFORMAT:
Antworte ausschließlich als JSON-Objekt mit den Feldern "narration" (deine
deutsche Antwort auf die Nachfrage) und "diceRequest" (immer null).
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

function partySection(party: Character[] | undefined): string {
  const roster = party ? renderParty(party) : "";
  return roster ? `\n\n${roster}` : "";
}

export function buildSystemPrompt(premise: string, opening?: string, party?: Character[]): string {
  return `
Du bist der Spielleiter (Game Master).

${SCENE_BRIEF}

SZENE DIESER KAMPAGNE:
${premise}${openingSection(opening)}${partySection(party)}

${CONTINUITY_RULES}

${DICE_AND_FORMAT_RULES}
`.trim();
}

export function buildAsideSystemPrompt(premise: string, opening?: string, party?: Character[]): string {
  return `
Du bist der Spielleiter (Game Master) und beantwortest gerade eine Nebenfrage
außerhalb der eigentlichen Spielhandlung.

${SCENE_BRIEF}

SZENE DIESER KAMPAGNE:
${premise}${openingSection(opening)}${partySection(party)}

${CONTINUITY_RULES}

${ASIDE_RULES}
`.trim();
}

export function buildOpeningSystemPrompt(premise: string, party?: Character[]): string {
  return `
Du bist der Spielleiter (Game Master) und eröffnest eine neue Kampagne.

${SCENE_BRIEF}

SZENE DIESER KAMPAGNE:
${premise}${partySection(party)}

Erzähle eine kurze, atmosphärische Eröffnungsszene auf Deutsch, die die Gruppe
in diese Ausgangslage hineinversetzt, und ende mit einer offenen Frage wie
"Was tut ihr?".

${DICE_AND_FORMAT_RULES}
`.trim();
}

export function historyToMessages(
  history: Turn[],
): { role: "user" | "assistant"; content: string }[] {
  // gm turns are stored as bare narration, but the model is asked to reply as a
  // JSON envelope. If we replay bare prose as the assistant's prior turns, the
  // model imitates it and eventually drops the envelope itself — parseGmReply
  // then fails ("GM reply was not valid JSON"). Reconstruct the envelope so the
  // conversation stays consistent with the system prompt's format instruction.
  const messages = history.map((t) => ({
    role: (t.role === "gm" ? "assistant" : "user") as "user" | "assistant",
    content:
      t.role === "gm"
        ? JSON.stringify({ narration: t.text, diceRequest: t.diceRequest ?? null })
        : t.text,
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
