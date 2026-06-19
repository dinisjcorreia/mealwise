import type { DailyCreatine, DailyWater, Meal, MealItem, UserProfile } from "../../src/shared/types";
import { requireEnv, type Env } from "./env";

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
    headers: serviceHeaders(env, init.headers)
  });

  if (!response.ok) {
    const text = await response.text();
    if (response.status === 404 && text.toLowerCase().includes("bucket")) {
      throw new Error("Bucket de fotos não encontrado. Corre o ficheiro supabase/schema.sql no Supabase SQL Editor.");
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

export async function downloadMealPhoto(env: Env, path: string): Promise<{ bytes: ArrayBuffer; mimeType: string }> {
  const response = await fetch(`${requireEnv(env, "SUPABASE_URL")}/storage/v1/object/meal-photos/${path}`, {
    headers: serviceHeaders(env)
  });

  if (!response.ok) {
    throw new Error("Não foi possível carregar a foto da refeição.");
  }

  return {
    bytes: await response.arrayBuffer(),
    mimeType: response.headers.get("Content-Type") ?? "image/jpeg"
  };
}

export async function signPhoto(env: Env, path: string): Promise<string | null> {
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
        status: "pending"
      }
    ])
  });

  return withPhoto(env, { ...rows[0], meal_items: [] });
}

export async function updateMeal(env: Env, mealId: string, userId: string, fields: Record<string, unknown>): Promise<Meal> {
  const rows = await supabaseFetch<MealRecord[]>(
    env,
    `/rest/v1/meals?id=eq.${encodeURIComponent(mealId)}&user_id=eq.${encodeURIComponent(userId)}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Prefer: "return=representation"
      },
      body: JSON.stringify({ ...fields, updated_at: new Date().toISOString() })
    }
  );

  return withPhoto(env, { ...rows[0], meal_items: await getMealItems(env, mealId) });
}

export async function replaceMealItems(env: Env, mealId: string, items: MealItem[]): Promise<void> {
  await supabaseFetch(env, `/rest/v1/meal_items?meal_id=eq.${encodeURIComponent(mealId)}`, { method: "DELETE" });

  if (!items.length) return;

  await supabaseFetch(env, "/rest/v1/meal_items", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "return=minimal"
    },
    body: JSON.stringify(
      items.map((item) => ({
        meal_id: mealId,
        food_name: item.food_name,
        portion: item.portion,
        calories: item.calories,
        protein_g: item.protein_g,
        carbs_g: item.carbs_g,
        fat_g: item.fat_g,
        fiber_g: item.fiber_g,
        sugar_g: item.sugar_g,
        sodium_mg: item.sodium_mg,
        confidence: item.confidence,
        notes: item.notes ?? null
      }))
    )
  });
}

export async function addClarification(env: Env, mealId: string, question: string | null, answer: string): Promise<void> {
  await supabaseFetch(env, "/rest/v1/clarifications", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "return=minimal"
    },
    body: JSON.stringify([{ meal_id: mealId, question, answer }])
  });
}

export async function deleteMeal(env: Env, mealId: string, userId: string): Promise<void> {
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
}

export async function getMeal(env: Env, mealId: string, userId: string): Promise<Meal | null> {
  const rows = await supabaseFetch<MealRecord[]>(
    env,
    `/rest/v1/meals?id=eq.${encodeURIComponent(mealId)}&user_id=eq.${encodeURIComponent(userId)}&select=*,meal_items(*)&limit=1`
  );

  if (!rows[0]) return null;
  return withPhoto(env, rows[0]);
}

export async function listMeals(env: Env, userId: string, date: string): Promise<Meal[]> {
  const rows = await supabaseFetch<MealRecord[]>(
    env,
    `/rest/v1/meals?user_id=eq.${encodeURIComponent(userId)}&meal_date=eq.${encodeURIComponent(
      date
    )}&select=*,meal_items(*)&order=created_at.desc`
  );

  return Promise.all(rows.map((meal) => withPhoto(env, meal)));
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

async function getMealItems(env: Env, mealId: string): Promise<MealItem[]> {
  return supabaseFetch<MealItem[]>(env, `/rest/v1/meal_items?meal_id=eq.${encodeURIComponent(mealId)}&order=created_at.asc`);
}

async function withPhoto(env: Env, meal: MealRecord): Promise<Meal> {
  return {
    ...meal,
    meal_items: meal.meal_items ?? [],
    photo_url: meal.photo_path ? await signPhoto(env, meal.photo_path) : null
  };
}

function extensionFor(mimeType: string): string {
  if (mimeType.includes("png")) return "png";
  if (mimeType.includes("webp")) return "webp";
  if (mimeType.includes("heic") || mimeType.includes("heif")) return "heic";
  return "jpg";
}
