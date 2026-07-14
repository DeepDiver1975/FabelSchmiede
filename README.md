# rpg.ai — AI Dungeon Master (Fun-Test)

Smallest possible test of whether an AI GM is fun: one hardcoded German D&D
scene, Claude narrates via AWS Bedrock, you roll your own physical dice.

## Prerequisites
- Node 20+
- AWS account with Bedrock access to `anthropic.claude-opus-4-8` in your region

## Setup
```bash
cp .env.example .env    # fill in AWS_REGION + credentials
npm install
npm run dev             # backend on :8787, frontend on :5173
```
No AWS account? Set `LLM_PROVIDER=nim` and `NVIDIA_API_KEY` in `.env` instead,
using a free API key from [build.nvidia.com](https://build.nvidia.com).
Open the frontend URL (printed by Vite) in a browser. Everyone plays on the one screen.

## Notes
- State is in memory. Refresh = restart the scene.
- The app never rolls dice — it asks you for the result.
