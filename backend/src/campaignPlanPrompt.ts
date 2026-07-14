// Builds the system prompt that turns a one-line premise into a structured
// CampaignPlan. D&D-flavoured in tone but structurally system-agnostic (only
// NPCs/locations/arc, no rules mechanics) so it stays ready for other rulesets.
// The literal "Abenteuer-Architekt" is a stable marker other code (test fakes)
// keys on to recognise a plan-generation request.
export function buildCampaignPlanSystemPrompt(name: string, premise: string): string {
  return `
Du bist ein Abenteuer-Architekt. Entwirf aus einer kurzen Prämisse die Struktur
einer deutschen Rollenspiel-Kampagne (Fantasy, D&D-Stil).

KAMPAGNE: ${name}
PRÄMISSE: ${premise}

ERZEUGE:
- "title": ein stimmungsvoller Titel.
- "brief": eine spoilerfreie Ausgangslage (2–4 Sätze). Der "brief" darf NICHTS
  aus "backstory", "arc" oder den NPC-"secret"-Feldern verraten.
- "backstory": die wahre Lage hinter dem "brief" (geheim, nur für den
  Spielleiter).
- "npcs": 3–5 wichtige Figuren, je mit "name", "role", "description"
  (öffentlich wahrnehmbar) und "secret" (verborgenes Motiv/Wahrheit; "" wenn
  keines).
- "locations": 3–5 Orte, je mit "name", "description" (öffentlich) und "secret"
  ("" wenn keines).
- "arc": ein LOSER Handlungsbogen mit "outline" (Anfang bis mögliche Enden),
  "hooks" (Aufhänger) und "branchPoints" (2–3 Entscheidungsweichen). Der Bogen
  ist Orientierung, keine Schiene.

REGELN:
- Halte alles auf Deutsch.
- Halte die Anzahl klein (siehe oben) und die Texte kompakt.
- Antworte ausschließlich als JSON-Objekt mit genau diesen Feldern.
`.trim();
}
