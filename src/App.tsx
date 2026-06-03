import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  Camera,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Droplets,
  Loader2,
  LogOut,
  MessageCircleQuestion,
  RotateCcw,
  Send,
  Shield,
  Sparkles,
  Trash2,
  Undo2
} from "lucide-react";
import { analyzeMeal, clarifyMeal, deleteMeal, getAdminUsers, getDay, getMeals, getProfile, reviseMeal, saveProfile, saveWater } from "./api";
import { getSupabase, supabase } from "./supabase";
import { calculateTargets } from "./shared/targets";
import type { AdminUserDetails, DailySummary, Gender, Meal, UserProfile, WeightGoal } from "./shared/types";

const DAILY_RESET_HOUR = 5;

function nutritionDayLocal(now = new Date()): string {
  const nutritionDay = new Date(now);
  if (nutritionDay.getHours() < DAILY_RESET_HOUR) {
    nutritionDay.setDate(nutritionDay.getDate() - 1);
  }
  return nutritionDay.toLocaleDateString("en-CA");
}

function shiftDate(date: string, delta: number): string {
  const next = new Date(`${date}T12:00:00`);
  next.setDate(next.getDate() + delta);
  return next.toLocaleDateString("en-CA");
}

function macroPct(value: number, total: number): string {
  if (!total) return "0%";
  return `${Math.min(100, Math.round((value / total) * 100))}%`;
}

function clampWater(value: number): number {
  return Math.max(0, Math.min(20000, Math.round(value)));
}

function AuthView() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [gender, setGender] = useState<Gender>("male");
  const [age, setAge] = useState("30");
  const [height, setHeight] = useState("175");
  const [weight, setWeight] = useState("75");
  const [goal, setGoal] = useState<WeightGoal>("maintain");
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const previewTargets = calculateTargets({
    gender,
    goal,
    age: Number(age) || 30,
    height_cm: Number(height) || 175,
    weight_kg: Number(weight) || 75
  });

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    const supabase = await getSupabase();
    const { error } =
      mode === "sign-in"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({
            email,
            password,
            options: {
              data: {
                gender,
                age: Number(age),
                height_cm: Number(height),
                weight_kg: Number(weight),
                goal,
                ...previewTargets
              }
            }
          });

    if (!error && mode === "sign-up") {
      await saveProfile({
        gender,
        age: Number(age),
        height_cm: Number(height),
        weight_kg: Number(weight),
        goal,
        ...previewTargets
      });
    }

    setBusy(false);
    setMessage(error ? authErrorMessage(error.message) : mode === "sign-up" ? "Conta criada. Já podes entrar." : null);
  }

  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <div className="brand-mark">
          <Sparkles size={22} />
        </div>
        <h1>mealwise</h1>
        <p>Regista refeições por foto. Quando houver dúvida, pergunta antes de contar.</p>
        <form onSubmit={submit} className="auth-form">
          <label>
            Email
            <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" required />
          </label>
          <label>
            Palavra-passe
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
              minLength={6}
              required
            />
          </label>
          {mode === "sign-up" ? (
            <>
              <div className="segmented" aria-label="Sexo">
                <button type="button" className={gender === "female" ? "active" : ""} onClick={() => setGender("female")}>
                  Mulher
                </button>
                <button type="button" className={gender === "male" ? "active" : ""} onClick={() => setGender("male")}>
                  Homem
                </button>
              </div>
              <div className="profile-grid">
                <label>
                  Idade
                  <input value={age} onChange={(event) => setAge(event.target.value)} type="number" min="13" max="100" required />
                </label>
                <label>
                  Altura cm
                  <input value={height} onChange={(event) => setHeight(event.target.value)} type="number" min="120" max="230" required />
                </label>
                <label>
                  Peso kg
                  <input value={weight} onChange={(event) => setWeight(event.target.value)} type="number" min="35" max="300" step="0.1" required />
                </label>
              </div>
              <div className="segmented" aria-label="Objectivo">
                <button type="button" className={goal === "lose" ? "active" : ""} onClick={() => setGoal("lose")}>
                  Perder
                </button>
                <button type="button" className={goal === "maintain" ? "active" : ""} onClick={() => setGoal("maintain")}>
                  Manter
                </button>
                <button type="button" className={goal === "gain" ? "active" : ""} onClick={() => setGoal("gain")}>
                  Ganhar
                </button>
              </div>
              <p className="target-preview">
                Meta: {previewTargets.daily_calorie_target} kcal · {previewTargets.daily_protein_target_g}g proteína ·{" "}
                {previewTargets.daily_water_target_ml} ml água
              </p>
            </>
          ) : null}
          <button className="primary" disabled={busy}>
            {busy ? <Loader2 className="spin" size={18} /> : null}
            {mode === "sign-in" ? "Entrar" : "Criar conta"}
          </button>
        </form>
        <button className="ghost wide" onClick={() => setMode(mode === "sign-in" ? "sign-up" : "sign-in")}>
          {mode === "sign-in" ? "Criar nova conta" : "Já tenho conta"}
        </button>
        {message ? <p className="notice">{message}</p> : null}
      </section>
    </main>
  );
}

