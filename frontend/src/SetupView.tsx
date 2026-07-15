import { useState } from "react";
import { api, type State, type CharacterInput } from "./api.js";
import { PartyPanel } from "./PartyPanel.js";

// The pre-adventure setup screen. A campaign exists (plan generated) but has no
// opening yet; the party must be set up before the GM writes the opening scene.
// "Abenteuer beginnen" is gated on >=1 character, each with Max HP > 0 — the same
// bar the server's /begin endpoint enforces.
export function SetupView({
  initial,
  onBegin,
  onBack,
}: {
  initial: State;
  onBegin: (state: State) => void;
  onBack: () => void;
}) {
  const [state, setState] = useState<State>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const id = state.campaign.id;
  const characters = state.characters;
  const ready = characters.length >= 1 && characters.every((c) => c.maxHp != null && c.maxHp > 0);

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

  async function begin() {
    setBusy(true);
    setError(null);
    try {
      onBegin(await api.begin(id));
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
        </div>
      </header>

      {state.brief && (
        <section className="brief-panel">
          <div className="brief-body">
            <p className="brief-text">{state.brief.brief}</p>
          </div>
        </section>
      )}

      <p className="setup-hint">
        Richte zuerst deine Gruppe ein — jede Figur braucht Name, Konzept und Max. TP.
        Danach schreibt der Spielleiter die Eröffnungsszene.
      </p>

      <PartyPanel
        characters={characters}
        readOnly={false}
        onCreate={createCharacter}
        onUpdate={updateCharacter}
        onDelete={deleteCharacter}
        defaultOpen
      />

      {error && <p className="error">{error}</p>}

      <button className="begin-adventure" onClick={begin} disabled={busy || !ready}>
        {busy ? "Der Spielleiter bereitet vor…" : "Abenteuer beginnen"}
      </button>
      {!ready && (
        <p className="setup-hint">Mindestens eine Figur mit Max. TP wird benötigt.</p>
      )}
    </main>
  );
}
