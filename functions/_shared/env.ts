export type Env = {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
  GEMINI_FALLBACK_MODELS?: string;
  MOCK_GEMINI?: string;
  ADMIN_EMAILS?: string;
};

export type AuthedUser = {
  id: string;
  email?: string;
};

export function json(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {})
    }
  });
}

export function requireEnv(env: Env, key: keyof Env): string {
  const value = env[key];
  if (!value) throw new Error(`Missing ${key}`);
  return value;
}

export async function requireUser(request: Request, env: Env): Promise<AuthedUser> {
  const auth = request.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) {
    throw new Response(JSON.stringify({ error: "Tens de iniciar sessão." }), { status: 401 });
  }

  const response = await fetch(`${requireEnv(env, "SUPABASE_URL")}/auth/v1/user`, {
    headers: {
      apikey: requireEnv(env, "SUPABASE_ANON_KEY"),
      Authorization: auth
    }
  });

  if (!response.ok) {
    throw new Response(JSON.stringify({ error: "Sessão inválida. Entra novamente." }), { status: 401 });
  }

  const user = (await response.json()) as { id?: string; email?: string };
  if (!user.id) {
    throw new Response(JSON.stringify({ error: "Sessão inválida. Entra novamente." }), { status: 401 });
  }

  return { id: user.id, email: user.email };
}

export function requireAdmin(user: AuthedUser, env: Env): void {
  const adminEmails = (env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

  if (!user.email || !adminEmails.includes(user.email.toLowerCase())) {
    throw new Response(JSON.stringify({ error: "Sem acesso de administrador." }), { status: 403 });
  }
}

export async function handleError(error: unknown): Promise<Response> {
  if (error instanceof Response) return error;
  const message = error instanceof Error ? error.message : "Unknown error.";
  const status = message.startsWith("Missing ") ? 500 : 400;
  return json({ error: message }, { status });
}
