import { getSupabase } from "./supabase";
import type { AdminUserDetails, DailySummary, DailyWater, Meal, UserProfile } from "./shared/types";

async function authHeaders(): Promise<HeadersInit> {
  const supabase = await getSupabase();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(await authHeaders()),
      ...(init.headers ?? {})
    }
  });

  const payload = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) {
    throw new Error(payload.error ?? `Request failed: ${response.status}`);
  }

  return payload as T;
}

export async function analyzeMeal(input: { photo: File | null; description: string; mealDate: string }): Promise<{ meal: Meal }> {
  const form = new FormData();
  if (input.photo) form.set("photo", input.photo);
  form.set("description", input.description);
  form.set("mealDate", input.mealDate);

  return apiFetch<{ meal: Meal }>("/api/meals/analyze", {
    method: "POST",
    body: form
  });
}

export async function clarifyMeal(mealId: string, answer: string): Promise<{ meal: Meal }> {
  return apiFetch<{ meal: Meal }>(`/api/meals/${mealId}/clarify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ answer })
  });
}

export async function reviseMeal(mealId: string, feedback: string): Promise<{ meal: Meal }> {
  return apiFetch<{ meal: Meal }>(`/api/meals/${mealId}/revise`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ feedback })
  });
}

export async function deleteMeal(mealId: string): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>(`/api/meals/${mealId}`, {
    method: "DELETE"
  });
}

export async function getMeals(date: string): Promise<{ meals: Meal[] }> {
  return apiFetch<{ meals: Meal[] }>(`/api/meals?date=${encodeURIComponent(date)}`);
}

export async function getDay(date: string): Promise<{ summary: DailySummary }> {
  return apiFetch<{ summary: DailySummary }>(`/api/days/${encodeURIComponent(date)}`);
}

export async function saveWater(date: string, amountMl: number): Promise<{ water: DailyWater }> {
  return apiFetch<{ water: DailyWater }>(`/api/water/${encodeURIComponent(date)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amount_ml: amountMl })
  });
}

export async function saveProfile(input: Omit<UserProfile, "user_id" | "created_at" | "updated_at">): Promise<{ profile: UserProfile }> {
  return apiFetch<{ profile: UserProfile }>("/api/profile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
}

export async function getProfile(): Promise<{ profile: UserProfile | null }> {
  return apiFetch<{ profile: UserProfile | null }>("/api/profile");
}

export async function getAdminUsers(date: string): Promise<{ date: string; users: AdminUserDetails[] }> {
  return apiFetch<{ date: string; users: AdminUserDetails[] }>(`/api/admin/users?date=${encodeURIComponent(date)}`);
}
