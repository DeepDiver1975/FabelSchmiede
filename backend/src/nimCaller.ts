import type { LlmCaller } from "./gmEngine.js";

export function createNimCaller(apiKey: string, model: string): LlmCaller {
  return async ({ system, messages }) => {
    const response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        // OpenAI chat format has no separate system param — it's just the
        // first message with role "system".
        messages: [{ role: "system", content: system }, ...messages],
        // Reasoning NIM models (e.g. nemotron) spend a large, separate token
        // budget on reasoning before emitting the answer; 4000 could truncate
        // the JSON mid-output (finish_reason "length" → unparseable). Give ample
        // headroom so the structured reply always completes.
        max_tokens: 8000,
      }),
    });
    if (!response.ok) {
      throw new Error(`NVIDIA NIM request failed: ${response.status} ${await response.text()}`);
    }
    const data = (await response.json()) as {
      choices: { message: { content: string } }[];
    };
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      throw new Error("NVIDIA NIM response had no message content");
    }
    return content;
  };
}
