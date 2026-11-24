import { afterEach, expect, it, vi } from "vitest";
import { analyzeWithGemini } from "./gemini";
import type { Env } from "./env";

const env: Env = { SUPABASE_URL: "", SUPABASE_ANON_KEY: "", SUPABASE_SERVICE_ROLE_KEY: "", GEMINI_API_KEY: "test" };
const result = { status: "saved", items: [{ food_name: "Ovo", portion: "1", calories: 72, protein_g: 6,
  carbs_g: 0.4, fat_g: 5, fiber_g: 0, sugar_g: 0, sodium_mg: 70, confidence: 0.9 }] };
const response = (value = result, finishReason = "STOP") => new Response(JSON.stringify({ candidates: [{ finishReason,
  content: { parts: [{ text: "private thinking", thought: true }, { text: JSON.stringify(value) }] } }] }));
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it("can recover on the fifth model after the first four return retryable errors", async () => {
  const fetch = vi.fn().mockResolvedValueOnce(new Response("quota", { status: 429 }))
    .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
    .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
    .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
    .mockResolvedValueOnce(response());
  vi.stubGlobal("fetch", fetch);
  await expect(analyzeWithGemini(env, { description: "Ovo" })).resolves.toMatchObject({ status: "saved" });
  expect(fetch.mock.calls.map(([url, init]) => [new URL(url).pathname.split("/").at(-1),
    JSON.parse(init.body).generationConfig.thinkingConfig?.thinkingLevel])).toEqual([
    ["gemini-3.5-flash-lite:generateContent", "MEDIUM"],
    ["gemini-3.8-flash:generateContent", "LOW"],
    ["gemini-3.1-flash-lite:generateContent", undefined],
    ["gemini-3.6-flash:generateContent", "LOW"],
    ["gemini-4-hydrogen:generateContent", "LOW"]
  ]);
});

