import { useState } from "react";
import { api, type State, type Character, type CharacterInput, type CharacterNarrative } from "./api.js";

type CharacterForm = { id?: string; name: string; concept: string; narrative: CharacterNarrative };

const emptyForm: CharacterForm = { name: "", concept: "", narrative: {} };

function cleanNarrative(n: CharacterNarrative): CharacterNarrative {
  const entries = Object.entries(n).filter(([, v]) => v?.trim());
  return Object.fromEntries(entries);
}

function PartyPanel({
  characters,
  readOnly,
  onCreate,
  onUpdate,
  onDelete,
}: {
  characters: Character[];
  readOnly: boolean;
  onCreate: (input: CharacterInput) => Promise<boolean>;
  onUpdate: (cid: string, patch: CharacterInput) => Promise<boolean>;
  onDelete: (cid: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<CharacterForm | null>(null);
  const [moreDetails, setMoreDetails] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  function startAdd() {
    setForm({ ...emptyForm });
    setMoreDetails(false);
  }

  function startEdit(c: Character) {
    setForm({ id: c.id, name: c.name, concept: c.concept, narrative: { ...c.narrative } });
    setMoreDetails(true);
  }

  async function submit() {
    if (!form) return;
    const name = form.name.trim();
    const concept = form.concept.trim();
    if (!name || !concept) return;
    const cleaned = cleanNarrative(form.narrative);
    let ok: boolean;
    if (form.id) {
      // Edit always submits the complete current narrative (even {}), so a
      // cleared field actually clears on the server (PATCH replaces wholesale).
      ok = await onUpdate(form.id, { name, concept, narrative: cleaned });
    } else {
      const input: CharacterInput = { name, concept };
      if (Object.keys(cleaned).length > 0) input.narrative = cleaned;
      ok = await onCreate(input);
    }
    if (ok) setForm(null);
  }

  function setNarrativeField(key: keyof CharacterNarrative, value: string) {
    setForm((f) => (f ? { ...f, narrative: { ...f.narrative, [key]: value } } : f));
  }

  return (
    <section className="party-panel">
      <button className="party-toggle" onClick={() => setOpen((o) => !o)}>
        {open ? "▾" : "▸"} Gruppe ({characters.length})
      </button>
      {open && (
        <div className="party-body">
          <ul className="party-list">
            {characters.map((c) => (
              <li key={c.id} className="party-member">
                <div className="party-member-head">
                  <span>
                    <strong>{c.name}</strong> — {c.concept}
                  </span>
                  {!readOnly && (
                    <span className="party-member-actions">
                      <button onClick={() => startEdit(c)}>Bearbeiten</button>
                      <button
                        onClick={() => {
                          if (confirm(`${c.name} wirklich entfernen?`)) onDelete(c.id);
                        }}
                      >
                        Entfernen
                      </button>
                    </span>
                  )}
                </div>
                {c.narrative && Object.keys(c.narrative).length > 0 && (
                  <button
                    className="party-member-expand"
                    onClick={() => setExpanded((e) => ({ ...e, [c.id]: !e[c.id] }))}
                  >
                    {expanded[c.id] ? "Details verbergen" : "Details anzeigen"}
                  </button>
                )}
                {expanded[c.id] && c.narrative && (
                  <dl className="party-narrative">
                    {c.narrative.personality && (
                      <>
                        <dt>Wesenszug</dt>
                        <dd>{c.narrative.personality}</dd>
                      </>
                    )}
                    {c.narrative.ideal && (
                      <>
                        <dt>Ideal</dt>
                        <dd>{c.narrative.ideal}</dd>
                      </>
                    )}
                    {c.narrative.bond && (
                      <>
                        <dt>Bindung</dt>
                        <dd>{c.narrative.bond}</dd>
                      </>
                    )}
                    {c.narrative.flaw && (
                      <>
                        <dt>Makel</dt>
                        <dd>{c.narrative.flaw}</dd>
                      </>
                    )}
                    {c.narrative.appearance && (
                      <>
                        <dt>Aussehen</dt>
                        <dd>{c.narrative.appearance}</dd>
                      </>
                    )}
                    {c.narrative.backstory && (
                      <>
                        <dt>Hintergrund</dt>
                        <dd>{c.narrative.backstory}</dd>
                      </>
                    )}
                  </dl>
                )}
              </li>
            ))}
          </ul>

          {!readOnly && !form && <button onClick={startAdd}>Charakter hinzufügen</button>}

          {!readOnly && form && (
            <div className="party-form">
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Name"
              />
              <input
                value={form.concept}
                onChange={(e) => setForm({ ...form, concept: e.target.value })}
                placeholder="Konzept (z. B. Zwergischer Krieger)"
              />
              <button type="button" onClick={() => setMoreDetails((m) => !m)}>
                {moreDetails ? "Weniger Details" : "Mehr Details"}
              </button>
              {moreDetails && (
                <>
                  <textarea
                    value={form.narrative.personality ?? ""}
                    onChange={(e) => setNarrativeField("personality", e.target.value)}
                    placeholder="Wesenszug"
                  />
                  <textarea
                    value={form.narrative.ideal ?? ""}
                    onChange={(e) => setNarrativeField("ideal", e.target.value)}
                    placeholder="Ideal"
                  />
                  <textarea
                    value={form.narrative.bond ?? ""}
                    onChange={(e) => setNarrativeField("bond", e.target.value)}
                    placeholder="Bindung"
                  />
                  <textarea
                    value={form.narrative.flaw ?? ""}
                    onChange={(e) => setNarrativeField("flaw", e.target.value)}
                    placeholder="Makel"
                  />
                  <textarea
                    value={form.narrative.appearance ?? ""}
                    onChange={(e) => setNarrativeField("appearance", e.target.value)}
                    placeholder="Aussehen"
                  />
                  <textarea
                    value={form.narrative.backstory ?? ""}
                    onChange={(e) => setNarrativeField("backstory", e.target.value)}
                    placeholder="Hintergrund"
                  />
                </>
              )}
              <div className="party-form-actions">
                <button onClick={submit}>Speichern</button>
                <button onClick={() => setForm(null)}>Abbrechen</button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

type PendingTurn = { kind: "action" | "roll"; text: string; failed: boolean };

function pendingTurnText(t: PendingTurn): string {
  return t.kind === "roll" ? `[Würfelergebnis: ${t.text}]` : t.text;
}

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
  const [pendingTurn, setPendingTurn] = useState<PendingTurn | null>(null);

  const id = state.campaign.id;
  const pending = state.pendingDice;
  const finished = state.campaign.status === "finished";

  // Shown in the transcript immediately (optimistic) and kept around on failure
  // so "Erneut senden" can resubmit the exact same text without retyping. The
  // backend never persists on a malformed GM reply, so this is the only record
  // of the attempt until it succeeds.
  async function submitPlay(kind: "action" | "roll", text: string) {
    setPendingTurn({ kind, text, failed: false });
    setBusy(true);
    setError(null);
    try {
      const next = kind === "action" ? await api.action(id, text) : await api.roll(id, text);
      setState(next);
      setPendingTurn(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPendingTurn({ kind, text, failed: true });
    } finally {
      setBusy(false);
    }
  }

  function resend() {
    if (!pendingTurn) return;
    submitPlay(pendingTurn.kind, pendingTurn.text);
  }

  async function refetchState() {
    try {
      setState(await api.getState(id));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function createCharacter(inputData: CharacterInput): Promise<boolean> {
    try {
      await api.createCharacter(id, inputData);
      await refetchState();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    }
  }

  async function updateCharacter(cid: string, patch: CharacterInput): Promise<boolean> {
    try {
      await api.updateCharacter(id, cid, patch);
      await refetchState();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    }
  }

  async function deleteCharacter(cid: string) {
    try {
      await api.deleteCharacter(id, cid);
      await refetchState();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function submitAction() {
    if (!input.trim()) return;
    const text = input;
    setInput("");
    await submitPlay("action", text);
  }

  async function submitRoll() {
    if (!roll.trim()) return;
    const r = roll;
    setRoll("");
    await submitPlay("roll", r);
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

      <PartyPanel
        characters={state.characters}
        readOnly={finished}
        onCreate={createCharacter}
        onUpdate={updateCharacter}
        onDelete={deleteCharacter}
      />

      <section className="transcript">
        {state.turns.map((t, i) => (
          <p key={i} className={t.role}>
            <strong>{t.role === "gm" ? "SL" : "Ihr"}:</strong> {t.text}
          </p>
        ))}
        {pendingTurn && (
          <p className={`player pending${pendingTurn.failed ? " failed" : ""}`}>
            <strong>Ihr:</strong> {pendingTurnText(pendingTurn)}
          </p>
        )}
      </section>

      {error && <p className="error">{error}</p>}
      {pendingTurn?.failed && (
        <button className="resend" onClick={resend} disabled={busy}>
          Erneut senden
        </button>
      )}
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
