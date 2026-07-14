import { describe, it, expect, vi, afterEach } from "vitest";
import { createNimCaller } from "./nimCaller.js";

const fetchMock = vi.fn();

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

describe("createNimCaller", () => {
  it("posts an OpenAI-shaped request and extracts the message content", async () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"narration":"hi","diceRequest":null}' } }],
      }),
    });

    const call = createNimCaller("nvapi-test", "meta/llama-3.3-70b-instruct");
    const result = await call({
      system: "system prompt",
      messages: [{ role: "user", content: "hello" }],
    });

    expect(result).toBe('{"narration":"hi","diceRequest":null}');
    expect(fetchMock).toHaveBeenCalledWith(
      "https://integrate.api.nvidia.com/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer nvapi-test",
          "Content-Type": "application/json",
        }),
      }),
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toEqual({
      model: "meta/llama-3.3-70b-instruct",
      messages: [
        { role: "system", content: "system prompt" },
        { role: "user", content: "hello" },
      ],
      max_tokens: 4000,
    });
  });

  it("throws when the response has no message content", async () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ choices: [] }) });

    const call = createNimCaller("nvapi-test", "meta/llama-3.3-70b-instruct");
    await expect(
      call({ system: "s", messages: [{ role: "user", content: "hi" }] }),
    ).rejects.toThrow();
  });

  it("throws when the HTTP response is not ok", async () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => "Unauthorized",
    });

    const call = createNimCaller("nvapi-test", "meta/llama-3.3-70b-instruct");
    await expect(
      call({ system: "s", messages: [{ role: "user", content: "hi" }] }),
    ).rejects.toThrow(/401/);
  });
});
