import { describe, it, expect } from "vitest";
import { createNimTtsSynthesizer } from "./nimTtsSynthesizer.js";

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
});
