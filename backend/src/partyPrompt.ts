import type { Character } from "./types.js";

function renderMember(character: Character): string {
  const lines = [`- ${character.name}, ${character.concept}.`];
  const n = character.narrative;
  if (n?.personality) lines.push(`  Wesenszug: ${n.personality}.`);
  if (n?.ideal) lines.push(`  Ideal: ${n.ideal}.`);
  if (n?.bond) lines.push(`  Bindung: ${n.bond}.`);
  if (n?.flaw) lines.push(`  Makel: ${n.flaw}.`);
  if (n?.appearance) lines.push(`  Aussehen: ${n.appearance}.`);
  if (n?.backstory) lines.push(`  Hintergrund: ${n.backstory}`);
  return lines.join("\n");
}

export function renderParty(characters: Character[]): string {
  if (characters.length === 0) return "";
  const roster = characters.map(renderMember).join("\n");
  return `GRUPPE (die Spielercharaktere — bleibe konsistent mit diesen Personen):\n${roster}`;
}
