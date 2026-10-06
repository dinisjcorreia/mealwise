import { afterEach, describe, expect, it, vi } from "vitest";
import { createMeal, deleteMeal, uploadMealPhoto } from "./supabase";
import type { Env } from "./env";

const env: Env = { SUPABASE_URL: "https://example.supabase.co", SUPABASE_ANON_KEY: "test", SUPABASE_SERVICE_ROLE_KEY: "test" };
const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
afterEach(() => vi.unstubAllGlobals());

describe("meal photo storage", () => {
  it("rejects oversized/empty/unsupported files before uploading", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    for (const file of [new File([new Uint8Array(524289)], "big.jpg", { type: "image/jpeg" }),
      new File([], "empty.jpg", { type: "image/jpeg" }), new File(["svg"], "a.svg", { type: "image/svg+xml" })]) {
      await expect(uploadMealPhoto(env, "user", file)).rejects.toThrow("512 KB");
    }
    expect(fetch).not.toHaveBeenCalled();
    fetch.mockResolvedValue(response({}));
    await expect(uploadMealPhoto(env, "user", new File([new Uint8Array(524288)], "ok.jpg", { type: "image/jpeg" }))).resolves.toMatch(/^user\//);
  });

  it("deletes the owned photo through Storage before deleting the meal row", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(response([{ photo_path: "user/date/photo.jpg" }]))
      .mockResolvedValueOnce(response([])).mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetch);
    await expect(deleteMeal(env, "meal", "user")).resolves.toBe(true);
    expect(fetch.mock.calls[0][0]).toContain("user_id=eq.user");
    expect(fetch.mock.calls[1][0]).toContain("/storage/v1/object/meal-photos");
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ prefixes: ["user/date/photo.jpg"] });
    expect(fetch.mock.calls[2][1].method).toBe("DELETE");
  });

  it("preserves the meal on storage failure; refuses another user's photo", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(response([{ photo_path: "user/photo.jpg" }]))
      .mockResolvedValueOnce(response({ error: "unavailable" }, 503));
    vi.stubGlobal("fetch", fetch);
    await expect(deleteMeal(env, "meal", "user")).rejects.toThrow("unavailable");
    expect(fetch).toHaveBeenCalledTimes(2);
    fetch.mockReset().mockResolvedValueOnce(response([{ photo_path: "other/photo.jpg" }]));
    await expect(deleteMeal(env, "meal", "user")).rejects.toThrow("inválido");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("supports text-only deletion and missing meals without storage writes", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(response([{ photo_path: null }]))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetch);
    await expect(deleteMeal(env, "meal", "user")).resolves.toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
    fetch.mockReset().mockResolvedValueOnce(response([]));
    await expect(deleteMeal(env, "missing", "user")).resolves.toBe(false);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("cleans up an upload on failed insert only after proving no committed reference exists", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(response({ error: "insert failed" }, 400))
      .mockResolvedValueOnce(response([])).mockResolvedValueOnce(response([]));
    vi.stubGlobal("fetch", fetch);
    const input = { userId: "user", photoPath: "user/photo.jpg", description: null, mealDate: "2026-10-06" };
    await expect(createMeal(env, input)).rejects.toThrow("insert failed");
    expect(fetch.mock.calls[2][0]).toContain("/storage/v1/object/meal-photos");
    fetch.mockReset().mockRejectedValueOnce(new Error("lost response"))
      .mockResolvedValueOnce(response([{ id: "committed-meal" }]));
    await expect(createMeal(env, input)).rejects.toThrow("lost response");
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
