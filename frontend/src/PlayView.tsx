import { useState, useEffect, useRef } from "react";
import {
  api,
  type State,
  type Character,
  type CharacterInput,
  type CharacterNarrative,
  type CampaignBrief,
} from "./api.js";

type CharacterForm = { id?: string; name: string; concept: string; narrative: CharacterNarrative };

const emptyForm: CharacterForm = { name: "", concept: "", narrative: {} };

function CampaignBriefPanel({ brief }: { brief: State["brief"] }) {
  const [open, setOpen] = useState(false);
  if (!brief) return null;
  return (
    <section className="brief-panel">
      <button className="brief-toggle" onClick={() => setOpen((o) => !o)}>
        {open ? "▾" : "▸"} Kampagne: {brief.title}
      </button>
      {open && (
        <div className="brief-body">
          <p className="brief-text">{brief.brief}</p>
          {brief.locations.length > 0 && (
            <dl className="brief-locations">
              {brief.locations.map((l) => (
                <div key={l.name}>
                  <dt>{l.name}</dt>
                  <dd>{l.description}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      )}
    </section>
  );
}

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

type PendingTurn = { kind: "action" | "roll" | "aside"; text: string; failed: boolean };

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
  const [asideMode, setAsideMode] = useState(false);
  // TTS playback. One shared <audio> element; the mute choice persists so the
  // table can play silently. Audio errors are swallowed — the text always stays.
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastPlayedSeq = useRef(-1);
  const [muted, setMuted] = useState(() => localStorage.getItem("tts-muted") === "1");
  const [speaking, setSpeaking] = useState(false);

  const id = state.campaign.id;
  const pending = state.pendingDice;
  const finished = state.campaign.status === "finished";

  // Shown in the transcript immediately (optimistic) and kept around on failure
  // so "Erneut senden" can resubmit the exact same text without retyping. The
  // backend never persists on a malformed GM reply, so this is the only record
  // of the attempt until it succeeds.
  async function submitPlay(kind: "action" | "roll" | "aside", text: string) {
    setPendingTurn({ kind, text, failed: false });
    setBusy(true);
    setError(null);
    try {
      const next =
        kind === "roll"
          ? await api.roll(id, text)
          : await api.action(id, text, kind === "aside" ? "aside" : "story");
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
    if (asideMode) {
      setAsideMode(false); // one-shot toggle — back to normal action mode after sending
      await submitPlay("aside", text);
    } else {
      await submitPlay("action", text);
    }
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

  function playTurn(seq: number) {
    if (!state.ttsEnabled) return;
    let el = audioRef.current;
    if (!el) {
      el = new Audio();
      el.addEventListener("playing", () => setSpeaking(true));
      el.addEventListener("ended", () => setSpeaking(false));
      el.addEventListener("pause", () => setSpeaking(false));
      el.addEventListener("error", () => setSpeaking(false));
      audioRef.current = el;
    }
    el.src = api.turnAudioUrl(id, seq);
    // Autoplay policy or synthesis errors are non-fatal — the transcript stays.
    void el.play().catch(() => setSpeaking(false));
  }

  function toggleMuted() {
    setMuted((m) => {
      const next = !m;
      localStorage.setItem("tts-muted", next ? "1" : "0");
      if (next) audioRef.current?.pause();
      return next;
    });
  }

  // Autoplay the latest gm narration once, when it first appears. Every new gm
  // turn is marked seen even while muted, so unmuting never replays an old one.
  useEffect(() => {
    if (!state.ttsEnabled) return;
    const last = state.turns[state.turns.length - 1];
    if (!last || last.role !== "gm" || last.seq <= lastPlayedSeq.current) return;
    lastPlayedSeq.current = last.seq;
    if (!muted) playTurn(last.seq);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.turns]);

  return (
    <main className="app">
      <header>
        <h1>{state.campaign.name}</h1>
        <div className="header-actions">
          {state.ttsEnabled && (
            <button
              className={`tts-toggle${speaking ? " speaking" : ""}`}
              onClick={toggleMuted}
              title={muted ? "Sprachausgabe einschalten" : "Sprachausgabe stummschalten"}
            >
              {muted ? "🔇" : "🔊"}
            </button>
          )}
          <button onClick={onBack} disabled={busy}>← Übersicht</button>
          <button onClick={finish} disabled={busy}>Kampagne abschließen</button>
        </div>
      </header>

      <CampaignBriefPanel brief={state.brief} />

      <PartyPanel
        characters={state.characters}
        readOnly={finished}
        onCreate={createCharacter}
        onUpdate={updateCharacter}
        onDelete={deleteCharacter}
      />

      <section className="transcript">
        {state.turns.map((t, i) => {
          const aside = t.kind === "aside";
          const label = aside
            ? t.role === "gm"
              ? "SL (Antwort)"
              : "Ihr (Frage)"
            : t.role === "gm"
              ? "SL"
              : "Ihr";
          return (
            <p key={i} className={`${t.role}${aside ? " aside" : ""}`}>
              <strong>{label}:</strong> {t.text}
              {state.ttsEnabled && t.role === "gm" && (
                <button
                  className="turn-audio"
                  onClick={() => playTurn(t.seq)}
                  title="Vorlesen"
                >
                  ▶
                </button>
              )}
            </p>
          );
        })}
        {pendingTurn && (
          <p
            className={`player pending${pendingTurn.kind === "aside" ? " aside" : ""}${pendingTurn.failed ? " failed" : ""}`}
          >
            <strong>{pendingTurn.kind === "aside" ? "Ihr (Frage)" : "Ihr"}:</strong>{" "}
            {pendingTurnText(pendingTurn)}
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
          <button
            type="button"
            className={`aside-toggle${asideMode ? " active" : ""}`}
            onClick={() => setAsideMode((a) => !a)}
            disabled={busy}
            title="Nachfragen, ohne die Geschichte fortzusetzen"
          >
            ❓
          </button>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitAction()}
            placeholder={asideMode ? "Übrigens, frag nach etwas zur Spielwelt…" : "Was tut ihr?"}
            disabled={busy}
            autoFocus
          />
          <button onClick={submitAction} disabled={busy}>{asideMode ? "Fragen" : "Handeln"}</button>
        </section>
      )}
    </main>
  );
}
