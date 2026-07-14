import { renderParty } from "./partyPrompt.js";
import { renderPlan } from "./prompt.js";
import type { Character, StoredTurn, CampaignPlan } from "./types.js";

export function buildStorySystemPrompt(
  campaign: { name: string; premise: string },
  party?: Character[],
  plan?: CampaignPlan,
): string {
  const roster = party ? renderParty(party) : "";
  const partyBlock = roster ? `\n\n${roster}` : "";
  const rendered = renderPlan(plan);
  const planBlock = rendered ? `\n\n${rendered}` : "";
  return `
Du bist ein Autor. Verwandle das folgende Rollenspiel-Protokoll in eine
zusammenhängende, gut lesbare deutsche Kurzgeschichte.

KAMPAGNE: ${campaign.name}
AUSGANGSLAGE: ${campaign.premise}${partyBlock}${planBlock}

REGELN FÜR DICH:
- Schreibe fließende Prosa in der Vergangenheitsform, keine Protokoll- oder
  Dialogliste.
- Verwebe die Handlungen der Spieler als Taten der Charaktere in die Erzählung.
- Würfelmomente werden dramatisch erzählt, niemals als Zahlen oder Regelbegriffe
  ("W20", "+3") wiedergegeben.
- Die Erzählungen des Spielleiters bilden das Rückgrat der Geschichte.
- Beginne mit einer Überschrift (Markdown "# ${campaign.name}") und danach der
  Geschichte. Antworte ausschließlich mit der Kurzgeschichte als Markdown, ohne
  Vorrede und ohne Nachwort.
`.trim();
}

export function renderTranscript(turns: StoredTurn[]): string {
  return turns
    .filter((t) => t.kind !== "aside")
    .map((t) => (t.role === "gm" ? `SPIELLEITER: ${t.text}` : `SPIELER: ${t.text}`))
    .join("\n\n");
}
