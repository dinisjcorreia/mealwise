import type { DailyCreatine, DailyWater, Meal, MealAnalysis, UserProfile } from "../../src/shared/types";
import { json, requireEnv, type Env } from "./env";
import { MAX_MEAL_PHOTO_BYTES, MEAL_PHOTO_TYPES } from "../../src/shared/photos";

import { shouldSaveAnalysis } from "../../src/shared/gemini";

type MealRecord = Omit<Meal, "photo_url">;

function serviceHeaders(env: Env, extra: HeadersInit = {}): HeadersInit {
  const serviceRole = requireEnv(env, "SUPABASE_SERVICE_ROLE_KEY");
  return {
    apikey: serviceRole,
    Authorization: `Bearer ${serviceRole}`,
    ...extra
  };
}

async function supabaseFetch<T>(env: Env, path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${requireEnv(env, "SUPABASE_URL")}${path}`, {
    ...init,
    signal: AbortSignal.timeout(15000),
    headers: serviceHeaders(env, init.headers)
  });

  if (!response.ok) {
    const text = await response.text();
    if (response.status === 404 && text.toLowerCase().includes("bucket")) {
      throw new Error("Bucket de fotos não encontrado. Corre o ficheiro supabase/schema.sql no Supabase SQL Editor.");
    }
    if (text.includes("MEAL_CONFLICT")) throw json({ error: "A refeição mudou entretanto. Atualiza o dia e tenta novamente." }, { status: 409 });
    if (text.includes("MEAL_NOT_FOUND")) throw json({ error: "Refeição não encontrada." }, { status: 404 });
    if (text.includes("save_meal_analysis") && response.status === 404) {
      throw new Error("Atualização da base de dados em falta: supabase/meal-analysis.sql.");
    }
    throw new Error(text || `Supabase request failed: ${response.status}`);
  }

  if (response.status === 204) return undefined as T;
  const text = await response.text();
  if (!text.trim()) return undefined as T;

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(text);
  }
}

export async function uploadMealPhoto(env: Env, userId: string, file: File): Promise<string> {
  if (!MEAL_PHOTO_TYPES.includes(file.type) || file.size === 0 || file.size > MAX_MEAL_PHOTO_BYTES) {
    throw new Error("A foto tem de ser JPEG, PNG ou WebP e ter no máximo 512 KB.");
  }
  const ext = extensionFor(file.type);
  const path = `${userId}/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${ext}`;
  await supabaseFetch(env, `/storage/v1/object/meal-photos/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": file.type || "application/octet-stream",
      "x-upsert": "false"
    },
    body: await file.arrayBuffer()
  });
  return path;
}

async function deleteMealPhoto(env: Env, userId: string, path: string): Promise<void> {
  if (!ownedPhotoPath(userId, path)) throw new Error("Caminho da foto inválido.");
  await supabaseFetch(env, "/storage/v1/object/meal-photos", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prefixes: [path] })
  });
}

export async function downloadMealPhoto(env: Env, userId: string, path: string): Promise<{ bytes: ArrayBuffer; mimeType: string }> {
  if (!ownedPhotoPath(userId, path)) throw new Error("Caminho da foto inválido.");
  const response = await fetch(`${requireEnv(env, "SUPABASE_URL")}/storage/v1/object/meal-photos/${path}`, {
    headers: serviceHeaders(env),
    signal: AbortSignal.timeout(15000)
  });

  if (!response.ok) {
    throw new Error("Não foi possível carregar a foto da refeição.");
  }

  return {
    bytes: await response.arrayBuffer(),
    mimeType: response.headers.get("Content-Type") ?? "image/jpeg"
  };
}

