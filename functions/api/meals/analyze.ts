import { analyzeWithGemini } from "../../_shared/gemini";
import { handleError, json, requireUser, type Env } from "../../_shared/env";
import { createMeal, downloadMealPhoto, replaceMealItems, updateMeal, uploadMealPhoto } from "../../_shared/supabase";
import { shouldSaveAnalysis } from "../../../src/shared/gemini";

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const user = await requireUser(request, env);
    const form = await request.formData();
    const photo = form.get("photo");
    const description = String(form.get("description") ?? "").trim();
    const mealDate = normalizeDate(String(form.get("mealDate") ?? ""));

    if (!isUploadedFile(photo) && !description) {
      return json({ error: "Adiciona uma foto ou descreve a refeição." }, { status: 400 });
    }

    if (isUploadedFile(photo) && !photo.type.startsWith("image/")) {
      return json({ error: "O ficheiro tem de ser uma imagem." }, { status: 400 });
    }

    const photoPath = isUploadedFile(photo) ? await uploadMealPhoto(env, user.id, photo) : null;
    let meal = await createMeal(env, {
      userId: user.id,
      photoPath,
      description: description || null,
      mealDate
    });

    const image = photoPath ? await downloadMealPhoto(env, photoPath) : null;
    const analysis = await analyzeWithGemini(env, {
      imageBytes: image?.bytes,
      mimeType: image?.mimeType || (isUploadedFile(photo) ? photo.type : null),
      description
    });

    if (shouldSaveAnalysis(analysis)) {
      await replaceMealItems(env, meal.id, analysis.items);
      meal = await updateMeal(env, meal.id, user.id, {
        status: "saved",
        clarification_question: null,
        ai_notes: analysis.notes
      });
    } else {
      meal = await updateMeal(env, meal.id, user.id, {
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

function normalizeDate(value: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : new Date().toISOString().slice(0, 10);
}

function isUploadedFile(value: unknown): value is File {
  return Boolean(
    value &&
      typeof value === "object" &&
      "arrayBuffer" in value &&
      "type" in value &&
      typeof (value as { type?: unknown }).type === "string"
  );
}
