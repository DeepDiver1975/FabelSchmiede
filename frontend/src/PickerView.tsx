import { useEffect, useState } from "react";
import { api, type CampaignSummary, type State } from "./api.js";

export function PickerView({
  onOpen,
}: {
  onOpen: (state: State) => void;
}) {
  const [campaigns, setCampaigns] = useState<CampaignSummary[] | null>(null);
  const [name, setName] = useState("");
  const [premise, setPremise] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    api.listCampaigns().then(setCampaigns).catch((e) => setError(String(e)));
  }

  useEffect(refresh, []);

  async function create() {
    if (!name.trim() || !premise.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const state = await api.createCampaign(name, premise);
      onOpen(state);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function open(id: string) {
    setError(null);
    try {
      onOpen(await api.getState(id));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <main className="app">
      <header>
        <h1>KI-Spielleiter — Kampagnen</h1>
      </header>

      <section className="new-campaign">
        <h2>Neue Kampagne</h2>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name der Kampagne"
          disabled={busy}
        />
        <textarea
          value={premise}
          onChange={(e) => setPremise(e.target.value)}
          placeholder="Ausgangslage / Prämisse (auf Deutsch)…"
          disabled={busy}
          rows={3}
        />
        <button onClick={create} disabled={busy}>
          {busy ? "Der Spielleiter bereitet vor…" : "Kampagne beginnen"}
        </button>
      </section>

      {error && <p className="error">{error}</p>}

      <section className="campaign-list">
        {campaigns === null ? (
          <p>Lädt…</p>
        ) : campaigns.length === 0 ? (
          <p>Noch keine Kampagnen. Beginne oben eine neue.</p>
        ) : (
          campaigns.map((c) => (
            <button key={c.id} className="campaign-row" onClick={() => open(c.id)}>
              <span className="campaign-name">{c.name}</span>
              <span className={`badge ${c.status}`}>
                {c.status === "active" ? "aktiv" : "abgeschlossen"}
              </span>
            </button>
          ))
        )}
      </section>
    </main>
  );
}
