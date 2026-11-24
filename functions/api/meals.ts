import { handleError, json, normalizeDate, requireUser, type Env } from "../_shared/env";
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
