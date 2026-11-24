export type Env = {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  GEMINI_API_KEY?: string;
  GEMINI_FALLBACK_API_KEY?: string;
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
      "Cache-Control": "no-store",
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
    throw json({ error: "Tens de iniciar sessão." }, { status: 401 });
  }

  const response = await fetch(`${requireEnv(env, "SUPABASE_URL")}/auth/v1/user`, {
    signal: AbortSignal.timeout(15000),
    headers: {
      apikey: requireEnv(env, "SUPABASE_ANON_KEY"),
      Authorization: auth
    }
  });

  if (!response.ok) {
    throw json({ error: "Sessão inválida. Entra novamente." }, { status: 401 });
  }

  const user = (await response.json()) as { id?: string; email?: string };
  if (!user.id) {
    throw json({ error: "Sessão inválida. Entra novamente." }, { status: 401 });
  }

  return { id: user.id, email: user.email };
}

export function requireAdmin(user: AuthedUser, env: Env): void {
  const adminEmails = (env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

  if (!user.email || !adminEmails.includes(user.email.toLowerCase())) {
    throw json({ error: "Sem acesso de administrador." }, { status: 403 });
  }
}

export async function handleError(error: unknown): Promise<Response> {
  if (error instanceof Response) return error;
  const message = error instanceof Error ? error.message : "Unknown error.";
  const status = message.startsWith("Missing ") ? 500 : 400;
  return json({ error: message }, { status });
}

export function normalizeDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(`${value}T12:00:00Z`)) ||
      new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) !== value) {
    throw new Error("Data inválida. Usa AAAA-MM-DD.");
  }
  return value;
}

export function inputText(value: unknown, max = 4000): string {
  if (value == null) return "";
  if (typeof value !== "string" || value.length > max) throw new Error(`Texto inválido (máximo ${max} caracteres).`);
  return value.trim();
}

export function mealId(value: unknown): string {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error("ID da refeição inválido.");
  }
  return value;
}