function DailyDashboard({
  summary,
  date,
  profile,
  onShift,
  onWaterChange
}: {
  summary: DailySummary | null;
  date: string;
  profile: UserProfile | null;
  onShift: (days: number) => void;
  onWaterChange: (amountMl: number) => Promise<void>;
}) {
  const calories = summary?.calories ?? 0;
  const macroTotal = (summary?.carbs_g ?? 0) + (summary?.fat_g ?? 0);
  const calorieTarget = profile?.daily_calorie_target ?? 0;
  const proteinTarget = profile?.daily_protein_target_g ?? 0;
  const protein = summary?.protein_g ?? 0;
  const water = summary?.water_ml ?? 0;
  const waterTarget = profile?.daily_water_target_ml ?? (profile ? Math.round(profile.weight_kg * 35) : 0);
  const [waterInput, setWaterInput] = useState("0");
  const [waterBusy, setWaterBusy] = useState(false);
  const [waterError, setWaterError] = useState<string | null>(null);
  const [lastQuick, setLastQuick] = useState<number | null>(null);

  useEffect(() => {
    setWaterInput(String(water));
  }, [water]);

  useEffect(() => {
    setLastQuick(null);
    setWaterError(null);
  }, [date]);

  async function saveNextWater(amountMl: number, quickDelta: number | null) {
    const nextAmount = clampWater(amountMl);
    setWaterBusy(true);
    setWaterError(null);
    try {
      await onWaterChange(nextAmount);
      setWaterInput(String(nextAmount));
      setLastQuick(quickDelta);
    } catch (err) {
      setWaterError(err instanceof Error ? err.message : "Não foi possível guardar água.");
    } finally {
      setWaterBusy(false);
    }
  }

  async function submitManualWater(event: React.FormEvent) {
    event.preventDefault();
    const nextAmount = Number(waterInput);
    if (!Number.isInteger(nextAmount) || nextAmount < 0 || nextAmount > 20000) {
      setWaterError("Usa um valor inteiro entre 0 e 20000 ml.");
      return;
    }
    await saveNextWater(nextAmount, null);
  }

  return (
    <section className="dashboard">
      <div className="date-row">
        <button className="icon-button" aria-label="Dia anterior" onClick={() => onShift(-1)}>
          <ChevronLeft size={20} />
        </button>
        <div>
          <span>{date === nutritionDayLocal() ? "Hoje" : date}</span>
          <strong>{summary?.meal_count ?? 0} refeições</strong>
        </div>
        <button className="icon-button" aria-label="Dia seguinte" onClick={() => onShift(1)}>
          <ChevronRight size={20} />
        </button>
      </div>
      <div className="calorie-ring">
        <span>{calories}</span>
        <small>kcal</small>
      </div>
      {profile ? (
        <div className="target-grid">
          <div>
            <span>Calorias</span>
            <strong>
              {calories} / {calorieTarget} kcal
            </strong>
            <i style={{ width: macroPct(calories, calorieTarget) }} />
          </div>
          <div>
            <span>Proteína</span>
            <strong>
              {protein} / {proteinTarget}g
            </strong>
            <i style={{ width: macroPct(protein, proteinTarget) }} />
          </div>
        </div>
      ) : null}
      <div className="macro-grid secondary-macros">
        <div>
          <strong>{summary?.carbs_g ?? 0}g</strong>
          <span>Hidratos</span>
          <i style={{ width: macroPct(summary?.carbs_g ?? 0, macroTotal) }} />
        </div>
        <div>
          <strong>{summary?.fat_g ?? 0}g</strong>
          <span>Gordura</span>
          <i style={{ width: macroPct(summary?.fat_g ?? 0, macroTotal) }} />
        </div>
      </div>
      <div className="micro-row">
        <span>Fibra {summary?.fiber_g ?? 0}g</span>
        <span>Açúcar {summary?.sugar_g ?? 0}g</span>
        <span>Sódio {summary?.sodium_mg ?? 0}mg</span>
      </div>
      <div className="water-panel">
        <div className="water-heading">
          <div>
            <span>Água</span>
            <strong>
              {water} / {waterTarget} ml
            </strong>
          </div>
          <Droplets size={22} />
        </div>
        <i style={{ width: macroPct(water, waterTarget) }} />
        <div className="water-actions">
          <button type="button" className="ghost" onClick={() => saveNextWater(water + 250, 250)} disabled={waterBusy}>
            <Droplets size={16} />
            +250 ml
          </button>
          <button type="button" className="ghost" onClick={() => saveNextWater(water + 500, 500)} disabled={waterBusy}>
            <Droplets size={16} />
            +500 ml
          </button>
          <button type="button" className="icon-button" aria-label="Anular água" onClick={() => saveNextWater(water - (lastQuick ?? 0), null)} disabled={waterBusy || lastQuick === null}>
            <Undo2 size={18} />
          </button>
          <button type="button" className="icon-button danger" aria-label="Repor água" onClick={() => saveNextWater(0, null)} disabled={waterBusy}>
            <RotateCcw size={18} />
          </button>
        </div>
        <form className="water-manual" onSubmit={submitManualWater}>
          <input
            value={waterInput}
            onChange={(event) => setWaterInput(event.target.value)}
            type="number"
            min="0"
            max="20000"
            step="1"
            inputMode="numeric"
            aria-label="Água em ml"
          />
          <button className="primary" disabled={waterBusy}>
            {waterBusy ? <Loader2 className="spin" size={18} /> : <CheckCircle2 size={18} />}
            Guardar ml
          </button>
        </form>
        {waterError ? <p>{waterError}</p> : null}
      </div>
    </section>
  );
}

