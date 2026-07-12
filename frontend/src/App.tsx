import { useEffect, useState } from "react";
import { api, type State } from "./api.js";

export default function App() {
  const [state, setState] = useState<State | null>(null);
  const [input, setInput] = useState("");
  const [roll, setRoll] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getState().then(setState).catch((e) => setError(String(e)));
  }, []);

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
    await run(() => api.action(text));
  }

  async function submitRoll() {
    if (!roll.trim()) return;
    const r = roll;
    setRoll("");
    await run(() => api.roll(r));
  }

  if (!state) return <main className="app"><p>{error ?? "Lädt…"}</p></main>;

  const pending = state.pendingDice;

  return (
    <main className="app">
      <header>
        <h1>KI-Spielleiter</h1>
        <button onClick={() => run(() => api.reset())} disabled={busy}>Neu starten</button>
      </header>

      <section className="transcript">
        {state.history.map((t, i) => (
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
