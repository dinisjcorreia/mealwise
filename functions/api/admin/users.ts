import type { AdminUserDetails, DailyWater, Meal, MealItem, UserProfile } from "../../../src/shared/types";
import { handleError, json, requireAdmin, requireEnv, requireUser, type Env } from "../../_shared/env";

type AuthUser = {
  id: string;
  email?: string | null;
  created_at?: string | null;
  last_sign_in_at?: string | null;
};

type MealRow = {
  id?: string;
  user_id: string;
  status: "pending" | "saved";
  description?: string | null;
  meal_date?: string;
  photo_path?: string | null;
  clarification_question?: string | null;
  ai_notes?: string | null;
  created_at?: string;
  updated_at?: string;
  meal_items?: MealItem[];
};

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const user = await requireUser(request, env);
    requireAdmin(user, env);

    const url = new URL(request.url);
    const date = normalizeDate(url.searchParams.get("date") ?? "");
    const [authUsers, profiles, mealsForDay, waterForDay, allMeals] = await Promise.all([
      listAuthUsers(env),
      restFetch<UserProfile[]>(env, "/rest/v1/profiles?select=*"),
      restFetch<MealRow[]>(
        env,
        `/rest/v1/meals?meal_date=eq.${encodeURIComponent(date)}&select=*,meal_items(*)&order=created_at.desc`
      ),
      restFetch<DailyWater[]>(env, `/rest/v1/water_intake?intake_date=eq.${encodeURIComponent(date)}&select=*`),
      restFetch<MealRow[]>(env, "/rest/v1/meals?status=eq.saved&select=user_id,status")
    ]);

    const profileByUser = new Map(profiles.map((profile) => [profile.user_id, profile]));
    const totalMealsByUser = countByUser(allMeals);
    const dayTotalsByUser = totalDayByUser(mealsForDay);
    const dayMealsByUser = groupMealsByUser(mealsForDay);
    const waterByUser = new Map(waterForDay.map((water) => [water.user_id, water.amount_ml]));

    const users: AdminUserDetails[] = authUsers.map((authUser) => {
      const dayTotals = dayTotalsByUser.get(authUser.id) ?? { calories: 0, protein_g: 0 };
      return {
        id: authUser.id,
        email: authUser.email ?? null,
        created_at: authUser.created_at ?? null,
        last_sign_in_at: authUser.last_sign_in_at ?? null,
        profile: profileByUser.get(authUser.id) ?? null,
        total_saved_meals: totalMealsByUser.get(authUser.id) ?? 0,
        day_calories: Math.round(dayTotals.calories),
        day_protein_g: Math.round(dayTotals.protein_g * 10) / 10,
        day_water_ml: waterByUser.get(authUser.id) ?? 0,
        day_meals: dayMealsByUser.get(authUser.id) ?? []
      };
    });

    return json({ date, users });
  } catch (error) {
    return handleError(error);
  }
};

async function listAuthUsers(env: Env): Promise<AuthUser[]> {
  const serviceRole = requireEnv(env, "SUPABASE_SERVICE_ROLE_KEY");
  const response = await fetch(`${requireEnv(env, "SUPABASE_URL")}/auth/v1/admin/users?per_page=1000`, {
    headers: {
      apikey: serviceRole,
      Authorization: `Bearer ${serviceRole}`
    }
  });

  if (!response.ok) {
    throw new Error("Não foi possível carregar utilizadores.");
  }

  const payload = (await response.json()) as { users?: AuthUser[] };
  return payload.users ?? [];
}

async function restFetch<T>(env: Env, path: string): Promise<T> {
  const serviceRole = requireEnv(env, "SUPABASE_SERVICE_ROLE_KEY");
  const response = await fetch(`${requireEnv(env, "SUPABASE_URL")}${path}`, {
    headers: {
      apikey: serviceRole,
      Authorization: `Bearer ${serviceRole}`
    }
  });

  if (!response.ok) {
    throw new Error("Não foi possível carregar dados de administrador.");
  }

  return (await response.json()) as T;
}

function countByUser(meals: MealRow[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const meal of meals) {
    counts.set(meal.user_id, (counts.get(meal.user_id) ?? 0) + 1);
  }
  return counts;
}

function totalDayByUser(meals: MealRow[]): Map<string, { calories: number; protein_g: number }> {
  const totals = new Map<string, { calories: number; protein_g: number }>();
  for (const meal of meals) {
    if (meal.status !== "saved") continue;
    const current = totals.get(meal.user_id) ?? { calories: 0, protein_g: 0 };
    for (const item of meal.meal_items ?? []) {
      current.calories += item.calories;
      current.protein_g += item.protein_g;
    }
    totals.set(meal.user_id, current);
  }
  return totals;
}

function groupMealsByUser(meals: MealRow[]): Map<string, Meal[]> {
  const grouped = new Map<string, Meal[]>();
  for (const meal of meals) {
    if (!meal.id || !meal.meal_date || !meal.created_at || !meal.updated_at) continue;
    const list = grouped.get(meal.user_id) ?? [];
    list.push({
      id: meal.id,
      description: meal.description ?? null,
      status: meal.status,
      meal_date: meal.meal_date,
      photo_path: meal.photo_path ?? null,
      photo_url: null,
      clarification_question: meal.clarification_question ?? null,
      ai_notes: meal.ai_notes ?? null,
      created_at: meal.created_at,
      updated_at: meal.updated_at,
      meal_items: meal.meal_items ?? []
    });
    grouped.set(meal.user_id, list);
  }
  return grouped;
}

function normalizeDate(value: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : new Date().toISOString().slice(0, 10);
}
