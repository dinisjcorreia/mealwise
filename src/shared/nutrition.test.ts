import { describe, expect, it } from "vitest";
import { summarizeDay } from "./nutrition";
import type { Meal } from "./types";

describe("summarizeDay", () => {
  it("excludes pending meals from totals", () => {
    const meals = [
      {
        id: "saved",
        status: "saved",
        meal_date: "2026-05-17",
        description: null,
        photo_path: "a.jpg",
        clarification_question: null,
        ai_notes: null,
        created_at: "",
        updated_at: "",
        meal_items: [
          {
            food_name: "Rice bowl",
            portion: "1 bowl",
            calories: 520,
            protein_g: 25.2,
            carbs_g: 65.1,
            fat_g: 14,
            fiber_g: 7,
            sugar_g: 6,
            sodium_mg: 780,
            confidence: 0.82
          }
        ]
      },
      {
        id: "pending",
        status: "pending",
        meal_date: "2026-05-17",
        description: null,
        photo_path: "b.jpg",
        clarification_question: "How much pasta?",
        ai_notes: null,
        created_at: "",
        updated_at: "",
        meal_items: [
          {
            food_name: "Pasta",
            portion: "unknown",
            calories: 900,
            protein_g: 10,
            carbs_g: 120,
            fat_g: 30,
            fiber_g: 5,
            sugar_g: 4,
            sodium_mg: 400,
            confidence: 0.2
          }
        ]
      }
    ] satisfies Meal[];

    expect(summarizeDay("2026-05-17", meals, 1250)).toEqual({
      date: "2026-05-17",
      meal_count: 1,
      water_ml: 1250,
      calories: 520,
      protein_g: 25.2,
      carbs_g: 65.1,
      fat_g: 14,
      fiber_g: 7,
      sugar_g: 6,
      sodium_mg: 780
    });
  });
});
