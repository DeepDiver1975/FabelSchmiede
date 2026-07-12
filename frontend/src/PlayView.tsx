import { useState } from "react";
import { api, type State } from "./api.js";

export function PlayView({
  initial,
  onBack,
  onFinished,
}: {
  initial: State;
  onBack: () => void;
  onFinished: (campaignId: string) => void;
}) {
  const [state, setState] = useState<State>(initial);
  const [input, setInput] = useState("");
  const [roll, setRoll] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const id = state.campaign.id;
  const pending = state.pendingDice;

  async function run(fn: () => Promise<State>) {
    setBusy(true);
    setError(null);
    try {
      setState(await fn());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function submitAction() {
    if (!input.trim()) return;
    const text = input;
    setInput("");
    await run(() => api.action(id, text));
  }

  async function submitRoll() {
    if (!roll.trim()) return;
    const r = roll;
    setRoll("");
    await run(() => api.roll(id, r));
  }

  async function finish() {
    if (!confirm("Kampagne wirklich abschließen? Danach ist kein Weiterspielen möglich.")) return;
    setBusy(true);
    setError(null);
    try {
      await api.finish(id);
      onFinished(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <main className="app">
      <header>
        <h1>{state.campaign.name}</h1>
        <div className="header-actions">
          <button onClick={onBack} disabled={busy}>← Übersicht</button>
          <button onClick={finish} disabled={busy}>Kampagne abschließen</button>
        </div>
      </header>

      <section className="transcript">
        {state.turns.map((t, i) => (
          <p key={i} className={t.role}>
            <strong>{t.role === "gm" ? "SL" : "Ihr"}:</strong> {t.text}
          </p>
        ))}
      </section>

      {error && <p className="error">{error}</p>}
      {busy && <p className="busy">Der Spielleiter überlegt…</p>}

      {pending ? (
        <section className="dice">
          <p><strong>Wurf nötig:</strong> {pending.reason} ({pending.hint})</p>
          <input
            value={roll}
            onChange={(e) => setRoll(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitRoll()}
            placeholder="Würfelergebnis eingeben…"
            disabled={busy}
            autoFocus
          />
          <button onClick={submitRoll} disabled={busy}>Ergebnis senden</button>
        </section>
      ) : (
        <section className="action">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitAction()}
            placeholder="Was tut ihr?"
            disabled={busy}
            autoFocus
          />
          <button onClick={submitAction} disabled={busy}>Handeln</button>
        </section>
      )}
    </main>
  );
}
