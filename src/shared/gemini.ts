import type { MealAnalysis, MealItem } from "./types";

const nutrientKeys = ["calories", "protein_g", "carbs_g", "fat_g", "fiber_g", "sugar_g", "sodium_mg"] as const;

function finiteNumber(value: unknown): number {
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) && numberValue >= 0 ? numberValue : 0;
}

function normalizeItem(value: unknown): MealItem | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const foodName = String(record.food_name ?? "").trim();
  const portion = String(record.portion ?? "").trim();
  if (!foodName || !portion) return null;

  const item: MealItem = {
    food_name: foodName,
    portion,
    confidence: Math.min(1, Math.max(0, finiteNumber(record.confidence))),
    notes: typeof record.notes === "string" ? record.notes : null,
    calories: 0,
    protein_g: 0,
    carbs_g: 0,
    fat_g: 0,
    fiber_g: 0,
    sugar_g: 0,
    sodium_mg: 0
  };

  for (const key of nutrientKeys) {
    item[key] = finiteNumber(record[key]);
  }

  return item;
}

export function parseGeminiJson(rawText: string): MealAnalysis {
  const trimmed = rawText.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  const parsed = JSON.parse(trimmed) as Record<string, unknown>;
  const status = parsed.status === "needs_clarification" ? "needs_clarification" : "saved";
  const items = Array.isArray(parsed.items) ? parsed.items.map(normalizeItem).filter((item): item is MealItem => Boolean(item)) : [];
  const clarification = typeof parsed.clarification_question === "string" ? parsed.clarification_question.trim() : "";

  return {
    status: status === "needs_clarification" || items.length === 0 ? "needs_clarification" : "saved",
    meal_name: typeof parsed.meal_name === "string" ? parsed.meal_name : null,
    clarification_question: clarification || (items.length === 0 ? "Que alimentos e porções devo registar nesta refeição?" : null),
    items,
    notes: typeof parsed.notes === "string" ? parsed.notes : null
  };
}

export function shouldSaveAnalysis(analysis: MealAnalysis): boolean {
  return analysis.status === "saved" && analysis.items.length > 0 && !analysis.clarification_question;
}
