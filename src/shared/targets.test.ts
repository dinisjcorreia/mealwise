import { describe, expect, it } from "vitest";
import { calculateTargets } from "./targets";

describe("calculateTargets", () => {
  it("calculates higher calories for gain than loss", () => {
    const base = { gender: "male" as const, age: 30, height_cm: 180, weight_kg: 80 };
    expect(calculateTargets({ ...base, goal: "gain" }).daily_calorie_target).toBeGreaterThan(
      calculateTargets({ ...base, goal: "lose" }).daily_calorie_target
    );
  });

  it("calculates water target from weight", () => {
    expect(
      calculateTargets({ gender: "female", age: 35, height_cm: 168, weight_kg: 75, goal: "maintain" }).daily_water_target_ml
    ).toBe(2625);
  });
});
