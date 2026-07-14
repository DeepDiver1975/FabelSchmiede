// Shared prose rendering for GM narration and retold stories.
//
// LLM narration arrives as a single string that may contain paragraph breaks
// (blank lines) or, at worst, single newlines. HTML collapses that whitespace,
// so without this the text renders as one undifferentiated block — hard to read
// from across the table. Split it into paragraphs for the render layer.

// Split narration into paragraphs. Prefer blank-line separation; fall back to
// single newlines when the model only emitted those. Empty pieces are dropped.
export function splitParagraphs(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const byBlankLine = trimmed.split(/\n\s*\n/);
  const parts = byBlankLine.length > 1 ? byBlankLine : trimmed.split(/\n/);
  return parts.map((p) => p.trim()).filter((p) => p.length > 0);
}
