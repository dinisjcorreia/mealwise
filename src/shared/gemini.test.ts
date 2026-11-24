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

it("rejects corrupted nutrition instead of silently saving zeros or dropping items", () => {
  const item = { food_name: "Egg", portion: "1", calories: 72, protein_g: 6, carbs_g: 0,
    fat_g: 5, fiber_g: 0, sugar_g: 0, sodium_mg: 70, confidence: 0.9 };
  for (const calories of [null, "", -1, "bad", true]) {
    expect(() => parseGeminiJson(JSON.stringify({ status: "saved", items: [{ ...item, calories }] }))).toThrow();
  }
  expect(() => parseGeminiJson(JSON.stringify({ status: "saved", items: [item, { portion: "1" }] }))).toThrow();
  expect(() => parseGeminiJson('null')).toThrow();
  expect(() => parseGeminiJson('{"status":"oops","items":[]}')).toThrow();
  const clarification = parseGeminiJson('{"status":"needs_clarification","items":[]}');
  expect(clarification.clarification_question).toBeTruthy();
});
