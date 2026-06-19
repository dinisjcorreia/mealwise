import { handleError, json, requireUser, type Env } from "../../_shared/env";
import { upsertCreatineIntake } from "../../_shared/supabase";

export const onRequestPut: PagesFunction<Env> = async ({ request, env, params }) => {
  try {
    const user = await requireUser(request, env);
    const date = normalizeDate(String(params.date ?? ""));
    const body = (await request.json().catch(() => null)) as { taken?: unknown } | null;

    if (typeof body?.taken !== "boolean") {
      return json({ error: "Estado da creatina inválido." }, { status: 400 });
    }

    const creatine = await upsertCreatineIntake(env, user.id, date, body.taken);
    return json({ creatine });
  } catch (error) {
    return handleError(error);
  }
};

function normalizeDate(value: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : new Date().toISOString().slice(0, 10);
}
