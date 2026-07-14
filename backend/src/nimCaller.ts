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
        max_tokens: 4000,
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
