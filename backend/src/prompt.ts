import { SCENE_BRIEF } from "./scene.js";
import { renderParty } from "./partyPrompt.js";
import { currentCombatant } from "./combat.js";
import type { Character, CampaignPlan, CombatState, Turn } from "./types.js";

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
- Gliedere längeren Erzähltext in kurze Absätze, getrennt durch eine Leerzeile
  (höchstens etwa 3–4 Sätze pro Absatz), damit er gut lesbar bleibt.
- Halte deinen Erzähltext insgesamt kompakt: höchstens etwa vier kurze Absätze
  bzw. rund 1200 Zeichen. Fasse dich – ausschweifende Szenen ermüden am Tisch,
  und überlange Antworten lassen sich nicht vorlesen.

ANTWORTFORMAT:
Antworte ausschließlich als JSON-Objekt mit den Feldern "narration" (dein
deutscher Erzähltext), "diceRequest" (Objekt {reason, hint} oder null) und
"combat" (Kampf-Ereignis oder null — siehe die Kampf-Regeln, sofern vorhanden).
`.trim();

// How the GM *begins* a combat. This must live in the base play prompt: the
// detailed in-combat rules (renderCombat) only appear once a fight is already
// active, so without this the model never emits the "start" event and the
// code-side combat tracker never turns on. Initiative is collected by the app,
// so the GM must NOT also ask for an initiative roll here.
const COMBAT_START_RULES = `
KAMPF-BEGINN (SEHR WICHTIG):
- Wenn ein Kampf beginnt (die Gruppe greift an oder wird angegriffen), setze
  das Feld "combat" auf ein Start-Ereignis, das die Gegner auflistet:
  {"event":"start","enemies":[{"name":"Goblin","count":3,"hp":7}]}
  Gib für jede Gegnerart den Namen ("name"), die Anzahl ("count") und die
  Trefferpunkte pro Gegner ("hp") an. Schätze die Trefferpunkte passend zur
  Gefährlichkeit (schwacher Gegner ~5–10, zäher Gegner ~15–30).
- Setze in genau diesem Zug "diceRequest" auf null. Die Initiative würfelt die
  Gruppe selbst über die App aus — fordere hier KEINEN Wurf an. Erzähle nur
  atmosphärisch, dass der Kampf ausbricht, und HALTE DANN AN.
- Läuft bereits ein Kampf (Abschnitt "KAMPF LÄUFT" oben), starte KEINEN neuen —
  nutze stattdessen die dortigen Ereignisse (damage/heal/defeat/end).
- In allen anderen Fällen (kein Kampf) setze "combat" auf null.

BEISPIEL für den Beginn eines Kampfes — antworte GENAU in dieser Form (nur das
JSON-Objekt, kein weiterer Text davor oder danach):
{"narration":"Aus dem Unterholz brechen drei Goblins hervor, die rostigen Klingen gezückt, und ein hünenhafter Hobgoblin folgt ihnen mit einem heiseren Kriegsschrei.","diceRequest":null,"combat":{"event":"start","enemies":[{"name":"Goblin","count":3,"hp":7},{"name":"Hobgoblin","count":1,"hp":11}]}}
`.trim();

// How the GM plays a SINGLE combat turn once the fight is underway. The app
// drives the turn loop and asks the GM to resolve exactly one combatant's turn;
// these rules keep that turn discrete and keep HP in sync.
const COMBAT_TURN_RULES = `
KAMPF-ZUG (nur während eines laufenden Kampfes):
- Löse GENAU den einen Zug auf, um den du gebeten wirst — nicht mehr.
- Ein Angriff oder eine Probe erfordert nur EINEN Wurf. Erzähle bis zu diesem
  Wurf, fordere GENAU EINEN Wurf an ("diceRequest") und HALTE DANN AN.
- Wird dir danach ein Würfelergebnis mitgeteilt ([Würfelergebnis: X]), gehört es
  zur bereits begonnenen Handlung. Beschreibe dann NUR den AUSGANG (Treffer oder
  Fehlschlag UND den Schaden) und SCHLIESSE den Zug ab. Fordere KEINEN zweiten
  Wurf an (auch KEINEN separaten Schadenswurf — bestimme den Schaden selbst) und
  WIEDERHOLE NICHT den Beginn der Handlung; beginne die Handlung nicht neu.
- Erzähle NICHT über diesen Zug hinaus und stelle KEINE offene Frage wie
  "Was tut ihr?".
- Wenn ein Angriff trifft, gib IMMER ein Ereignis {event:"damage", target, amount}
  im Feld "combat" an. Bei Heilung {event:"heal", ...}, beim Ausschalten
  {event:"defeat", target}.
- Wirst du zum Abschluss des Kampfes aufgefordert (alle Gegner besiegt oder die
  Gruppe besiegt), beschreibe kurz den Ausgang und sende {event:"end"}.
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

