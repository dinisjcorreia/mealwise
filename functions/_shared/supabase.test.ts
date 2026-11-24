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

it("batches photo signing and avoids signing during internal meal lookup", async () => {
  const { listMeals, getMeal } = await import("./supabase");
  const meals = [{ id: "a", photo_path: "user/a.jpg" }, { id: "b", photo_path: "user/b.jpg" }];
  const fetch = vi.fn().mockResolvedValueOnce(response(meals)).mockResolvedValueOnce(response([
    { path: "user/a.jpg", signedURL: "/object/sign/meal-photos/user/a.jpg?token=x" },
    { path: "user/b.jpg", signedURL: null }
  ]));
  vi.stubGlobal("fetch", fetch);
  const result = await listMeals(env, "user", "2026-10-06");
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(JSON.parse(fetch.mock.calls[1][1].body).paths).toEqual(["user/a.jpg", "user/b.jpg"]);
  expect(result[0].photo_url).toContain("/storage/v1/object/sign/");
  expect(result[1].photo_url).toBeNull();
  fetch.mockReset().mockResolvedValueOnce(response([meals[0]]));
  await getMeal(env, "a", "user");
  expect(fetch).toHaveBeenCalledOnce();
});

it("saves items, notes, history and version in one RPC; propagates conflicts", async () => {
  const { saveMealAnalysis } = await import("./supabase");
  const meal: import("../../src/shared/types").Meal = { id: "a", updated_at: "2026-10-06T10:00:00Z", photo_path: null, meal_items: [],
    description: null, status: "saved", meal_date: "2026-10-06", clarification_question: null, ai_notes: null, created_at: "2026-10-06T10:00:00Z" };
  const fetch = vi.fn().mockResolvedValueOnce(response(meal)); vi.stubGlobal("fetch", fetch);
  await saveMealAnalysis(env, meal, "user", { status: "needs_clarification", items: [], meal_name: null,
    notes: null, clarification_question: "Quantos?" }, { question: "Porção?", answer: "Pequena" });
  expect(fetch).toHaveBeenCalledOnce();
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({ p_items: null, p_user_id: "user",
    p_expected_updated_at: meal.updated_at, p_answer: "Pequena" });
  fetch.mockReset().mockResolvedValueOnce(response({ message: "MEAL_CONFLICT" }, 400));
  await expect(saveMealAnalysis(env, meal, "user", { status: "needs_clarification", items: [], meal_name: null,
    notes: null, clarification_question: "Quantos?" })).rejects.toMatchObject({ status: 409 });
  expect(fetch).toHaveBeenCalledOnce();
});

it("never signs/downloads another user's photo or a traversal path with the service role", async () => {
  const { signPhoto, downloadMealPhoto, listMeals } = await import("./supabase");
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  for (const path of ["other/photo.jpg", "user/../other/photo.jpg", "user/%2e%2e/other/photo.jpg", "user//photo.jpg"]) {
    await expect(signPhoto(env, "user", path)).resolves.toBeNull();
    await expect(downloadMealPhoto(env, "user", path)).rejects.toThrow("inválido");
  }
  expect(fetch).not.toHaveBeenCalled();
  fetch.mockResolvedValueOnce(response([{ id: "tampered", photo_path: "other/photo.jpg" }]));
  const meals = await listMeals(env, "user", "2026-10-06");
  expect(meals[0].photo_url).toBeNull();
  expect(fetch).toHaveBeenCalledOnce();
});
