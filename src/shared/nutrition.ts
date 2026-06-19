import type { DailySummary, Meal, MealItem, Nutrients } from "./types";

export const emptyNutrients = (): Nutrients => ({
  calories: 0,
  protein_g: 0,
  carbs_g: 0,
  fat_g: 0,
  fiber_g: 0,
  sugar_g: 0,
  sodium_mg: 0
});

export const roundNutrition = (value: number): number => Math.round((value + Number.EPSILON) * 10) / 10;

export function sumItems(items: MealItem[]): Nutrients {
  const totals = emptyNutrients();

  for (const item of items) {
    totals.calories += item.calories || 0;
    totals.protein_g += item.protein_g || 0;
    totals.carbs_g += item.carbs_g || 0;
    totals.fat_g += item.fat_g || 0;
    totals.fiber_g += item.fiber_g || 0;
    totals.sugar_g += item.sugar_g || 0;
    totals.sodium_mg += item.sodium_mg || 0;
  }

  return {
    calories: Math.round(totals.calories),
    protein_g: roundNutrition(totals.protein_g),
    carbs_g: roundNutrition(totals.carbs_g),
    fat_g: roundNutrition(totals.fat_g),
    fiber_g: roundNutrition(totals.fiber_g),
    sugar_g: roundNutrition(totals.sugar_g),
    sodium_mg: Math.round(totals.sodium_mg)
  };
}

export function summarizeDay(date: string, meals: Meal[], waterMl = 0, creatineTaken = false): DailySummary {
  const savedMeals = meals.filter((meal) => meal.status === "saved");
  const items = savedMeals.flatMap((meal) => meal.meal_items ?? []);
  return {
    date,
    meal_count: savedMeals.length,
    water_ml: waterMl,
    creatine_taken: creatineTaken,
    ...sumItems(items)
  };
}