// The full plan is GM-only context — secrets included. It is re-injected into
// every GM turn (like the opening/party) so the world stays consistent. Frozen
// at creation, so this never mutates.
export function renderPlan(plan: CampaignPlan | undefined): string {
  if (!plan) return "";
  const npcs = plan.npcs
    .map((n) => `- ${n.name} (${n.role}): ${n.description}${n.secret ? ` [GEHEIM: ${n.secret}]` : ""}`)
    .join("\n");
  const locations = plan.locations
    .map((l) => `- ${l.name}: ${l.description}${l.secret ? ` [GEHEIM: ${l.secret}]` : ""}`)
    .join("\n");
  const hooks = plan.arc.hooks.map((h) => `- ${h}`).join("\n");
  const branches = plan.arc.branchPoints.map((b) => `- ${b}`).join("\n");
  return `
WELTENBIBEL (NUR FÜR DICH, den Spielleiter — enthält Geheimnisse, die die
Gruppe NICHT kennt): Nutze dies als verbindliches Weltwissen. Halte Namen und
Motive konsistent. Enthülle Geheimnisse nur durch das Spielgeschehen. Der lose
Handlungsbogen dient als Orientierung, niemals als Schiene — reagiere auf das,
was die Gruppe tatsächlich tut.

TITEL: ${plan.title}
AUSGANGSLAGE (öffentlich): ${plan.brief}
HINTERGRUND (geheim): ${plan.backstory}

WICHTIGE FIGUREN:
${npcs}

ORTE:
${locations}

HANDLUNGSBOGEN (geheim): ${plan.arc.outline}
AUFHÄNGER:
${hooks}
ENTSCHEIDUNGSWEICHEN:
${branches}
`.trim();
}

function planSection(plan: CampaignPlan | undefined): string {
  const rendered = renderPlan(plan);
  return rendered ? `\n\n${rendered}` : "";
}

// Combat is code-owned, mutable state (unlike the frozen plan). Re-inject the
// current picture every turn so the model narrates against real HP and the real
// turn order — and never invents them.
export function renderCombat(state: CombatState | null): string {
  if (!state || !state.active) return "";
  const lines = state.combatants
    .map((c) => {
      const side = c.side === "pc" ? "Gruppe" : "Gegner";
      const status = c.defeated ? "besiegt" : `${c.hp}/${c.maxHp} TP`;
      const init = c.initiative === null ? "—" : String(c.initiative);
      return `- ${c.name} (${side}): ${status}, Initiative ${init}`;
    })
    .join("\n");
  const current = currentCombatant(state);
  const turnLine =
    state.phase === "in-turns" && current
      ? `\nAM ZUG: ${current.name}`
      : "\n(Die Initiative wird gerade ausgewürfelt.)";
  return `
KAMPF LÄUFT (verbindlicher Zustand — der Code führt Buch, nicht du):
${lines}${turnLine}

Erfinde keine Trefferpunkte und keine Reihenfolge. Wenn eine Handlung Schaden
verursacht, Heilung bewirkt oder einen Gegner ausschaltet, gib dies über das
Feld "combat" als Ereignis an (damage/heal/defeat). Endet der Kampf, sende das
Ereignis "end".`.trim();
}

function combatSection(state: CombatState | undefined): string {
  const rendered = renderCombat(state ?? null);
  return rendered ? `\n\n${rendered}` : "";
}

export function buildSystemPrompt(
  premise: string,
  opening?: string,
  party?: Character[],
  plan?: CampaignPlan,
  combat?: CombatState,
): string {
  return `
Du bist der Spielleiter (Game Master).

${SCENE_BRIEF}

SZENE DIESER KAMPAGNE:
${premise}${openingSection(opening)}${partySection(party)}${planSection(plan)}${combatSection(combat)}

${CONTINUITY_RULES}

${COMBAT_START_RULES}

${COMBAT_TURN_RULES}

${DICE_AND_FORMAT_RULES}
`.trim();
}

export function buildAsideSystemPrompt(
  premise: string,
  opening?: string,
  party?: Character[],
  plan?: CampaignPlan,
): string {
  return `
Du bist der Spielleiter (Game Master) und beantwortest gerade eine Nebenfrage
außerhalb der eigentlichen Spielhandlung.

${SCENE_BRIEF}

SZENE DIESER KAMPAGNE:
${premise}${openingSection(opening)}${partySection(party)}${planSection(plan)}

${CONTINUITY_RULES}

${ASIDE_RULES}
`.trim();
}

export function buildOpeningSystemPrompt(
  premise: string,
  party?: Character[],
  plan?: CampaignPlan,
): string {
  return `
Du bist der Spielleiter (Game Master) und eröffnest eine neue Kampagne.

${SCENE_BRIEF}

SZENE DIESER KAMPAGNE:
${premise}${partySection(party)}${planSection(plan)}

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
