# Fabelschmiede — dein KI-Spielleiter

[![CI](https://github.com/DeepDiver1975/FabelSchmiede/actions/workflows/ci.yml/badge.svg)](https://github.com/DeepDiver1975/FabelSchmiede/actions/workflows/ci.yml)

An AI game master ("Spielleiter") for German-language D&D 5e-style tabletop
sessions, powered by **NVIDIA NIM** — sign up free at
[build.nvidia.com](https://build.nvidia.com), no AWS account required. Claude
narrates, a deterministic rule engine enforces the mechanics, you roll your
own physical dice. The name means "Fable Forge" — where the stories are
forged.

## Features
- **German-only Spielleiter** — narrates exclusively in natural modern
  German, in character, with distinct NPC voices.
- **Rules before vibes** — a small deterministic rule engine
  (`backend/src/ruleEngine.ts`) is the sole authority on ability, level, and
  resource-slot legality; the LLM narrates outcomes but never decides what's
  legal.
- **Physical dice, always** — the app never rolls for you; it asks for your
  result and narrates from there.
- **Spoken narration (optional)** — GM narration read aloud in a German voice
  via NVIDIA NIM Magpie TTS.
- **Single-screen play** — everyone plays pass-and-play on one browser tab.

## Quick start (NVIDIA NIM — recommended)
```bash
cp .env.example .env    # fill in NVIDIA_API_KEY
npm install
npm run dev             # backend on :8787, frontend on :5173
```
In `.env`, set:
```
LLM_PROVIDER=nim
NVIDIA_API_KEY=your-free-key-from-build.nvidia.com
```
`NIM_MODEL` defaults to `meta/llama-3.3-70b-instruct` and rarely needs
changing. Open the frontend URL printed by Vite in a browser — that's it.

### Alternatives
Already have Anthropic or AWS credentials? Set one of these in `.env` instead
(`LLM_PROVIDER` picks explicitly; if left unset, Anthropic takes precedence,
then Bedrock):
- **Anthropic API directly** — `ANTHROPIC_API_KEY`.
- **AWS Bedrock** — `AWS_REGION` (needs access to
  `us.anthropic.claude-opus-4-8` in that region).

## German storytelling voice (optional)
Set `TTS_PROVIDER=nim` in `.env` (reusing the same `NVIDIA_API_KEY`) to have
the GM's narration spoken aloud in German via NVIDIA NIM Magpie TTS. A 🔊/🔇
toggle in play mutes it for the table; each new narration autoplays and every
line has a ▶ replay button. Leave `TTS_PROVIDER` unset for text-only.

## Built for D&D
Fabelschmiede is built for D&D 5e-style play, not a generic multi-system
engine — the campaign prompts, tone, and rule engine are all shaped around
it. We're actively deepening this: more D&D-specific mechanics and
SRD-grounded content are on the roadmap, moving well past today's
lightweight ability/level/resource model.

## Notes
- Campaign state is persisted to a local SQLite database (`data/campaigns.db`)
  — refreshing or restarting the server picks up right where you left off.
- The app never rolls dice — it asks you for the result.