function MealCard({
  meal,
  onClarify,
  onDelete,
  onRevise
}: {
  meal: Meal;
  onClarify: (mealId: string, answer: string) => Promise<void>;
  onDelete: (mealId: string) => Promise<void>;
  onRevise: (mealId: string, feedback: string) => Promise<void>;
}) {
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const totals = useMemo(
    () =>
      meal.meal_items.reduce(
        (sum, item) => ({
          calories: sum.calories + item.calories,
          protein_g: sum.protein_g + item.protein_g,
          carbs_g: sum.carbs_g + item.carbs_g,
          fat_g: sum.fat_g + item.fat_g
        }),
        { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
      ),
    [meal.meal_items]
  );

  async function submitClarification(event: React.FormEvent) {
    event.preventDefault();
    if (!answer.trim()) return;
    setBusy(true);
    await onClarify(meal.id, answer.trim());
    setAnswer("");
    setBusy(false);
  }

  async function submitRevision(event: React.FormEvent) {
    event.preventDefault();
    if (!feedback.trim()) return;
    setBusy(true);
    await onRevise(meal.id, feedback.trim());
    setFeedback("");
    setBusy(false);
  }

  async function removeMeal() {
    setDeleteBusy(true);
    await onDelete(meal.id);
    setDeleteBusy(false);
  }

  return (
    <article className={`meal-card ${meal.status} ${meal.photo_url ? "with-photo" : "text-only"}`}>
      {meal.photo_url ? <img src={meal.photo_url} alt="" /> : null}
      <div className="meal-body">
        <div className="meal-topline">
          <strong>{meal.description || "Foto da refeição"}</strong>
          <div className="meal-actions">
            {meal.status === "saved" ? (
              <span className="badge saved">
                <CheckCircle2 size={14} /> Guardada
              </span>
            ) : (
              <span className="badge pending">
                <MessageCircleQuestion size={14} /> Falta resposta
              </span>
            )}
            <button className="icon-button danger" type="button" aria-label="Remover refeição" onClick={removeMeal} disabled={deleteBusy}>
              {deleteBusy ? <Loader2 className="spin" size={16} /> : <Trash2 size={16} />}
            </button>
          </div>
        </div>
        {meal.status === "saved" ? (
          <>
            <p className="meal-total">
              {Math.round(totals.calories)} kcal · {Math.round(totals.protein_g)}g proteína · {Math.round(totals.carbs_g)}g hidratos ·{" "}
              {Math.round(totals.fat_g)}g gordura
            </p>
            <ul className="items">
              {meal.meal_items.map((item) => (
                <li key={item.id ?? `${item.food_name}-${item.portion}`}>
                  <span>{item.food_name}</span>
                  <small>
                    {item.portion} · {Math.round(item.calories)} kcal
                  </small>
                </li>
              ))}
            </ul>
            <form className="revise-form" onSubmit={submitRevision}>
              <input
                value={feedback}
                onChange={(event) => setFeedback(event.target.value)}
                placeholder="Ex.: a porção era mais pequena"
              />
              <button className="icon-button send" aria-label="Corrigir com IA" disabled={busy}>
                {busy ? <Loader2 className="spin" size={18} /> : <Send size={18} />}
              </button>
            </form>
          </>
        ) : (
          <form className="clarify-form" onSubmit={submitClarification}>
            <p>{meal.clarification_question}</p>
            <div>
              <input value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder="Responde com porção/detalhes" />
              <button className="icon-button send" aria-label="Enviar esclarecimento" disabled={busy}>
                {busy ? <Loader2 className="spin" size={18} /> : <Send size={18} />}
              </button>
            </div>
          </form>
        )}
      </div>
    </article>
  );
}

function AdminPanel({
  users,
  date,
  onClose
}: {
  users: AdminUserDetails[];
  date: string;
  onClose: () => void;
}) {
  return (
    <section className="admin-panel">
      <div className="admin-heading">
        <div>
          <span>Admin</span>
          <strong>{users.length} utilizadores · {date}</strong>
        </div>
        <button className="ghost" onClick={onClose}>Fechar</button>
      </div>
      <div className="admin-list">
        {users.map((user) => (
          <article className="admin-user" key={user.id}>
            <div className="admin-user-top">
              <strong>{user.email ?? "Sem email"}</strong>
              <span>{user.total_saved_meals} refeições</span>
            </div>
            <small>{user.id}</small>
            {user.profile ? (
              <div className="admin-grid">
                <span>Sexo: {user.profile.gender === "male" ? "Homem" : "Mulher"}</span>
                <span>Idade: {user.profile.age}</span>
                <span>Altura: {user.profile.height_cm} cm</span>
                <span>Peso: {user.profile.weight_kg} kg</span>
                <span>Objectivo: {goalLabel(user.profile.goal)}</span>
                <span>
                  Meta: {user.profile.daily_calorie_target} kcal · {user.profile.daily_protein_target_g}g proteína ·{" "}
                  {user.profile.daily_water_target_ml} ml água
                </span>
              </div>
            ) : (
              <p>Perfil ainda não preenchido.</p>
            )}
            <div className="admin-day">
              <span>Dia: {user.day_calories} kcal</span>
              <span>{user.day_protein_g}g proteína</span>
              <span>
                Água: {user.day_water_ml} / {user.profile?.daily_water_target_ml ?? 0} ml
              </span>
              {user.last_sign_in_at ? <span>Último login: {new Date(user.last_sign_in_at).toLocaleString("pt-PT")}</span> : null}
            </div>
            <div className="admin-meals">
              <strong>Refeições do dia</strong>
              {user.day_meals.length ? (
                user.day_meals.map((meal) => (
                  <div className="admin-meal" key={meal.id}>
                    <div className="admin-meal-top">
                      <span>{meal.description || "Sem descrição"}</span>
                      <small>{meal.status === "saved" ? "Guardada" : "Pendente"}</small>
                    </div>
                    {meal.status === "pending" && meal.clarification_question ? <p>{meal.clarification_question}</p> : null}
                    {meal.meal_items.length ? (
                      <ul>
                        {meal.meal_items.map((item) => (
                          <li key={item.id ?? `${meal.id}-${item.food_name}-${item.portion}`}>
                            <span>{item.food_name}</span>
                            <small>
                              {item.portion} · {Math.round(item.calories)} kcal · {Math.round(item.protein_g)}g proteína
                            </small>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <small>Sem itens guardados.</small>
                    )}
                  </div>
                ))
              ) : (
                <p>Sem refeições neste dia.</p>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function goalLabel(goal: WeightGoal): string {
  if (goal === "lose") return "Perder";
  if (goal === "gain") return "Ganhar";
  return "Manter";
}

function AppView({ session }: { session: Session }) {
  const [date, setDate] = useState(nutritionDayLocal());
  const [meals, setMeals] = useState<Meal[]>([]);
  const [summary, setSummary] = useState<DailySummary | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [description, setDescription] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminUsers, setAdminUsers] = useState<AdminUserDetails[]>([]);
  const [adminBusy, setAdminBusy] = useState(false);

  const loadDay = useCallback(async () => {
    const [{ meals: nextMeals }, { summary: nextSummary }] = await Promise.all([getMeals(date), getDay(date)]);
    setMeals(nextMeals);
    setSummary(nextSummary);
  }, [date]);

  useEffect(() => {
    loadDay().catch((err: Error) => setError(err.message));
  }, [loadDay]);

  useEffect(() => {
    getProfile()
      .then(({ profile }) => setProfile(profile))
      .catch((err: Error) => setError(err.message));
  }, []);

  useEffect(() => {
    getAdminUsers(date)
      .then(({ users }) => {
        setIsAdmin(true);
        setAdminUsers(users);
      })
      .catch(() => setIsAdmin(false));
  }, [date]);

  function pickPhoto(file: File | null) {
    setPhoto(file);
    setPreview((current) => {
      if (current) URL.revokeObjectURL(current);
      return file ? URL.createObjectURL(file) : null;
    });
  }

  async function submitMeal(event: React.FormEvent) {
    event.preventDefault();
    if (!photo && !description.trim()) {
      setError("Adiciona uma foto ou descreve a refeição.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const { meal } = await analyzeMeal({ photo, description, mealDate: date });
      setMeals((current) => [meal, ...current.filter((item) => item.id !== meal.id)]);
      const { summary: nextSummary } = await getDay(date);
      setSummary(nextSummary);
      setDescription("");
      pickPhoto(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "A análise da refeição falhou.");
    } finally {
      setBusy(false);
    }
  }

  async function handleClarify(mealId: string, answer: string) {
    const { meal } = await clarifyMeal(mealId, answer);
    setMeals((current) => current.map((item) => (item.id === meal.id ? meal : item)));
    const { summary: nextSummary } = await getDay(date);
    setSummary(nextSummary);
  }

  async function handleDelete(mealId: string) {
    await deleteMeal(mealId);
    setMeals((current) => current.filter((item) => item.id !== mealId));
    const { summary: nextSummary } = await getDay(date);
    setSummary(nextSummary);
  }

  async function handleRevise(mealId: string, feedback: string) {
    const { meal } = await reviseMeal(mealId, feedback);
    setMeals((current) => current.map((item) => (item.id === meal.id ? meal : item)));
    const { summary: nextSummary } = await getDay(date);
    setSummary(nextSummary);
  }

  async function handleWaterChange(amountMl: number) {
    const { water } = await saveWater(date, amountMl);
    setSummary((current) => (current ? { ...current, water_ml: water.amount_ml } : current));
  }

  async function openAdmin() {
    setAdminBusy(true);
    setError(null);
    try {
      const { users } = await getAdminUsers(date);
      setAdminUsers(users);
      setAdminOpen(true);
      setIsAdmin(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível abrir o admin.");
    } finally {
      setAdminBusy(false);
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <span>mealwise</span>
          <strong>{session.user.email}</strong>
        </div>
        <div className="top-actions">
          {isAdmin ? (
            <button className="icon-button" aria-label="Admin" onClick={openAdmin} disabled={adminBusy}>
              {adminBusy ? <Loader2 className="spin" size={20} /> : <Shield size={20} />}
            </button>
          ) : null}
          <button className="icon-button" aria-label="Terminar sessão" onClick={() => supabase.auth.signOut()}>
            <LogOut size={20} />
          </button>
        </div>
      </header>

      {adminOpen ? <AdminPanel users={adminUsers} date={date} onClose={() => setAdminOpen(false)} /> : null}

      <DailyDashboard
        summary={summary}
        date={date}
        profile={profile}
        onShift={(days) => setDate((current) => shiftDate(current, days))}
        onWaterChange={handleWaterChange}
      />

      <form className="composer" onSubmit={submitMeal}>
        <div className="photo-stack">
        <label className="photo-picker">
          {preview ? <img src={preview} alt="" /> : <Camera size={32} />}
          <input type="file" accept="image/*" onChange={(event) => pickPhoto(event.target.files?.[0] ?? null)} />
        </label>
          <span>Opcional: foto ou galeria</span>
        </div>
        <div className="composer-fields">
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Descreve refeição, porção, azeite/óleo, molhos..."
          />
          <button className="primary" disabled={busy}>
            {busy ? <Loader2 className="spin" size={18} /> : <Sparkles size={18} />}
            Analisar
          </button>
        </div>
      </form>

      {error ? <p className="error">{error}</p> : null}

      <section className="meal-list">
        {meals.length ? (
          meals.map((meal) => (
            <MealCard key={meal.id} meal={meal} onClarify={handleClarify} onDelete={handleDelete} onRevise={handleRevise} />
          ))
        ) : (
          <div className="empty-state">Sem refeições neste dia.</div>
        )}
      </section>
    </main>
  );
}

function authErrorMessage(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("invalid login credentials")) return "Email ou palavra-passe inválidos.";
  if (lower.includes("email not confirmed")) return "Email ainda não confirmado. Desactiva a confirmação no Supabase ou confirma o email.";
  if (lower.includes("user already registered")) return "Esta conta já existe.";
  if (lower.includes("password")) return "Palavra-passe inválida. Usa pelo menos 6 caracteres.";
  return message;
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let subscription: { unsubscribe: () => void } | null = null;

    getSupabase().then((supabaseClient) => {
      supabaseClient.auth.getSession().then(({ data }) => {
        setSession(data.session);
        setReady(true);
      });

      const authListener = supabaseClient.auth.onAuthStateChange((_event, nextSession) => {
        setSession(nextSession);
        setReady(true);
      });

      subscription = authListener.data.subscription;
    }).catch(() => {
      setReady(true);
    });

    return () => subscription?.unsubscribe();
  }, []);

  if (!ready) {
    return (
      <main className="loading">
        <Loader2 className="spin" size={28} />
      </main>
    );
  }

  return session ? <AppView session={session} /> : <AuthView />;
}