export async function signPhoto(env: Env, userId: string, path: string): Promise<string | null> {
  if (!ownedPhotoPath(userId, path)) return null;
  const result = await supabaseFetch<{ signedURL?: string }>(env, `/storage/v1/object/sign/meal-photos/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ expiresIn: 3600 })
  }).catch(() => null);

  if (!result?.signedURL) return null;
  return `${requireEnv(env, "SUPABASE_URL")}/storage/v1${result.signedURL}`;
}

export async function createMeal(env: Env, input: {
  userId: string;
  photoPath: string | null;
  description: string | null;
  mealDate: string;
}): Promise<Meal> {
  const rows = await supabaseFetch<MealRecord[]>(env, "/rest/v1/meals", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "return=representation"
    },
    body: JSON.stringify([
      {
        user_id: input.userId,
        photo_path: input.photoPath,
        description: input.description,
        meal_date: input.mealDate,
        status: "pending",
        clarification_question: "A análise não ficou concluída. Confirma os alimentos e porções para tentar novamente."
      }
    ])
  }).catch(async (error: unknown) => {
    if (input.photoPath) {
      try {
        // A lost response can hide a committed insert. Only remove an unreferenced photo.
        const saved = await supabaseFetch<{ id: string }[]>(env,
          `/rest/v1/meals?user_id=eq.${encodeURIComponent(input.userId)}&photo_path=eq.${encodeURIComponent(input.photoPath)}&select=id&limit=1`);
        if (!saved.length) await deleteMealPhoto(env, input.userId, input.photoPath);
      } catch (cleanupError) {
        console.error("Failed to clean up unused meal photo", cleanupError);
      }
    }
    throw error;
  });

  return { ...rows[0], meal_items: [], photo_url: null };
}

export async function saveMealAnalysis(env: Env, existing: Meal, userId: string, analysis: MealAnalysis,
  clarification?: { question: string | null; answer: string }): Promise<Meal> {
  const meal = await supabaseFetch<MealRecord>(env, "/rest/v1/rpc/save_meal_analysis", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      p_meal_id: existing.id,
      p_user_id: userId,
      p_expected_updated_at: existing.updated_at,
      p_items: shouldSaveAnalysis(analysis) ? analysis.items : null,
      p_question: shouldSaveAnalysis(analysis) ? null : analysis.clarification_question,
      p_notes: analysis.notes,
      p_answer: clarification?.answer ?? null,
      p_answer_question: clarification?.question ?? null
    })
  });
  return withPhoto(env, meal, userId);
}

export async function getClarifications(env: Env, mealId: string): Promise<Array<{ question: string | null; answer: string }>> {
  const rows = await supabaseFetch<Array<{ question: string | null; answer: string }>>(env,
    `/rest/v1/clarifications?meal_id=eq.${encodeURIComponent(mealId)}&select=question,answer&order=created_at.desc,id.desc&limit=20`);
  // ponytail: last 20 exchanges bound prompt size; summarize history if longer conversations become common.
  return rows.reverse();
}

export async function deleteMeal(env: Env, mealId: string, userId: string): Promise<boolean> {
  const filter = `id=eq.${encodeURIComponent(mealId)}&user_id=eq.${encodeURIComponent(userId)}`;
  const rows = await supabaseFetch<{ photo_path: string | null }[]>(env,
    `/rest/v1/meals?${filter}&select=photo_path&limit=1`);
  if (!rows[0]) return false;
  // Keep the meal row on storage failure so the user can retry deletion.
  if (rows[0].photo_path) await deleteMealPhoto(env, userId, rows[0].photo_path);
  await supabaseFetch(
    env,
    `/rest/v1/meals?id=eq.${encodeURIComponent(mealId)}&user_id=eq.${encodeURIComponent(userId)}`,
    {
      method: "DELETE",
      headers: {
        Prefer: "return=minimal"
      }
    }
  );
  return true;
}

export async function getMeal(env: Env, mealId: string, userId: string): Promise<Meal | null> {
  const rows = await supabaseFetch<MealRecord[]>(
    env,
    `/rest/v1/meals?id=eq.${encodeURIComponent(mealId)}&user_id=eq.${encodeURIComponent(userId)}&select=*,meal_items(*)&limit=1`
  );

  if (!rows[0]) return null;
  return { ...rows[0], photo_url: null };
}

export async function listMeals(env: Env, userId: string, date: string): Promise<Meal[]> {
  const rows = await supabaseFetch<MealRecord[]>(
    env,
    `/rest/v1/meals?user_id=eq.${encodeURIComponent(userId)}&meal_date=eq.${encodeURIComponent(
      date
    )}&select=*,meal_items(*)&order=created_at.desc`
  );

  const paths = [...new Set(rows.flatMap(meal => meal.photo_path && ownedPhotoPath(userId, meal.photo_path) ? [meal.photo_path] : []))];
  const signed = paths.length ? await supabaseFetch<Array<{ path: string; signedURL?: string }>>(env,
    "/storage/v1/object/sign/meal-photos", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paths, expiresIn: 3600 })
    }).catch(() => []) : [];
  const urls = new Map(signed.map(item => [item.path, item.signedURL ? `${requireEnv(env, "SUPABASE_URL")}/storage/v1${item.signedURL}` : null]));
  return rows.map(meal => ({ ...meal, meal_items: meal.meal_items ?? [], photo_url: meal.photo_path ? urls.get(meal.photo_path) ?? null : null }));
}

export async function getWaterIntake(env: Env, userId: string, date: string): Promise<DailyWater | null> {
  const rows = await supabaseFetch<DailyWater[]>(
    env,
    `/rest/v1/water_intake?user_id=eq.${encodeURIComponent(userId)}&intake_date=eq.${encodeURIComponent(date)}&select=*&limit=1`
  );
  return rows[0] ?? null;
}

export async function upsertWaterIntake(env: Env, userId: string, date: string, amountMl: number): Promise<DailyWater> {
  const rows = await supabaseFetch<DailyWater[]>(env, "/rest/v1/water_intake?on_conflict=user_id,intake_date", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=representation"
    },
    body: JSON.stringify([
      {
        user_id: userId,
        intake_date: date,
        amount_ml: amountMl,
        updated_at: new Date().toISOString()
      }
    ])
  });

  return rows[0];
}

export async function getCreatineIntake(env: Env, userId: string, date: string): Promise<DailyCreatine | null> {
  const rows = await supabaseFetch<DailyCreatine[]>(
    env,
    `/rest/v1/creatine_intake?user_id=eq.${encodeURIComponent(userId)}&intake_date=eq.${encodeURIComponent(date)}&select=*&limit=1`
  );
  return rows[0] ?? null;
}

export async function upsertCreatineIntake(env: Env, userId: string, date: string, taken: boolean): Promise<DailyCreatine> {
  const rows = await supabaseFetch<DailyCreatine[]>(env, "/rest/v1/creatine_intake?on_conflict=user_id,intake_date", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=representation"
    },
    body: JSON.stringify([
      {
        user_id: userId,
        intake_date: date,
        taken,
        updated_at: new Date().toISOString()
      }
    ])
  });

  return rows[0];
}

export async function getProfile(env: Env, userId: string): Promise<UserProfile | null> {
  const rows = await supabaseFetch<UserProfile[]>(
    env,
    `/rest/v1/profiles?user_id=eq.${encodeURIComponent(userId)}&select=*&limit=1`
  );
  return rows[0] ?? null;
}

export async function upsertProfile(env: Env, profile: UserProfile): Promise<UserProfile> {
  const rows = await supabaseFetch<UserProfile[]>(env, "/rest/v1/profiles?on_conflict=user_id", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=representation"
    },
    body: JSON.stringify([{ ...profile, updated_at: new Date().toISOString() }])
  });

  return rows[0];
}

async function withPhoto(env: Env, meal: MealRecord, userId: string): Promise<Meal> {
  return {
    ...meal,
    meal_items: meal.meal_items ?? [],
    photo_url: meal.photo_path ? await signPhoto(env, userId, meal.photo_path) : null
  };
}

function extensionFor(mimeType: string): string {
  if (mimeType.includes("png")) return "png";
  if (mimeType.includes("webp")) return "webp";
  if (mimeType.includes("heic") || mimeType.includes("heif")) return "heic";
  return "jpg";
}

function ownedPhotoPath(userId: string, path: string): boolean {
  return path.startsWith(`${userId}/`) && /^[a-zA-Z0-9_./-]+$/.test(path) &&
    path.split("/").every(part => part !== "" && part !== "." && part !== "..");
}
