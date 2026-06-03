import { handleError, json, requireUser, type Env } from "../../_shared/env";
import { upsertWaterIntake } from "../../_shared/supabase";

export const onRequestPut: PagesFunction<Env> = async ({ request, env, params }) => {
  try {
    const user = await requireUser(request, env);
    const date = normalizeDate(String(params.date ?? ""));
    const body = (await request.json().catch(() => null)) as { amount_ml?: unknown } | null;
    const amountMl = body?.amount_ml;

    if (typeof amountMl !== "number" || !Number.isInteger(amountMl) || amountMl < 0 || amountMl > 20000) {
      return json({ error: "Quantidade de água inválida." }, { status: 400 });
    }

    const water = await upsertWaterIntake(env, user.id, date, amountMl);
    return json({ water });
  } catch (error) {
    return handleError(error);
  }
};

function normalizeDate(value: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : new Date().toISOString().slice(0, 10);
}
