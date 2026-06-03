import { handleError, json, requireEnv, type Env } from "../_shared/env";

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  try {
    return json({
      supabaseUrl: requireEnv(env, "SUPABASE_URL"),
      supabaseAnonKey: requireEnv(env, "SUPABASE_ANON_KEY")
    });
  } catch (error) {
    return handleError(error);
  }
};
