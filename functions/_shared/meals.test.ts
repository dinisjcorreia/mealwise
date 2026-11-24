import { afterEach, expect, it, vi } from "vitest";
import { onRequestPost } from "../api/meals/analyze";
import type { Env } from "./env";

const env: Env = { SUPABASE_URL: "https://test.supabase.co", SUPABASE_ANON_KEY: "test", SUPABASE_SERVICE_ROLE_KEY: "test", GEMINI_API_KEY: "test" };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
function request(mock = false) {
  const body = new FormData(); body.set("description", "1 ovo"); body.set("mealDate", "2026-10-06");
  return { request: new Request("https://app.test/api/meals/analyze", { method: "POST", headers: { Authorization: "Bearer test" }, body }),
    env: { ...env, MOCK_GEMINI: String(mock) } } as Parameters<typeof onRequestPost>[0];
}
afterEach(() => vi.unstubAllGlobals());

it("does not create a draft or upload if AI fails", async () => {
  const fetch = vi.fn().mockResolvedValueOnce(json({ id: "user" }))
    .mockResolvedValue(new Response("quota", { status: 429 }));
  vi.stubGlobal("fetch", fetch);
  const response = await onRequestPost(request()) as Response;
  expect(response.ok).toBe(false);
  expect(fetch.mock.calls.slice(1).every(([url]) => String(url).includes("generativelanguage.googleapis.com"))).toBe(true);
});

it("returns the persisted draft after a failed save so retry does not create another meal", async () => {
  const draft = { id: "meal", updated_at: "2026-10-06T10:00:00Z", status: "pending", photo_path: null,
    meal_items: [], clarification_question: "Confirma os alimentos" };
  const fetch = vi.fn().mockResolvedValueOnce(json({ id: "user" })).mockResolvedValueOnce(json([draft]))
    .mockResolvedValueOnce(json({ message: "failed" }, 503)).mockResolvedValueOnce(json([draft]));
  vi.stubGlobal("fetch", fetch);
  const response = await onRequestPost(request(true)) as Response;
  expect(response.ok).toBe(true);
  expect(await response.json()).toMatchObject({ meal: { id: "meal", status: "pending" }, warning: expect.any(String) });
  expect(fetch.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(2);
});
