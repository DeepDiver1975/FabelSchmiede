import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { pcmToWav } from "./wav.js";
import type { TtsSynthesizer } from "./tts.js";

// LINEAR_PCM = 1 (riva_audio.proto AudioEncoding): 16-bit signed LE samples.
const LINEAR_PCM = 1;
// NVIDIA's hosted Riva TTS behind NVIDIA Cloud Functions (NVCF). The function-id
// selects the Magpie multilingual model; the API key authorizes the call.
const NVCF_HOST = "grpc.nvcf.nvidia.com:443";
// The Magpie ensemble rejects any request whose INPUT text exceeds this many
// characters ("Input text is larger than the maximum input length: N > 2000").
// Streaming does not lift this cap — it only chunks the audio OUTPUT. Callers are
// expected to keep narration well under it (see the length rule in prompt.ts);
// this guard exists so an over-limit turn fails with a clear message instead of
// an opaque Triton gRPC error.
const MAGPIE_MAX_INPUT_CHARS = 2000;

export type NimTtsOptions = {
  voice: string; // e.g. "Magpie-Multilingual.DE-DE.Pascal"
  languageCode: string; // e.g. "de-DE"
  functionId: string;
  sampleRate: number; // Hz, e.g. 44100
};

type SynthClient = grpc.Client & {
  SynthesizeOnline: (md: grpc.Metadata) => grpc.ClientDuplexStream<unknown, { audio?: Buffer }>;
};

function loadClient(): SynthClient {
  const here = dirname(fileURLToPath(import.meta.url));
  const def = protoLoader.loadSync("riva/proto/riva_tts.proto", {
    keepCase: true, // keep snake_case fields (language_code, voice_name, …)
    longs: String,
    enums: Number,
    defaults: true,
    includeDirs: [resolve(here, "../proto")],
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pkg = grpc.loadPackageDefinition(def) as any;
  const Svc = pkg.nvidia.riva.tts.RivaSpeechSynthesis;
  return new Svc(NVCF_HOST, grpc.credentials.createSsl()) as SynthClient;
}

// Build a synthesizer backed by NVIDIA NIM Magpie TTS. Uses SynthesizeOnline
// (server-streaming) so the audio OUTPUT streams back as PCM chunks — the offline
// mode caps ~20 s/call. Note this does NOT lift the input-text cap: Magpie still
// rejects any request whose text exceeds MAGPIE_MAX_INPUT_CHARS. Streamed PCM
// chunks are accumulated and wrapped as one WAV blob, which the audio endpoint caches.
export function createNimTtsSynthesizer(apiKey: string, opts: NimTtsOptions): TtsSynthesizer {
  const client = loadClient();
  return (text) =>
    new Promise((res, rej) => {
      if (text.length > MAGPIE_MAX_INPUT_CHARS) {
        rej(
          new Error(
            `Erzähltext zu lang für die Sprachausgabe: ${text.length} Zeichen ` +
              `(Magpie erlaubt höchstens ${MAGPIE_MAX_INPUT_CHARS}).`,
          ),
        );
        return;
      }
      const md = new grpc.Metadata();
      md.set("function-id", opts.functionId);
      md.set("authorization", `Bearer ${apiKey}`);
      const chunks: Buffer[] = [];
      const call = client.SynthesizeOnline(md);
      call.on("data", (r: { audio?: Buffer }) => {
        if (r.audio) chunks.push(Buffer.from(r.audio));
      });
      call.on("error", rej);
      call.on("end", () => {
        const pcm = Buffer.concat(chunks);
        if (pcm.length === 0) {
          rej(new Error("NIM TTS returned no audio"));
          return;
        }
        res({ audio: pcmToWav(pcm, opts.sampleRate), contentType: "audio/wav", charCount: text.length });
      });
      call.write({
        text,
        language_code: opts.languageCode,
        encoding: LINEAR_PCM,
        sample_rate_hz: opts.sampleRate,
        voice_name: opts.voice,
      });
      call.end();
    });
}
