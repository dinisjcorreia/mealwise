import { handleError, json, requireUser, type Env } from "../_shared/env";
import { listMeals } from "../_shared/supabase";

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const user = await requireUser(request, env);
    const url = new URL(request.url);
    const date = normalizeDate(url.searchParams.get("date") ?? "");
    const meals = await listMeals(env, user.id, date);
    return json({ meals });
  } catch (error) {
    return handleError(error);
  }
};

function normalizeDate(value: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : new Date().toISOString().slice(0, 10);
}
