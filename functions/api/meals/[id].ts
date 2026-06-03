import { handleError, json, requireUser, type Env } from "../../_shared/env";
import { deleteMeal, getMeal } from "../../_shared/supabase";

export const onRequestDelete: PagesFunction<Env> = async ({ request, env, params }) => {
  try {
    const user = await requireUser(request, env);
    const id = String(params.id ?? "");
    if (!id) return json({ error: "ID da refeição obrigatório." }, { status: 400 });

    const existing = await getMeal(env, id, user.id);
    if (!existing) return json({ error: "Refeição não encontrada." }, { status: 404 });

    await deleteMeal(env, id, user.id);
    return json({ ok: true });
  } catch (error) {
    return handleError(error);
  }
};