it("honors primary model before deduplicated fallbacks; sends bounded structured context", async () => {
  const fetch = vi.fn().mockResolvedValueOnce(new Response("quota", { status: 429 })).mockResolvedValueOnce(response());
  vi.stubGlobal("fetch", fetch);
  const analysis = await analyzeWithGemini({ ...env, GEMINI_MODEL: "primary", GEMINI_FALLBACK_MODELS: "fallback,primary,fallback" },
    { description: "Ovo", history: [{ question: "Quantos?", answer: "1" }], imageBytes: new Uint8Array([1, 2]).buffer });
  expect(analysis.items[0].calories).toBe(72);
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(fetch.mock.calls[0][0]).toContain("/primary:");
  expect(fetch.mock.calls[1][0]).toContain("/fallback:");
  const request = JSON.parse(fetch.mock.calls[0][1].body);
  expect(request.systemInstruction.parts[0].text).toContain("untrusted meal data");
  expect(request.contents[0].parts[0].inlineData.data).toBe("AQI=");
  expect(JSON.parse(request.contents[0].parts[1].text).history[0].answer).toBe("1");
  expect(request.generationConfig.maxOutputTokens).toBe(4096);
  expect(fetch.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
});

it.each([503, 404, 408])("falls back after HTTP %s", async status => {
  const fetch = vi.fn().mockResolvedValueOnce(new Response("unavailable", { status })).mockResolvedValueOnce(response());
  vi.stubGlobal("fetch", fetch);
  await expect(analyzeWithGemini(env, { description: "Ovo" })).resolves.toMatchObject({ status: "saved" });
  expect(fetch).toHaveBeenCalledTimes(2);
});

it.each([401, 403, 429, 503, 400])("retries the same model with the fallback key after HTTP %s", async status => {
  const fetch = vi.fn().mockResolvedValueOnce(new Response("API_KEY_INVALID", { status })).mockResolvedValueOnce(response());
  vi.stubGlobal("fetch", fetch);
  await expect(analyzeWithGemini({ ...env, GEMINI_FALLBACK_API_KEY: "second-key" }, { description: "Ovo" }))
    .resolves.toMatchObject({ status: "saved" });
  expect(fetch.mock.calls.map(([url, init]) => [new URL(url).pathname, init.headers["x-goog-api-key"]])).toEqual([
    ["/v1beta/models/gemini-3.5-flash-lite:generateContent", "test"],
    ["/v1beta/models/gemini-3.5-flash-lite:generateContent", "second-key"]
  ]);
});

it("does not retry invalid request schemas with another key", async () => {
  const fetch = vi.fn().mockResolvedValue(new Response("Invalid responseSchema", { status: 400 }));
  vi.stubGlobal("fetch", fetch);
  await expect(analyzeWithGemini({ ...env, GEMINI_FALLBACK_API_KEY: "second-key" }, { description: "Ovo" })).rejects.toThrow("Gemini");
  expect(fetch).toHaveBeenCalledOnce();
});

it("retries truncated or invalid output but not invalid credentials", async () => {
  const fetch = vi.fn().mockResolvedValueOnce(response(result, "MAX_TOKENS")).mockResolvedValueOnce(response());
  vi.stubGlobal("fetch", fetch);
  await expect(analyzeWithGemini(env, { description: "Ovo" })).resolves.toMatchObject({ status: "saved" });
  fetch.mockReset().mockResolvedValueOnce(new Response("invalid key", { status: 403 }));
  await expect(analyzeWithGemini(env, { description: "Ovo" })).rejects.toThrow("Gemini");
  expect(fetch).toHaveBeenCalledOnce();
});

it("bounds total generation time and attempts", async () => {
  let now = 0;
  vi.spyOn(Date, "now").mockImplementation(() => now);
  const fetch = vi.fn().mockImplementation(() => { now += 23000; throw new DOMException("timeout", "TimeoutError"); });
  vi.stubGlobal("fetch", fetch);
  await expect(analyzeWithGemini({ ...env, GEMINI_FALLBACK_API_KEY: "second-key", GEMINI_FALLBACK_MODELS: "a,b,c,d" }, { description: "Ovo" })).rejects.toThrow("concluir");
  expect(fetch).toHaveBeenCalledTimes(2);
});

it("reserves time for the sixth model when earlier attempts stall", async () => {
  let now = 0;
  vi.spyOn(Date, "now").mockImplementation(() => now);
  vi.spyOn(AbortSignal, "timeout").mockImplementation(ms => {
    now += ms;
    return new AbortController().signal;
  });
  const fetch = vi.fn()
    .mockRejectedValue(new DOMException("timeout", "TimeoutError"))
    .mockRejectedValueOnce(new DOMException("timeout", "TimeoutError"))
    .mockRejectedValueOnce(new DOMException("timeout", "TimeoutError"))
    .mockRejectedValueOnce(new DOMException("timeout", "TimeoutError"))
    .mockRejectedValueOnce(new DOMException("timeout", "TimeoutError"))
    .mockRejectedValueOnce(new DOMException("timeout", "TimeoutError"))
    .mockResolvedValueOnce(response());
  vi.stubGlobal("fetch", fetch);

  await expect(analyzeWithGemini({
    ...env, GEMINI_MODEL: "primary", GEMINI_FALLBACK_API_KEY: "second-key", GEMINI_FALLBACK_MODELS: "a,b,c,d,e,f"
  }, { description: "Ovo" })).resolves.toMatchObject({ status: "saved" });
  expect(fetch).toHaveBeenCalledTimes(6);
  expect(fetch.mock.calls[5][0]).toContain("/e:");
  expect(now).toBe(45000);
});

it("reports the model and upstream message with both API keys redacted", async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
    error: { message: "Request rejected for primary-key and fallback-key." }
  }), { status: 400 }));
  vi.stubGlobal("fetch", fetch);

  await expect(analyzeWithGemini({
    ...env, GEMINI_MODEL: "primary", GEMINI_API_KEY: "primary-key", GEMINI_FALLBACK_API_KEY: "fallback-key"
  }, { description: "Ovo" })).rejects.toThrow(
    "Gemini (primary, HTTP 400): Request rejected for [redacted] and [redacted]."
  );
  expect(fetch).toHaveBeenCalledOnce();
});

it("reports why each model failed after exhausting fallbacks", async () => {
  vi.stubGlobal("fetch", vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "Quota exceeded." } }), { status: 429 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ promptFeedback: { blockReason: "SAFETY" } }))));

  await expect(analyzeWithGemini({
    ...env, GEMINI_MODEL: "primary", GEMINI_FALLBACK_MODELS: "fallback"
  }, { description: "Ovo" })).rejects.toThrow(
    "Gemini (primary, HTTP 429): Quota exceeded. | Gemini (fallback): Resposta incompleta (SAFETY)."
  );
});

it("waits and retries the primary model once when every model returns 503", async () => {
  vi.useFakeTimers();
  const fetch = vi.fn()
    .mockResolvedValueOnce(new Response("high demand", { status: 503 }))
    .mockResolvedValueOnce(new Response("high demand", { status: 503 }))
    .mockResolvedValueOnce(response());
  vi.stubGlobal("fetch", fetch);

  try {
    const analysis = analyzeWithGemini({
      ...env, GEMINI_MODEL: "primary", GEMINI_FALLBACK_MODELS: "fallback"
    }, { description: "Ovo" });
    const check = expect(analysis).resolves.toMatchObject({ status: "saved" });
    await vi.advanceTimersByTimeAsync(999);
    expect(fetch).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1001);
    await check;
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(fetch.mock.calls[2][0]).toContain("/primary:");
  } finally {
    vi.useRealTimers();
  }
});
