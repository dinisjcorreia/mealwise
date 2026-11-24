import { analyzeWithGemini } from "../../_shared/gemini";
import { handleError, json, normalizeDate, inputText, requireUser, type Env } from "../../_shared/env";
import { createMeal, getMeal, saveMealAnalysis, uploadMealPhoto } from "../../_shared/supabase";
import { MAX_MEAL_PHOTO_BYTES, MEAL_PHOTO_TYPES } from "../../../src/shared/photos";

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const user = await requireUser(request, env);
    const form = await request.formData();
    const photo = form.get("photo");
    const description = inputText(form.get("description"));
    const mealDate = normalizeDate(String(form.get("mealDate") ?? ""));

    if (!isUploadedFile(photo) && !description) {
      return json({ error: "Adiciona uma foto ou descreve a refeição." }, { status: 400 });
    }

    if (isUploadedFile(photo) && (!MEAL_PHOTO_TYPES.includes(photo.type) || photo.size === 0 || photo.size > MAX_MEAL_PHOTO_BYTES)) {
      return json({ error: "A foto tem de ser JPEG, PNG ou WebP e ter no máximo 512 KB." }, { status: 400 });
    }

    // Use the upload bytes directly; no Storage download or draft row before AI succeeds.
    const analysis = await analyzeWithGemini(env, {
      imageBytes: isUploadedFile(photo) ? await photo.arrayBuffer() : null,
      mimeType: isUploadedFile(photo) ? photo.type : null,
      description
    });
    const photoPath = isUploadedFile(photo) ? await uploadMealPhoto(env, user.id, photo) : null;
    const draft = await createMeal(env, { userId: user.id, photoPath, description: description || null, mealDate });
    try {
      return json({ meal: await saveMealAnalysis(env, draft, user.id, analysis) });
    } catch (error) {
      // A lost RPC response may hide a committed result. Show the persisted meal before retrying.
      const meal = await getMeal(env, draft.id, user.id).catch(() => null);
      if (!meal) throw error;
      return json({ meal, warning: meal.status === "pending" ? "A refeição ficou pendente. Responde no cartão para concluir a análise." : undefined });
    }
  } catch (error) {
    return handleError(error);
  }
};


function isUploadedFile(value: unknown): value is File {
  return Boolean(
    value &&
      typeof value === "object" &&
      "arrayBuffer" in value &&
      "type" in value &&
      typeof (value as { type?: unknown }).type === "string"
  );
}
