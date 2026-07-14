import { useEffect, useState, type ReactNode } from "react";
import { api, type Story } from "./api.js";
import { splitParagraphs } from "./prose.js";

// Render the story markdown: "# " lines become headings, and the prose between
// them is broken into paragraphs via the shared splitter.
function renderStory(markdown: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let buffer: string[] = [];
  const flush = (key: string) => {
    splitParagraphs(buffer.join("\n")).forEach((p, i) =>
      nodes.push(<p key={`${key}-${i}`}>{p}</p>),
    );
    buffer = [];
  };
  markdown.split("\n").forEach((line, i) => {
    if (line.startsWith("# ")) {
      flush(`p${i}`);
      nodes.push(<h2 key={`h${i}`}>{line.slice(2)}</h2>);
    } else {
      buffer.push(line);
    }
  });
  flush("end");
  return nodes;
}

export function ReplayView({
  campaignId,
  campaignName,
  onBack,
}: {
  campaignId: string;
  campaignName: string;
  onBack: () => void;
}) {
  const [story, setStory] = useState<Story | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Show a cached story immediately if one exists.
  useEffect(() => {
    api
      .getStory(campaignId)
      .then(setStory)
      .catch((e) => {
        const msg = e instanceof Error ? e.message : String(e);
        // "Noch keine Geschichte erzählt." is the backend's 404 for no story yet — leave empty.
        if (!msg.includes("Noch keine Geschichte")) setError(msg);
      });
  }, [campaignId]);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      setStory(await api.generateStory(campaignId));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="app">
      <header>
        <h1>{campaignName}</h1>
        <div className="header-actions">
          <button onClick={onBack} disabled={busy}>← Übersicht</button>
          <button onClick={generate} disabled={busy}>
            {story ? "Neu erzählen" : "Als Geschichte erzählen"}
          </button>
        </div>
      </header>

      {error && <p className="error">{error}</p>}
      {busy && <p className="busy">Der Spielleiter verfasst die Geschichte…</p>}

      {story ? (
        <article className="story">{renderStory(story.markdown)}</article>
      ) : (
        !busy && <p className="hint">Noch keine Geschichte. Klicke „Als Geschichte erzählen“.</p>
      )}
    </main>
  );
}
