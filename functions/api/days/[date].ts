import { summarizeDay } from "../../../src/shared/nutrition";
import { handleError, json, requireUser, type Env } from "../../_shared/env";
import { getCreatineIntake, getWaterIntake, listMeals } from "../../_shared/supabase";

export const onRequestGet: PagesFunction<Env> = async ({ request, env, params }) => {
  try {
    const user = await requireUser(request, env);
    const date = normalizeDate(String(params.date ?? ""));
    const [meals, water, creatine] = await Promise.all([
      listMeals(env, user.id, date),
      getWaterIntake(env, user.id, date),
      getCreatineIntake(env, user.id, date)
    ]);
    return json({ summary: summarizeDay(date, meals, water?.amount_ml ?? 0, creatine?.taken ?? false) });
  } catch (error) {
    return handleError(error);
  }
};

function normalizeDate(value: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : new Date().toISOString().slice(0, 10);
}
