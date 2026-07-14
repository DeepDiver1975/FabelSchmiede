import { describe, it, expect } from "vitest";
import { pcmToWav } from "./wav.js";

describe("pcmToWav", () => {
  const pcm = Buffer.from([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08]);
  const wav = pcmToWav(pcm, 44100);

  it("prepends a 44-byte header and copies the PCM through unchanged", () => {
    expect(wav.length).toBe(44 + pcm.length);
    expect(wav.subarray(44)).toEqual(pcm);
  });

  it("writes the RIFF/WAVE/fmt/data markers", () => {
    expect(wav.toString("ascii", 0, 4)).toBe("RIFF");
    expect(wav.toString("ascii", 8, 12)).toBe("WAVE");
    expect(wav.toString("ascii", 12, 16)).toBe("fmt ");
    expect(wav.toString("ascii", 36, 40)).toBe("data");
  });

  it("encodes PCM mono 16-bit format fields and the given sample rate", () => {
    expect(wav.readUInt16LE(20)).toBe(1); // audio format = PCM
    expect(wav.readUInt16LE(22)).toBe(1); // channels = mono
    expect(wav.readUInt32LE(24)).toBe(44100); // sample rate
    expect(wav.readUInt32LE(28)).toBe(44100 * 2); // byte rate = rate * blockAlign
    expect(wav.readUInt16LE(32)).toBe(2); // block align
    expect(wav.readUInt16LE(34)).toBe(16); // bits per sample
  });

  it("records both size fields relative to the PCM length", () => {
    expect(wav.readUInt32LE(4)).toBe(36 + pcm.length); // RIFF chunk size
    expect(wav.readUInt32LE(40)).toBe(pcm.length); // data chunk size
  });

  it("uses the sample rate it is given", () => {
    expect(pcmToWav(pcm, 22050).readUInt32LE(24)).toBe(22050);
  });
});
