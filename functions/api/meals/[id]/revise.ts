import { analyzeWithGemini } from "../../../_shared/gemini";
import { handleError, json, inputText, mealId, requireUser, type Env } from "../../../_shared/env";
import { downloadMealPhoto, getMeal, getClarifications, saveMealAnalysis } from "../../../_shared/supabase";

export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  try {
    const user = await requireUser(request, env);
    const id = mealId(params.id);
    const body = (await request.json().catch(() => null)) as { feedback?: string } | null;
    const feedback = inputText(body?.feedback);

    if (!id) return json({ error: "ID da refeição obrigatório." }, { status: 400 });
    if (!feedback) return json({ error: "Escreve a correcção." }, { status: 400 });

    const existing = await getMeal(env, id, user.id);
    if (!existing) return json({ error: "Refeição não encontrada." }, { status: 404 });

    const [image, history] = await Promise.all([
      existing.photo_path ? downloadMealPhoto(env, user.id, existing.photo_path) : null,
      getClarifications(env, existing.id)
    ]);
    const analysis = await analyzeWithGemini(env, {
      history,
      imageBytes: image?.bytes,
      mimeType: image?.mimeType,
      description: existing.description ?? "",
      revision: {
        feedback,
        currentItems: existing.meal_items
      }
    });

    const meal = await saveMealAnalysis(env, existing, user.id, analysis, {
      question: 'Correcção da refeição',
      answer: feedback
    });

    return json({ meal });
  } catch (error) {
    return handleError(error);
  }
};
