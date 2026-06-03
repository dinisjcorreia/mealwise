import { describe, expect, it } from "vitest";
import { parseGeminiJson, shouldSaveAnalysis } from "./gemini";

describe("parseGeminiJson", () => {
  it("parses saved meal JSON", () => {
    const analysis = parseGeminiJson(`{
      "status": "saved",
      "meal_name": "Toast and eggs",
      "clarification_question": null,
      "items": [{
        "food_name": "Eggs",
        "portion": "2 large",
        "calories": 144,
        "protein_g": 12.6,
        "carbs_g": 0.8,
        "fat_g": 9.6,
        "fiber_g": 0,
        "sugar_g": 0.4,
        "sodium_mg": 140,
        "confidence": 0.9,
        "notes": null
      }],
      "notes": "Estimate."
    }`);

    expect(shouldSaveAnalysis(analysis)).toBe(true);
    expect(analysis.items[0].calories).toBe(144);
  });

  it("forces clarification when items missing", () => {
    const analysis = parseGeminiJson(`{"status":"saved","items":[]}`);
    expect(analysis.status).toBe("needs_clarification");
    expect(shouldSaveAnalysis(analysis)).toBe(false);
  });
});
