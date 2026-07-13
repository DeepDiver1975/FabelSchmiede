export type DiceRequest = { reason: string; hint: string };
export type Turn = { role: "gm" | "player"; text: string; diceRequest: DiceRequest | null };
export type CampaignStatus = "active" | "finished";

export type Campaign = {
  id: string;
  name: string;
  premise: string;
  status: CampaignStatus;
  created_at: string;
  finished_at: string | null;
};

export type CampaignSummary = {
  id: string;
  name: string;
  status: CampaignStatus;
  created_at: string;
  finished_at: string | null;
};

export type CharacterNarrative = {
  backstory?: string;
  personality?: string;
  ideal?: string;
  bond?: string;
  flaw?: string;
  appearance?: string;
};

export type Character = {
  id: string;
  campaign_id: string;
  name: string;
  concept: string;
  narrative?: CharacterNarrative;
  created_at: string;
};

// Stage 1 only manages narrative fields; level/abilities/resources are later stages.
export type CharacterInput = {
  name: string;
  concept: string;
  narrative?: CharacterNarrative;
};

export type State = {
  campaign: Campaign;
  turns: Turn[];
  pendingDice: DiceRequest | null;
  characters: Character[];
};
export type Story = { markdown: string; generated_at: string };

async function req<T>(url: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? "Unbekannter Fehler");
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  listCampaigns: () => req<CampaignSummary[]>("/api/campaigns", "GET"),
  createCampaign: (name: string, premise: string) =>
    req<State>("/api/campaigns", "POST", { name, premise }),
  getState: (id: string) => req<State>(`/api/campaigns/${id}/state`, "GET"),
  action: (id: string, text: string) => req<State>(`/api/campaigns/${id}/action`, "POST", { text }),
  roll: (id: string, result: string) => req<State>(`/api/campaigns/${id}/roll`, "POST", { result }),
  finish: (id: string) => req<Campaign>(`/api/campaigns/${id}/finish`, "POST"),
  generateStory: (id: string) => req<Story>(`/api/campaigns/${id}/story`, "POST"),
  getStory: (id: string) => req<Story>(`/api/campaigns/${id}/story`, "GET"),
  listCharacters: (id: string) => req<Character[]>(`/api/campaigns/${id}/characters`, "GET"),
  createCharacter: (id: string, input: CharacterInput) =>
    req<Character>(`/api/campaigns/${id}/characters`, "POST", input),
  updateCharacter: (id: string, cid: string, patch: CharacterInput) =>
    req<Character>(`/api/campaigns/${id}/characters/${cid}`, "PATCH", patch),
  deleteCharacter: (id: string, cid: string) =>
    req<void>(`/api/campaigns/${id}/characters/${cid}`, "DELETE"),
};
