import { useState } from "react";
import { type Character, type CharacterInput, type CharacterNarrative } from "./api.js";

type CharacterForm = { id?: string; name: string; concept: string; maxHp: string; narrative: CharacterNarrative };

const emptyForm: CharacterForm = { name: "", concept: "", maxHp: "", narrative: {} };

function cleanNarrative(n: CharacterNarrative): CharacterNarrative {
  const entries = Object.entries(n).filter(([, v]) => v?.trim());
  return Object.fromEntries(entries);
}

// The party roster + add/edit/delete UI. Shared by the play screen and the
// pre-adventure setup screen; `defaultOpen` lets setup show it expanded.
export function PartyPanel({
  characters,
  readOnly,
  onCreate,
  onUpdate,
  onDelete,
  defaultOpen = false,
}: {
  characters: Character[];
  readOnly: boolean;
  onCreate: (input: CharacterInput) => Promise<boolean>;
  onUpdate: (cid: string, patch: CharacterInput) => Promise<boolean>;
  onDelete: (cid: string) => Promise<void>;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [form, setForm] = useState<CharacterForm | null>(null);
  const [moreDetails, setMoreDetails] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  function startAdd() {
    setForm({ ...emptyForm });
    setMoreDetails(false);
  }

  function startEdit(c: Character) {
    setForm({ id: c.id, name: c.name, concept: c.concept, maxHp: c.maxHp != null ? String(c.maxHp) : "", narrative: { ...c.narrative } });
    setMoreDetails(true);
  }

  async function submit() {
    if (!form) return;
    const name = form.name.trim();
    const concept = form.concept.trim();
    if (!name || !concept) return;
    const cleaned = cleanNarrative(form.narrative);
    const parsedHp = form.maxHp.trim() === "" ? undefined : Number(form.maxHp);
    const maxHp = parsedHp !== undefined && Number.isFinite(parsedHp) && parsedHp > 0 ? parsedHp : undefined;
    let ok: boolean;
    if (form.id) {
      // Edit always submits the complete current narrative (even {}), so a
      // cleared field actually clears on the server (PATCH replaces wholesale).
      ok = await onUpdate(form.id, { name, concept, ...(maxHp !== undefined ? { maxHp } : {}), narrative: cleaned });
    } else {
      const input: CharacterInput = { name, concept };
      if (maxHp !== undefined) input.maxHp = maxHp;
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
                    {c.maxHp != null && <span className="party-hp"> · {c.maxHp} TP</span>}
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
              <input
                type="number"
                min="1"
                value={form.maxHp}
                onChange={(e) => setForm({ ...form, maxHp: e.target.value })}
                placeholder="Max. TP (z. B. 12)"
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
