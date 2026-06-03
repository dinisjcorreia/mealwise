import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

let client: SupabaseClient | null = null;

function makeClient(url: string, anonKey: string): SupabaseClient {
  return createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });
}

export async function getSupabase(): Promise<SupabaseClient> {
  if (client) return client;

  if (supabaseUrl && supabaseAnonKey) {
    client = makeClient(supabaseUrl, supabaseAnonKey);
    return client;
  }

  const response = await fetch("/api/config");
  if (!response.ok) {
    throw new Error("Configuração Supabase em falta. Define SUPABASE_URL e SUPABASE_ANON_KEY no Cloudflare Pages.");
  }

  const config = (await response.json()) as { supabaseUrl?: string; supabaseAnonKey?: string };
  if (!config.supabaseUrl || !config.supabaseAnonKey) {
    throw new Error("Configuração Supabase em falta em /api/config.");
  }

  client = makeClient(config.supabaseUrl, config.supabaseAnonKey);
  return client;
}

export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    if (!client) {
      throw new Error("Cliente Supabase ainda não está pronto.");
    }

    const value = client[prop as keyof SupabaseClient];
    return typeof value === "function" ? value.bind(client) : value;
  }
});
