import { analyzeWithGemini } from "../../../_shared/gemini";
import { handleError, json, requireUser, type Env } from "../../../_shared/env";
import {
  addClarification,
  downloadMealPhoto,
  getMeal,
  replaceMealItems,
  updateMeal
} from "../../../_shared/supabase";
import { shouldSaveAnalysis } from "../../../../src/shared/gemini";

export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  try {
    const user = await requireUser(request, env);
    const id = String(params.id ?? "");
    const body = (await request.json().catch(() => null)) as { answer?: string } | null;
    const answer = body?.answer?.trim();

    if (!id) return json({ error: "ID da refeição obrigatório." }, { status: 400 });
    if (!answer) return json({ error: "Resposta obrigatória." }, { status: 400 });

    const existing = await getMeal(env, id, user.id);
    if (!existing) return json({ error: "Refeição não encontrada." }, { status: 404 });

    await addClarification(env, existing.id, existing.clarification_question, answer);

    const image = existing.photo_path ? await downloadMealPhoto(env, existing.photo_path) : null;
    const analysis = await analyzeWithGemini(env, {
      imageBytes: image?.bytes,
      mimeType: image?.mimeType,
      description: [existing.description, existing.ai_notes ? `Contexto anterior: ${existing.ai_notes}` : ""].filter(Boolean).join("\n"),
      clarification: {
        question: existing.clarification_question,
        answer
      }
    });

    let meal;
    if (shouldSaveAnalysis(analysis)) {
      await replaceMealItems(env, existing.id, analysis.items);
      meal = await updateMeal(env, existing.id, user.id, {
        status: "saved",
        clarification_question: null,
        ai_notes: analysis.notes
      });
    } else {
      meal = await updateMeal(env, existing.id, user.id, {
        status: "pending",
        clarification_question: analysis.clarification_question ?? "Que alimento e porção devo registar?",
        ai_notes: analysis.notes
      });
    }

    return json({ meal });
  } catch (error) {
    return handleError(error);
  }
};
