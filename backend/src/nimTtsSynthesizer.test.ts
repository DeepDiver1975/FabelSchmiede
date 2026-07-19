import { describe, it, expect } from "vitest";
import { createNimTtsSynthesizer, sanitizeForTts } from "./nimTtsSynthesizer.js";

// Magpie garbles the audio around raw en-dash (U+2013) and em-dash (U+2014)
// characters. German narration produces them constantly as a Gedankenstrich
// (a spaced clause break) and as number ranges. sanitizeForTts rewrites them
// into speakable equivalents before they ever reach the wire.
describe("sanitizeForTts", () => {
  it("turns a spaced clause-break dash into a comma pause", () => {
    expect(sanitizeForTts("Er zögerte – dann rannte er.")).toBe("Er zögerte, dann rannte er.");
    expect(sanitizeForTts("Er zögerte — dann rannte er.")).toBe("Er zögerte, dann rannte er.");
  });

  it("reads a number range with a dash as 'bis'", () => {
    expect(sanitizeForTts("Eine Gruppe der Stufe 1–3.")).toBe("Eine Gruppe der Stufe 1 bis 3.");
    expect(sanitizeForTts("Stufe 1 – 3")).toBe("Stufe 1 bis 3");
  });

  it("leaves text without dashes untouched", () => {
    expect(sanitizeForTts("Ein ganz normaler Satz.")).toBe("Ein ganz normaler Satz.");
  });

  it("leaves ordinary ASCII hyphens in compounds untouched", () => {
    expect(sanitizeForTts("Dungeons-und-Dragons")).toBe("Dungeons-und-Dragons");
  });

  it("removes any stray en/em dash so none reaches the synthesizer", () => {
    expect(sanitizeForTts("Wort–Wort")).not.toMatch(/[–—]/);
    expect(sanitizeForTts("Ende –")).not.toMatch(/[–—]/);
  });
});

// The live gRPC path is exercised by scripts/tts-spike.ts and manual E2E (it
// needs a real NVIDIA_API_KEY and network). Here we only verify the factory
// wires up offline: loading the vendored Riva protos and constructing the gRPC
// client must not throw, and it must hand back a callable synthesizer. Creating
// a gRPC client does not open a connection, so this stays network-free.
describe("createNimTtsSynthesizer", () => {
  it("loads the protos, builds a client, and returns a synthesizer function", () => {
    const synth = createNimTtsSynthesizer("test-key", {
      voice: "Magpie-Multilingual.DE-DE.Pascal",
      languageCode: "de-DE",
      functionId: "877104f7-e885-42b9-8de8-f6e4c6303969",
      sampleRate: 44100,
    });
    expect(typeof synth).toBe("function");
  });

  it("rejects text over Magpie's 2000-char input limit with a clear message, before any network call", async () => {
    // Magpie caps INPUT text at 2000 chars regardless of streaming; SynthesizeOnline
    // only streams the audio OUTPUT. Sending more yields an opaque Triton gRPC error,
    // so guard up front with a message that names the limit and the actual length.
    const synth = createNimTtsSynthesizer("test-key", {
      voice: "Magpie-Multilingual.DE-DE.Pascal",
      languageCode: "de-DE",
      functionId: "877104f7-e885-42b9-8de8-f6e4c6303969",
      sampleRate: 44100,
    });
    await expect(synth("a".repeat(2001))).rejects.toThrow(/2001.*2000|2000.*2001|Zeichen/);
  });
});
