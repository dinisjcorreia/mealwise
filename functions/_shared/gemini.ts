import { parseGeminiJson, shouldSaveAnalysis } from "../../src/shared/gemini";
import type { MealAnalysis, MealItem } from "../../src/shared/types";
import { requireEnv, type Env } from "./env";

const responseSchema = {
  type: "OBJECT",
  properties: {
    status: { type: "STRING", enum: ["saved", "needs_clarification"] },
    meal_name: { type: "STRING", nullable: true },
    clarification_question: { type: "STRING", nullable: true },
    notes: { type: "STRING", nullable: true },
    items: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          food_name: { type: "STRING" },
          portion: { type: "STRING" },
          calories: { type: "NUMBER" },
          protein_g: { type: "NUMBER" },
          carbs_g: { type: "NUMBER" },
          fat_g: { type: "NUMBER" },
          fiber_g: { type: "NUMBER" },
          sugar_g: { type: "NUMBER" },
          sodium_mg: { type: "NUMBER" },
          confidence: { type: "NUMBER" },
          notes: { type: "STRING", nullable: true }
        },
        required: [
          "food_name",
          "portion",
          "calories",
          "protein_g",
          "carbs_g",
          "fat_g",
          "fiber_g",
          "sugar_g",
          "sodium_mg",
          "confidence"
        ]
      }
    }
  },
  required: ["status", "items"]
};

export async function analyzeWithGemini(env: Env, input: {
  imageBytes?: ArrayBuffer | null;
  mimeType?: string | null;
  description: string;
  clarification?: { question: string | null; answer: string } | null;
  revision?: { feedback: string; currentItems: MealItem[] } | null;
}): Promise<MealAnalysis> {
  if (env.MOCK_GEMINI === "true") {
    return parseGeminiJson(
      input.description.toLowerCase().includes("unknown")
        ? JSON.stringify({
            status: "needs_clarification",
            meal_name: null,
            clarification_question: "Que alimento e porção devo registar?",
            items: [],
            notes: "Dúvida simulada."
          })
        : JSON.stringify({
            status: "saved",
            meal_name: "Refeição simulada",
            clarification_question: null,
            items: [
              {
                food_name: "Refeição simulada",
                portion: input.description || "1 prato",
                calories: 500,
                protein_g: 25,
                carbs_g: 55,
                fat_g: 18,
                fiber_g: 6,
                sugar_g: 7,
                sodium_mg: 650,
                confidence: 0.86,
                notes: "Resposta simulada."
              }
            ],
            notes: "Resposta simulada."
          })
    );
  }

  const prompt = [
    "You are a nutrition assistant for a calorie tracker.",
    input.imageBytes ? "Analyze the meal photo plus user description." : "Analyze the user's text-only meal description.",
    "Return JSON matching schema.",
    "Be balanced: do not ask for tiny details, but do not invent large meals or unusual portions.",
    "Use normal defaults only for common simple foods with narrow usual portions.",
    "Example: 'pão com manteiga e queijo' may be saved as one regular bread roll opened in half, thin butter spread, and one slice of cheese unless user says otherwise.",
    "Safe defaults: one medium fruit, one standard yoghurt, one slice cheese, thin butter spread, one regular bread roll.",
    "Do not assume for vague foods with wide ranges: 'massa', 'arroz', 'pizza', 'caril', 'hambúrguer', restaurant meals, mixed plates, desserts, oils/sauces not mentioned.",
    "Ask when portion uncertainty would materially change calories/protein or when multiple very different interpretations are likely.",
    "If you must ask, ask in Portugal Portuguese and include all details needed to resolve the uncertainty.",
    "Never save estimates only when uncertainty is material.",
    "If reasonably confident, status saved and include assumptions in notes.",
    "Use calories kcal, grams for macros/fiber/sugar, milligrams for sodium.",
    `User description: ${input.description || "(none)"}`,
    input.clarification ? `Previous question: ${input.clarification.question ?? ""}\nUser answer: ${input.clarification.answer}` : "",
    input.revision
      ? [
          "The user says the saved estimate is wrong. Revise the existing meal; do not add unrelated foods.",
          "If the feedback is enough to correct the estimate, return status saved with corrected items.",
          "If the feedback is ambiguous, ask in Portugal Portuguese and include all details needed to resolve the uncertainty.",
          `Current saved items JSON: ${JSON.stringify(input.revision.currentItems)}`,
          `User correction feedback: ${input.revision.feedback}`
        ].join("\n")
      : ""
  ].join("\n");

  const parts: Array<Record<string, unknown>> = [];
  if (input.imageBytes) {
    parts.push({
      inlineData: {
        mimeType: input.mimeType || "image/jpeg",
        data: arrayBufferToBase64(input.imageBytes)
      }
    });
  }
  parts.push({ text: prompt });

  const attemptedModels: string[] = [];
  let lastRetryableError: GeminiApiError | null = null;

  for (const model of modelCandidates(env)) {
    attemptedModels.push(model);
    try {
      const text = await generateContent(env, model, parts);
      const analysis = parseGeminiJson(text);
      return shouldSaveAnalysis(analysis) ? { ...analysis, clarification_question: null } : analysis;
    } catch (error) {
      if (error instanceof GeminiApiError && error.retryWithNextModel) {
        lastRetryableError = error;
        continue;
      }
      throw error;
    }
  }

  if (lastRetryableError) {
    throw new Error(`Limite da API Gemini atingido nos modelos disponíveis (${attemptedModels.join(", ")}). Tenta novamente mais tarde.`);
  }

  throw new Error("Não há modelos Gemini configurados.");
}

async function generateContent(env: Env, model: string, parts: Array<Record<string, unknown>>): Promise<string> {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": requireEnv(env, "GEMINI_API_KEY")
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts
        }
      ],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: "application/json",
        responseSchema
      }
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new GeminiApiError(response.status, text || `Gemini failed: ${response.status}`);
  }

  const payload = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = payload.candidates?.[0]?.content?.parts?.find((part) => part.text)?.text;
  if (!text) throw new Error("Gemini não devolveu resposta.");
  return text;
}

function modelCandidates(env: Env): string[] {
  const defaults = ["gemini-2.5-flash", "gemini-3.1-flash-lite-preview", "gemini-3-flash-preview", "gemini-2.5-flash-lite"];
  const list = env.GEMINI_FALLBACK_MODELS
    ? env.GEMINI_FALLBACK_MODELS
        .split(",")
        .map((model) => model.trim())
        .filter(Boolean)
    : [env.GEMINI_MODEL || defaults[0], ...defaults];

  return [...new Set(list)];
}

class GeminiApiError extends Error {
  status: number;
  body: string;
  retryWithNextModel: boolean;

  constructor(status: number, body: string) {
    super(toFriendlyGeminiError(status, body));
    this.status = status;
    this.body = body;
    this.retryWithNextModel = shouldTryNextModel(status, body);
  }
}

function shouldTryNextModel(status: number, body: string): boolean {
  const lower = body.toLowerCase();
  return (
    status === 429 ||
    lower.includes("resource_exhausted") ||
    lower.includes("quota exceeded") ||
    lower.includes("not found") ||
    lower.includes("not supported")
  );
}

function toFriendlyGeminiError(status: number, body: string): string {
  const lower = body.toLowerCase();
  if (status === 429 || lower.includes("resource_exhausted") || lower.includes("quota exceeded")) {
    return "Limite da API Gemini atingido. A tentar outro modelo.";
  }
  return "A API Gemini falhou ao analisar a refeição.";
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
