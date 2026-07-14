// A text-to-speech synthesizer: given narration text, return one audio blob
// ready to serve to the browser. Mirrors the LlmCaller abstraction — the server
// depends on this interface, not on any concrete provider. `charCount` is the
// length of the synthesized text, kept only as a hook for future cost tracking
// (#4).
export type TtsSynthesizer = (
  text: string,
) => Promise<{ audio: Buffer; contentType: string; charCount: number }>;
