import { useState, useEffect, useRef } from "react";
import {
  api,
  type State,
  type CharacterInput,
  type CombatState,
} from "./api.js";
import { PartyPanel } from "./PartyPanel.js";
import { splitParagraphs } from "./prose.js";

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

type PendingTurn = { kind: "action" | "roll" | "aside"; text: string; failed: boolean };

function pendingTurnText(t: PendingTurn): string {
  return t.kind === "roll" ? `[Würfelergebnis: ${t.text}]` : t.text;
}

function CombatPanel({
  combat,
  busy,
  onSubmitInitiative,
  onAdvance,
  onEnd,
}: {
  combat: CombatState;
  busy: boolean;
  onSubmitInitiative: (values: { id: string; value: number }[]) => void;
  onAdvance: () => void;
  onEnd: () => void;
}) {
  const [rolls, setRolls] = useState<Record<string, string>>({});
  const rolling = combat.phase === "rolling-initiative";
  const allFilled = combat.combatants.every((c) => {
    const v = rolls[c.id];
    return v !== undefined && v.trim() !== "" && Number.isFinite(Number(v));
  });

  function submit() {
    const values = combat.combatants.map((c) => ({ id: c.id, value: Number(rolls[c.id]) }));
    onSubmitInitiative(values);
  }

  return (
    <section className="combat-panel">
      <h2>
        ⚔️ Kampf
        {combat.phase === "in-turns" &&
          combat.combatants[combat.turnIndex] &&
          ` — Am Zug: ${combat.combatants[combat.turnIndex].name}`}
      </h2>
      {rolling ? (
        <>
          <p className="combat-hint">Initiative auswürfeln — für jede Figur einen W20 werfen (Gegner würfelt die SL):</p>
          <ul className="combat-init-list">
            {combat.combatants.map((c) => (
              <li key={c.id} className={`combat-init-row ${c.side}`}>
                <span className="combat-name">{c.name}</span>
                <input
                  type="number"
                  value={rolls[c.id] ?? ""}
                  onChange={(e) => setRolls((r) => ({ ...r, [c.id]: e.target.value }))}
                  placeholder="Initiative"
                  disabled={busy}
                />
              </li>
            ))}
          </ul>
          <button onClick={submit} disabled={busy || !allFilled}>Alle senden</button>
        </>
      ) : (
        <>
          <ol className="combat-order">
            {combat.combatants.map((c, i) => (
              <li
                key={c.id}
                className={`combat-order-row ${c.side}${c.defeated ? " defeated" : ""}${i === combat.turnIndex ? " current" : ""}`}
              >
                <span className="combat-init">{c.initiative ?? "—"}</span>
                <span className="combat-name">{c.name}</span>
                <span className="combat-hp">{c.defeated ? "besiegt" : `${c.hp}/${c.maxHp} TP`}</span>
              </li>
            ))}
          </ol>
          <div className="combat-actions">
            <button onClick={onAdvance} disabled={busy}>Zug beenden</button>
            <button onClick={onEnd} disabled={busy}>Kampf beenden</button>
          </div>
        </>
      )}
    </section>
  );
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

  async function submitInitiative(values: { id: string; value: number }[]) {
    setBusy(true);
    setError(null);
    try {
      setState(await api.submitInitiative(id, values));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  async function advanceTurn() {
    setBusy(true);
    setError(null);
    try {
      setState(await api.advanceTurn(id));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  async function endCombat() {
    if (!confirm("Kampf wirklich beenden?")) return;
    setBusy(true);
    setError(null);
    try {
      setState(await api.endCombat(id));
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
    <main className={`app${state.combat?.active ? " app-combat" : ""}`}>
      <div className="play-main">
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
            <div key={i} className={`turn ${t.role}${aside ? " aside" : ""}`}>
              <span className="speaker">
                {label}
                {state.ttsEnabled && t.role === "gm" && (
                  <button
                    className="turn-audio"
                    onClick={() => playTurn(t.seq)}
                    title="Vorlesen"
                  >
                    ▶
                  </button>
                )}
              </span>
              {splitParagraphs(t.text).map((para, j) => (
                <p key={j}>{para}</p>
              ))}
            </div>
          );
        })}
        {pendingTurn && (
          <div
            className={`turn player pending${pendingTurn.kind === "aside" ? " aside" : ""}${pendingTurn.failed ? " failed" : ""}`}
          >
            <span className="speaker">
              {pendingTurn.kind === "aside" ? "Ihr (Frage)" : "Ihr"}
            </span>
            {splitParagraphs(pendingTurnText(pendingTurn)).map((para, j) => (
              <p key={j}>{para}</p>
            ))}
          </div>
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
          <p>
            <strong>Wurf nötig:</strong>{" "}
            {state.combat?.phase === "in-turns" && state.combat.combatants[state.combat.turnIndex]
              ? `${state.combat.combatants[state.combat.turnIndex].name}: `
              : ""}
            {pending.reason} ({pending.hint})
          </p>
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
      </div>

      {state.combat?.active && (
        <aside className="combat-sidebar">
          <CombatPanel
            combat={state.combat}
            busy={busy}
            onSubmitInitiative={submitInitiative}
            onAdvance={advanceTurn}
            onEnd={endCombat}
          />
        </aside>
      )}
    </main>
  );
}
