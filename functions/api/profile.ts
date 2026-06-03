import { calculateTargets } from "../../src/shared/targets";
import type { Gender, WeightGoal, UserProfile } from "../../src/shared/types";
import { handleError, json, requireUser, type Env } from "../_shared/env";
import { getProfile, upsertProfile } from "../_shared/supabase";

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const user = await requireUser(request, env);
    return json({ profile: await getProfile(env, user.id) });
  } catch (error) {
    return handleError(error);
  }
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const user = await requireUser(request, env);
    const body = (await request.json().catch(() => null)) as Partial<UserProfile> | null;
    if (!body) return json({ error: "Dados de perfil inválidos." }, { status: 400 });

    const gender = body.gender;
    const goal = body.goal;
    const age = Number(body.age);
    const height = Number(body.height_cm);
    const weight = Number(body.weight_kg);

    if (!isGender(gender)) return json({ error: "Escolhe o sexo." }, { status: 400 });
    if (!isGoal(goal)) return json({ error: "Escolhe o objectivo." }, { status: 400 });
    if (!Number.isFinite(age) || age < 13 || age > 100) return json({ error: "Idade inválida." }, { status: 400 });
    if (!Number.isFinite(height) || height < 120 || height > 230) return json({ error: "Altura inválida." }, { status: 400 });
    if (!Number.isFinite(weight) || weight < 35 || weight > 300) return json({ error: "Peso inválido." }, { status: 400 });

    const targets = calculateTargets({
      gender,
      goal,
      age,
      height_cm: height,
      weight_kg: weight
    });

    const profile = await upsertProfile(env, {
      user_id: user.id,
      gender,
      goal,
      age,
      height_cm: height,
      weight_kg: weight,
      ...targets
    });

    return json({ profile });
  } catch (error) {
    return handleError(error);
  }
};

function isGender(value: unknown): value is Gender {
  return value === "female" || value === "male";
}

function isGoal(value: unknown): value is WeightGoal {
  return value === "lose" || value === "maintain" || value === "gain";
}
