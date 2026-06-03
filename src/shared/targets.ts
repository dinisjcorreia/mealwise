import type { Gender, WeightGoal } from "./types";

export type TargetInput = {
  gender: Gender;
  age: number;
  height_cm: number;
  weight_kg: number;
  goal: WeightGoal;
};

export function calculateTargets(input: TargetInput): {
  daily_calorie_target: number;
  daily_protein_target_g: number;
  daily_water_target_ml: number;
} {
  const base =
    10 * input.weight_kg + 6.25 * input.height_cm - 5 * input.age + (input.gender === "male" ? 5 : -161);
  const sedentaryMaintenance = base * 1.3;
  const goalDelta = input.goal === "lose" ? -400 : input.goal === "gain" ? 300 : 0;

  return {
    daily_calorie_target: Math.max(1200, Math.round(sedentaryMaintenance + goalDelta)),
    daily_protein_target_g: Math.round(input.weight_kg * 1.62),
    daily_water_target_ml: Math.round(input.weight_kg * 35)
  };
}
