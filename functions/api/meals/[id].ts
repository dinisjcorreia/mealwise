import { handleError, json, requireUser, type Env } from "../../_shared/env";
import { deleteMeal } from "../../_shared/supabase";

export const onRequestDelete: PagesFunction<Env> = async ({ request, env, params }) => {
  try {
    const user = await requireUser(request, env);
    const id = String(params.id ?? "");
    if (!id) return json({ error: "ID da refeição obrigatório." }, { status: 400 });

    if (!await deleteMeal(env, id, user.id)) return json({ error: "Refeição não encontrada." }, { status: 404 });
    return json({ ok: true });
  } catch (error) {
    return handleError(error);
  }
};
