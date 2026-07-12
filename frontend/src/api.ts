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

export type State = { campaign: Campaign; turns: Turn[]; pendingDice: DiceRequest | null };
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
};
