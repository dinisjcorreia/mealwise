import { useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  Camera,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Droplets,
  Flame,
  Loader2,
  LogOut,
  MessageCircleQuestion,
  Pill,
  Plus,
  RotateCcw,
  Send,
  Shield,
  Sparkles,
  Trash2,
  Undo2,
  Utensils,
} from "lucide-react";
import {
  analyzeMeal,
  clarifyMeal,
  deleteMeal,
  getAdminUsers,
  getDay,
  getProfile,
  reviseMeal,
  saveCreatine,
  saveProfile,
  saveWater,
} from "./api";
import { getSupabase, supabase } from "./supabase";
import { summarizeDay } from "./shared/nutrition";
import { calculateTargets } from "./shared/targets";
import type {
  AdminUserDetails,
  DailySummary,
  Gender,
  Meal,
  UserProfile,
  WeightGoal,
} from "./shared/types";

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

function Brand() {
  return (
    <a className="brand" href="#" aria-label="mealwise, início">
      <img src="/icon.svg" alt="" width="38" height="38" />
      <span>
        mealwise<span className="brand-dot">.</span>
      </span>
    </a>
  );
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
    weight_kg: Number(weight) || 75,
  });

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const supabase = await getSupabase();
      const { data, error } =
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
                  ...previewTargets,
                },
              },
            });

      if (!error && mode === "sign-up" && data.session) {
        await saveProfile({
          gender,
          age: Number(age),
          height_cm: Number(height),
          weight_kg: Number(weight),
          goal,
          ...previewTargets,
        });
      }

      setMessage(
        error
          ? authErrorMessage(error.message)
          : mode === "sign-up"
            ? data.session ? "Conta criada." : "Conta criada. Confirma o teu email antes de entrar."
            : null,
      );
    } catch (err) {
      setMessage(
        err instanceof Error
          ? authErrorMessage(err.message)
          : "Não foi possível entrar. Tenta novamente.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-story">
        <Brand />
        <div className="auth-story-copy">
          <h2>
            Conhece o teu prato.
            <br />
            Cuida do teu dia.
          </h2>
          <p>
            Uma foto, menos contas. Refeições, nutrientes e água, num só lugar.
          </p>
        </div>
        <img
          className="plate-art"
          src="/plate.svg"
          alt="Ilustração de um prato com vegetais, arroz e salmão"
        />
        <div className="auth-story-note">
          <Camera size={22} />
          <p>
            Tu registas a refeição.
            <br />
            <strong>O mealwise trata das contas.</strong>
          </p>
        </div>
      </section>
      <section className="auth-panel">
        <div className="auth-mobile-brand">
          <Brand />
        </div>
        <h1>
          {mode === "sign-in" ? "Bom ter-te por aqui." : "Um bom começo."}
        </h1>
        <p>
          {mode === "sign-in"
            ? "Entra para continuar o teu diário alimentar."
            : "Cria a tua conta e encontra as metas para ti."}
        </p>
        <form onSubmit={submit} className="auth-form">
          <label>
            Email
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              placeholder="nome@exemplo.pt"
              autoComplete="email"
              required
            />
          </label>
          <label>
            Palavra-passe
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              autoComplete={
                mode === "sign-in" ? "current-password" : "new-password"
              }
              minLength={6}
              placeholder={
                mode === "sign-in"
                  ? "A tua palavra-passe"
                  : "Pelo menos 6 caracteres"
              }
              required
            />
          </label>
          {mode === "sign-up" ? (
            <>
              <div className="segmented" role="group" aria-label="Sexo">
                <button
                  type="button"
                  aria-pressed={gender === "female"}
                  className={gender === "female" ? "active" : ""}
                  onClick={() => setGender("female")}
                >
                  Mulher
                </button>
                <button
                  type="button"
                  aria-pressed={gender === "male"}
                  className={gender === "male" ? "active" : ""}
                  onClick={() => setGender("male")}
                >
                  Homem
                </button>
              </div>
              <div className="profile-grid">
                <label>
                  Idade
                  <input
                    value={age}
                    onChange={(event) => setAge(event.target.value)}
                    type="number"
                    min="13"
                    max="100"
                    required
                  />
                </label>
                <label>
                  Altura cm
                  <input
                    value={height}
                    onChange={(event) => setHeight(event.target.value)}
                    type="number"
                    min="120"
                    max="230"
                    required
                  />
                </label>
                <label>
                  Peso kg
                  <input
                    value={weight}
                    onChange={(event) => setWeight(event.target.value)}
                    type="number"
                    min="35"
                    max="300"
                    step="0.1"
                    required
                  />
                </label>
              </div>
              <div className="segmented" role="group" aria-label="Objectivo">
                <button
                  type="button"
                  aria-pressed={goal === "lose"}
                  className={goal === "lose" ? "active" : ""}
                  onClick={() => setGoal("lose")}
                >
                  Perder
                </button>
                <button
                  type="button"
                  aria-pressed={goal === "maintain"}
                  className={goal === "maintain" ? "active" : ""}
                  onClick={() => setGoal("maintain")}
                >
                  Manter
                </button>
                <button
                  type="button"
                  aria-pressed={goal === "gain"}
                  className={goal === "gain" ? "active" : ""}
                  onClick={() => setGoal("gain")}
                >
                  Ganhar
                </button>
              </div>
              <p className="target-preview">
                Meta: {previewTargets.daily_calorie_target} kcal ·{" "}
                {previewTargets.daily_protein_target_g}g proteína ·{" "}
                {previewTargets.daily_water_target_ml} ml água
              </p>
            </>
          ) : null}
          <button className="primary" disabled={busy}>
            {busy ? <Loader2 className="spin" size={18} /> : null}
            {mode === "sign-in" ? "Entrar" : "Criar conta"}
          </button>
        </form>
        <button
          className="ghost wide"
          disabled={busy}
          onClick={() => setMode(mode === "sign-in" ? "sign-up" : "sign-in")}
        >
          {mode === "sign-in" ? "Criar nova conta" : "Já tenho conta"}
        </button>
        {message ? (
          <p className="notice" role="status">
            {message}
          </p>
        ) : null}
        <p className="auth-footnote">Pequenos hábitos. Mais equilíbrio.</p>
      </section>
    </main>
  );
}

function DailyDashboard({
  summary,
  date,
  profile,
  onShift,
  onWaterChange,
  onCreatineChange,
  disabled,
}: {
  disabled: boolean;
  summary: DailySummary | null;
  date: string;
  profile: UserProfile | null;
  onShift: (days: number) => void;
  onWaterChange: (amountMl: number) => Promise<void>;
  onCreatineChange: (taken: boolean) => Promise<void>;
}) {
  const calories = summary?.calories ?? 0;
  const calorieTarget = profile?.daily_calorie_target ?? 0;
  const proteinTarget = profile?.daily_protein_target_g ?? 0;
  const protein = summary?.protein_g ?? 0;
  const water = summary?.water_ml ?? 0;
  const waterTarget =
    profile?.daily_water_target_ml ??
    (profile ? Math.round(profile.weight_kg * 35) : 0);
  const creatineTaken = summary?.creatine_taken ?? false;
  const [waterInput, setWaterInput] = useState("0");
  const [waterBusy, setWaterBusy] = useState(false);
  const [waterError, setWaterError] = useState<string | null>(null);
  const [lastQuick, setLastQuick] = useState<number | null>(null);
  const [creatineBusy, setCreatineBusy] = useState(false);
  const [creatineError, setCreatineError] = useState<string | null>(null);

  useEffect(() => {
    setWaterInput(String(water));
  }, [water]);

  useEffect(() => {
    setLastQuick(null);
    setWaterError(null);
    setCreatineError(null);
  }, [date]);

  async function saveNextWater(amountMl: number, quickDelta: number | null) {
    const nextAmount = clampWater(amountMl);
    setWaterBusy(true);
    setWaterError(null);
    try {
      await onWaterChange(nextAmount);
      setWaterInput(String(nextAmount));
      setLastQuick(quickDelta === null ? null : nextAmount - water);
    } catch (err) {
      setWaterError(
        err instanceof Error ? err.message : "Não foi possível guardar água.",
      );
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

  async function toggleCreatine(nextTaken: boolean) {
    setCreatineBusy(true);
    setCreatineError(null);
    try {
      await onCreatineChange(nextTaken);
    } catch (err) {
      setCreatineError(
        err instanceof Error
          ? err.message
          : "Não foi possível guardar creatina.",
      );
    } finally {
      setCreatineBusy(false);
    }
  }

  return (
    <section className="dashboard" aria-label="Resumo diário">
      <div className="day-heading">
        <div>
          <h1>O teu dia, em equilíbrio.</h1>
          <p>Uma refeição de cada vez.</p>
          <a className="mobile-add-meal" href="#add-meal">
            <Plus size={16} />
            Registar refeição
          </a>
        </div>
        <div className="date-row">
          <button
            className="icon-button"
            aria-label="Dia anterior"
            onClick={() => onShift(-1)}
          >
            <ChevronLeft size={18} />
          </button>
          <div>
            <CalendarDays size={17} />
            <span>
              {date === nutritionDayLocal()
                ? "Hoje"
                : new Date(`${date}T12:00:00`).toLocaleDateString("pt-PT", {
                    day: "numeric",
                    month: "short",
                  })}
            </span>
            <small>
              {new Date(`${date}T12:00:00`).toLocaleDateString("pt-PT", {
                day: "numeric",
                month: "long",
              })}
            </small>
          </div>
          <button
            className="icon-button"
            aria-label="Dia seguinte"
            onClick={() => onShift(1)}
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
      <div className="overview-grid">
        <div className="nutrition-panel">
          <div className="section-heading">
            <h2>
              <Flame size={19} /> Nutrição do dia
            </h2>
            <span>{summary?.meal_count ?? 0} refeições registadas</span>
          </div>
          <div className="nutrition-content">
            <div className="energy-summary">
              <div
                className="calorie-ring"
                style={{
                  background: `conic-gradient(var(--blue) ${macroPct(calories, calorieTarget)}, #d8e4fa 0)`,
                }}
                role="meter"
                aria-label="Calorias consumidas"
                aria-valuemin={0}
                aria-valuemax={calorieTarget || Math.max(calories, 1)}
                aria-valuenow={Math.min(calories, calorieTarget || calories)}
                aria-valuetext={`${calories} de ${calorieTarget} kcal`}
              >
                <div>
                  <Flame size={21} />
                  <strong>
                    {Math.round(calories).toLocaleString("pt-PT")}
                  </strong>
                  <span>kcal consumidas</span>
                </div>
              </div>
              <p className="energy-target">
                {calorieTarget ? (
                  <>
                    Meta diária{" "}
                    <strong>
                      {calorieTarget.toLocaleString("pt-PT")} kcal
                    </strong>
                  </>
                ) : (
                  "Total de calorias registadas"
                )}
              </p>
              {calorieTarget ? (
                <span className="remaining">
                  {Math.abs(calorieTarget - calories).toLocaleString("pt-PT")}{" "}
                  kcal{" "}
                  {calories > calorieTarget ? "acima da meta" : "por consumir"}
                </span>
              ) : null}
            </div>
            <div className="macro-summary">
              <div className="protein-macro">
                <div>
                  <span>
                    <i className="macro-dot protein" />
                    Proteína
                  </span>
                  <strong>
                    {protein}
                    <small> / {proteinTarget} g</small>
                  </strong>
                </div>
                <div className="progress-track">
                  <i style={{ width: macroPct(protein, proteinTarget) }} />
                </div>
                <small>
                  {proteinTarget
                    ? `${Math.round((protein / proteinTarget) * 100)}% da meta diária`
                    : "Proteína registada"}
                </small>
              </div>
              <div className="macro-grid">
                <div>
                  <span>
                    <i className="macro-dot carbs" />
                    Hidratos
                  </span>
                  <strong>
                    {summary?.carbs_g ?? 0}
                    <small> g</small>
                  </strong>
                </div>
                <div>
                  <span>
                    <i className="macro-dot fat" />
                    Gordura
                  </span>
                  <strong>
                    {summary?.fat_g ?? 0}
                    <small> g</small>
                  </strong>
                </div>
              </div>
              <div className="micro-row">
                <div>
                  <span>Fibra</span>
                  <strong>
                    {summary?.fiber_g ?? 0} <small>g</small>
                  </strong>
                </div>
                <div>
                  <span>Açúcar</span>
                  <strong>
                    {summary?.sugar_g ?? 0} <small>g</small>
                  </strong>
                </div>
                <div>
                  <span>Sódio</span>
                  <strong>
                    {summary?.sodium_mg ?? 0} <small>mg</small>
                  </strong>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="habit-panels">
          <section className="water-panel" aria-label="Água">
            <div className="water-heading">
              <h2>
                <Droplets size={19} /> Hidratação
              </h2>
              <span>
                {waterTarget
                  ? `${Math.round((water / waterTarget) * 100)}%`
                  : "0%"}
              </span>
            </div>
            <div className="water-amount">
              <strong>
                {(water / 1000).toLocaleString("pt-PT", {
                  maximumFractionDigits: 2,
                })}
                <span> L</span>
              </strong>
              <span>
                de{" "}
                {(waterTarget / 1000).toLocaleString("pt-PT", {
                  maximumFractionDigits: 2,
                })}{" "}
                L por dia
              </span>
            </div>
            <div className="water-drops" aria-hidden="true">
              {Array.from({ length: 10 }, (_, index) => (
                <Droplets
                  key={index}
                  size={22}
                  className={
                    waterTarget > 0 && (water / waterTarget) * 10 >= index + 1
                      ? "filled"
                      : ""
                  }
                />
              ))}
            </div>
            <div className="progress-track">
              <i style={{ width: macroPct(water, waterTarget) }} />
            </div>
            <div className="water-actions">
              <button
                type="button"
                className="ghost"
                onClick={() => saveNextWater(water + 720, 720)}
                disabled={disabled || waterBusy}
              >
                <Plus size={16} />
                720 ml
              </button>
              <button
                type="button"
                className="ghost"
                onClick={() => saveNextWater(water + 500, 500)}
                disabled={disabled || waterBusy}
              >
                <Plus size={16} />
                500 ml
              </button>
              <button
                type="button"
                className="icon-button"
                aria-label="Anular água"
                onClick={() => saveNextWater(water - (lastQuick ?? 0), null)}
                disabled={disabled || waterBusy || lastQuick === null}
              >
                <Undo2 size={17} />
              </button>
              <button
                type="button"
                className="icon-button danger"
                aria-label="Repor água"
                onClick={() => saveNextWater(0, null)}
                disabled={disabled || waterBusy}
              >
                <RotateCcw size={17} />
              </button>
            </div>
            <details className="water-exact">
              <summary>
                Definir quantidade exata <ChevronRight size={14} />
              </summary>
              <form className="water-manual" onSubmit={submitManualWater}>
                <label className="sr-only" htmlFor="water-ml">
                  Total de água em ml
                </label>
                <input
                  id="water-ml"
                  value={waterInput}
                  onChange={(event) => setWaterInput(event.target.value)}
                  type="number"
                  min="0"
                  max="20000"
                  step="1"
                  inputMode="numeric"
                />
                <button className="primary" disabled={disabled || waterBusy}>
                  {waterBusy ? <Loader2 className="spin" size={16} /> : null}
                  Guardar ml
                </button>
              </form>
            </details>
            {waterError ? (
              <p className="error" role="alert">
                {waterError}
              </p>
            ) : null}
          </section>
          <section className="creatine-panel" aria-label="Creatina">
            <div className="creatine-row">
              <span className="habit-icon">
                <Pill size={20} />
              </span>
              <div className="creatine-copy">
                <h2>Creatina</h2>
                <span>
                  {creatineTaken
                    ? "Tomada. Hábito em dia!"
                    : "Já tomaste hoje?"}
                </span>
              </div>
              <label className="creatine-toggle">
                <input
                  type="checkbox"
                  checked={creatineTaken}
                  onChange={(event) => toggleCreatine(event.target.checked)}
                  disabled={disabled || creatineBusy}
                  aria-label="Creatina tomada hoje"
                />
                <span>
                  {creatineBusy ? (
                    <Loader2 className="spin" size={16} />
                  ) : (
                    <CheckCircle2 size={16} />
                  )}
                </span>
              </label>
            </div>
            {creatineError ? (
              <p className="error" role="alert">
                {creatineError}
              </p>
            ) : null}
          </section>
        </div>
      </div>
    </section>
  );
}

function MealCard({
  meal,
  onClarify,
  onDelete,
  onRevise,
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
  const [error, setError] = useState<string | null>(null);
  const totals = useMemo(
    () =>
      meal.meal_items.reduce(
        (sum, item) => ({
          calories: sum.calories + item.calories,
          protein_g: sum.protein_g + item.protein_g,
          carbs_g: sum.carbs_g + item.carbs_g,
          fat_g: sum.fat_g + item.fat_g,
        }),
        { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
      ),
    [meal.meal_items],
  );

  async function submitClarification(event: React.FormEvent) {
    event.preventDefault();
    if (!answer.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await onClarify(meal.id, answer.trim());
      setAnswer("");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível guardar a resposta.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function submitRevision(event: React.FormEvent) {
    event.preventDefault();
    if (!feedback.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await onRevise(meal.id, feedback.trim());
      setFeedback("");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível corrigir a refeição.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function removeMeal() {
    setDeleteBusy(true);
    setError(null);
    try {
      await onDelete(meal.id);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível remover a refeição.",
      );
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <article
      className={`meal-card ${meal.status} ${meal.photo_url ? "with-photo" : "text-only"}`}
    >
      {meal.photo_url ? (
        <img src={meal.photo_url} alt="Foto da refeição" loading="lazy" />
      ) : null}
      <div className="meal-body">
        <div className="meal-topline">
          <div className="meal-title">
            <span className="meal-time">
              {new Date(meal.created_at).toLocaleTimeString("pt-PT", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
            <h3>{meal.description || "Foto da refeição"}</h3>
          </div>
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
            <button
              className="icon-button danger"
              type="button"
              aria-label="Remover refeição"
              onClick={removeMeal}
              disabled={deleteBusy || busy}
            >
              {deleteBusy ? (
                <Loader2 className="spin" size={16} />
              ) : (
                <Trash2 size={16} />
              )}
            </button>
          </div>
        </div>
        {meal.status === "saved" ? (
          <>
            <div className="meal-total">
              <strong>
                {Math.round(totals.calories)} <small>kcal</small>
              </strong>
              <span>{Math.round(totals.protein_g)} g proteína</span>
              <span>{Math.round(totals.carbs_g)} g hidratos</span>
              <span>{Math.round(totals.fat_g)} g gordura</span>
            </div>
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
            {!meal.clarification_question ? <details className="meal-revision">
              <summary>
                Ajustar esta refeição <ChevronRight size={14} />
              </summary>
              <form className="revise-form" onSubmit={submitRevision}>
                <input
                  value={feedback}
                  maxLength={4000}
                  onChange={(event) => setFeedback(event.target.value)}
                  placeholder="Ex.: a porção era mais pequena"
                  aria-label="Correção da refeição"
                />
                <button
                  className="icon-button send"
                  aria-label="Corrigir com IA"
                  disabled={busy || deleteBusy}
                >
                  {busy ? (
                    <Loader2 className="spin" size={18} />
                  ) : (
                    <Send size={18} />
                  )}
                </button>
              </form>
            </details> : null}
          </>
        ) : null}
        {meal.status === "pending" || meal.clarification_question ? (
          <form className="clarify-form" onSubmit={submitClarification}>
            <p>{meal.clarification_question}</p>
            <div>
              <input
                value={answer}
                maxLength={4000}
                onChange={(event) => setAnswer(event.target.value)}
                placeholder="Responde com porção/detalhes"
                aria-label="Resposta sobre a refeição"
              />
              <button
                className="icon-button send"
                aria-label="Enviar esclarecimento"
                disabled={busy || deleteBusy}
              >
                {busy ? (
                  <Loader2 className="spin" size={18} />
                ) : (
                  <Send size={18} />
                )}
              </button>
            </div>
          </form>
        ) : null}
        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </article>
  );
}

function AdminPanel({
  users,
  date,
  onClose,
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
          <strong>
            {users.length} utilizadores · {date}
          </strong>
        </div>
        <button className="ghost" onClick={onClose}>
          Fechar
        </button>
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
                <span>
                  Sexo: {user.profile.gender === "male" ? "Homem" : "Mulher"}
                </span>
                <span>Idade: {user.profile.age}</span>
                <span>Altura: {user.profile.height_cm} cm</span>
                <span>Peso: {user.profile.weight_kg} kg</span>
                <span>Objectivo: {goalLabel(user.profile.goal)}</span>
                <span>
                  Meta: {user.profile.daily_calorie_target} kcal ·{" "}
                  {user.profile.daily_protein_target_g}g proteína ·{" "}
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
                Água: {user.day_water_ml} /{" "}
                {user.profile?.daily_water_target_ml ?? 0} ml
              </span>
              <span>
                Creatina: {user.day_creatine_taken ? "Tomada" : "Por tomar"}
              </span>
              {user.last_sign_in_at ? (
                <span>
                  Último login:{" "}
                  {new Date(user.last_sign_in_at).toLocaleString("pt-PT")}
                </span>
              ) : null}
            </div>
            <div className="admin-meals">
              <strong>Refeições do dia</strong>
              {user.day_meals.length ? (
                user.day_meals.map((meal) => (
                  <div className="admin-meal" key={meal.id}>
                    <div className="admin-meal-top">
                      <span>{meal.description || "Sem descrição"}</span>
                      <small>
                        {meal.status === "saved" ? "Guardada" : "Pendente"}
                      </small>
                    </div>
                    {meal.status === "pending" &&
                    meal.clarification_question ? (
                      <p>{meal.clarification_question}</p>
                    ) : null}
                    {meal.meal_items.length ? (
                      <ul>
                        {meal.meal_items.map((item) => (
                          <li
                            key={
                              item.id ??
                              `${meal.id}-${item.food_name}-${item.portion}`
                            }
                          >
                            <span>{item.food_name}</span>
                            <small>
                              {item.portion} · {Math.round(item.calories)} kcal
                              · {Math.round(item.protein_g)}g proteína
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

  useEffect(() => {
    let today = nutritionDayLocal();
    const checkDay = () => {
      const next = nutritionDayLocal();
      if (next === today) return;
      const previous = today;
      today = next;
      setDate(current => current === previous ? next : current);
    };
    const timer = window.setInterval(checkDay, 60000);
    document.addEventListener("visibilitychange", checkDay);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", checkDay); };
  }, []);

  const activeView = useRef({ date });
  if (activeView.current.date !== date) activeView.current = { date };
  const view = activeView.current;
  const [loadedDate, setLoadedDate] = useState<string | null>(null);
  const dayReady = loadedDate === date;
  const currentSummary = dayReady && summary ? summarizeDay(date, meals, summary.water_ml, summary.creatine_taken) : null;

  useEffect(() => {
    const controller = new AbortController();
    setLoadedDate(null);
    setMeals([]);
    setSummary(null);
    setAdminOpen(false);
    setError(null);
    getDay(date, controller.signal).then(({ meals, summary }) => {
      if (controller.signal.aborted) return;
      setMeals(meals);
      setSummary(summary);
      setLoadedDate(date);
    }).catch((err: Error) => { if (!controller.signal.aborted) setError(err.message); });
    return () => controller.abort();
  }, [date]);

  useEffect(() => {
    let active = true;
    getProfile().then(async ({ profile, isAdmin }) => {
      if (!active) return;
      const metadata = session.user.user_metadata;
      if (!profile && metadata.gender && metadata.age && metadata.height_cm && metadata.weight_kg && metadata.goal) {
        // Email-confirmation signups have no session until the first login.
        profile = (await saveProfile(metadata as UserProfile)).profile;
      }
      if (active) { setProfile(profile); setIsAdmin(isAdmin); }
    }).catch((err: Error) => { if (active) setError(err.message); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const url = photo ? URL.createObjectURL(photo) : null;
    setPreview(url);
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [photo]);

  function pickPhoto(file: File | null) { setPhoto(file); }

  async function submitMeal(event: React.FormEvent) {
    event.preventDefault();
    if (!dayReady || busy) return;
    if (!photo && !description.trim()) {
      setError("Adiciona uma foto ou descreve a refeição.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const { meal, warning } = await analyzeMeal({
        photo,
        description,
        mealDate: date,
      });
      if (activeView.current !== view) return;
      setMeals((current) => [
        meal,
        ...current.filter((item) => item.id !== meal.id),
      ]);
      setDescription("");
      pickPhoto(null);
      if (warning) setError(warning);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "A análise da refeição falhou.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleClarify(mealId: string, answer: string) {
    const { meal } = await clarifyMeal(mealId, answer);
    if (activeView.current !== view) return;
    setMeals((current) =>
      current.map((item) => (item.id === meal.id ? meal : item)),
    );
  }

  async function handleDelete(mealId: string) {
    await deleteMeal(mealId);
    if (activeView.current !== view) return;
    setMeals((current) => current.filter((item) => item.id !== mealId));
  }

  async function handleRevise(mealId: string, feedback: string) {
    const { meal } = await reviseMeal(mealId, feedback);
    if (activeView.current !== view) return;
    setMeals((current) =>
      current.map((item) => (item.id === meal.id ? meal : item)),
    );
  }

  async function handleWaterChange(amountMl: number) {
    const { water } = await saveWater(date, amountMl);
    if (activeView.current !== view) return;
    setSummary((current) =>
      current ? { ...current, water_ml: water.amount_ml } : current,
    );
  }

  async function handleCreatineChange(taken: boolean) {
    const { creatine } = await saveCreatine(date, taken);
    if (activeView.current !== view) return;
    setSummary((current) =>
      current ? { ...current, creatine_taken: creatine.taken } : current,
    );
  }

  async function openAdmin() {
    setAdminBusy(true);
    setError(null);
    try {
      const { users } = await getAdminUsers(date);
      if (activeView.current !== view) return;
      setAdminUsers(users);
      setAdminOpen(true);
      setIsAdmin(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Não foi possível abrir o admin.",
      );
    } finally {
      setAdminBusy(false);
    }
  }

  return (
    <main className="app-shell" id="top">
      <header className="topbar">
        <Brand />
        <span className="header-section">O teu diário alimentar</span>
        <div className="top-actions">
          <span className="account-email">{session.user.email}</span>
          <span className="avatar" aria-hidden="true">
            {session.user.email?.slice(0, 1).toUpperCase() || "M"}
          </span>
          {isAdmin ? (
            <button
              className="icon-button"
              aria-label="Admin"
              onClick={openAdmin}
              disabled={adminBusy}
            >
              {adminBusy ? (
                <Loader2 className="spin" size={19} />
              ) : (
                <Shield size={19} />
              )}
            </button>
          ) : null}
          <button
            className="icon-button"
            aria-label="Terminar sessão"
            onClick={() => supabase.auth.signOut()}
          >
            <LogOut size={19} />
          </button>
        </div>
      </header>
      {adminOpen ? (
        <AdminPanel
          users={adminUsers}
          date={date}
          onClose={() => setAdminOpen(false)}
        />
      ) : null}
      <DailyDashboard
        key={date}
        summary={currentSummary}
        disabled={!dayReady}
        date={date}
        profile={profile}
        onShift={(days) => setDate((current) => shiftDate(current, days))}
        onWaterChange={handleWaterChange}
        onCreatineChange={handleCreatineChange}
      />
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="journal-grid">
        <section className="journal" aria-labelledby="journal-title">
          <div className="section-heading journal-heading">
            <div>
              <h2 id="journal-title">
                {date === nutritionDayLocal()
                  ? "À mesa, hoje"
                  : "À mesa, neste dia"}
              </h2>
              <p>O que já fez parte do teu dia.</p>
            </div>
            <a className="add-meal-link" href="#add-meal">
              <Plus size={17} /> Adicionar
            </a>
          </div>
          <div className="meal-list">
            {!dayReady ? <p role="status">A carregar o dia…</p> : meals.length ? (
              meals.map((meal) => (
                <MealCard
                  key={meal.id}
                  meal={meal}
                  onClarify={handleClarify}
                  onDelete={handleDelete}
                  onRevise={handleRevise}
                />
              ))
            ) : (
              <div className="empty-state">
                <span className="empty-icon">
                  <Utensils size={28} />
                </span>
                <h3>O teu diário começa aqui.</h3>
                <p>Adiciona uma foto ou descreve a tua primeira refeição.</p>
                <a href="#add-meal" className="ghost">
                  <Plus size={17} />
                  Registar refeição
                </a>
              </div>
            )}
          </div>
        </section>
        <section
          className="composer-panel"
          id="add-meal"
          aria-labelledby="composer-title"
        >
          <div className="section-heading">
            <h2 id="composer-title">O que comeste?</h2>
            <span className="composer-icon">
              <Sparkles size={19} />
            </span>
          </div>
          <p>Uma foto ou umas palavras. Nós fazemos as contas.</p>
          <form className="composer" onSubmit={submitMeal}>
            <label className={`photo-picker ${preview ? "has-photo" : ""}`}>
              {preview ? (
                <>
                  <img src={preview} alt="Foto escolhida para análise" />
                  <span className="photo-replace">Trocar foto</span>
                </>
              ) : (
                <>
                  <span className="camera-icon">
                    <Camera size={26} />
                  </span>
                  <strong>Adicionar foto</strong>
                  <span>Tira uma foto ou escolhe da galeria</span>
                </>
              )}
              <input
                type="file"
                accept="image/*"
                aria-label="Adicionar foto da refeição"
                disabled={busy}
                onChange={(event) => pickPhoto(event.target.files?.[0] ?? null)}
              />
            </label>
            {photo ? (
              <button
                type="button"
                className="photo-remove"
                disabled={busy}
                onClick={() => pickPhoto(null)}
              >
                <Trash2 size={14} />
                Remover foto
              </button>
            ) : null}
            <div className="composer-divider">
              <span>ou descreve a refeição</span>
            </div>
            <label className="sr-only" htmlFor="meal-description">
              Descrição da refeição
            </label>
            <textarea
              id="meal-description"
              value={description}
              maxLength={4000}
              disabled={busy}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Ex.: salmão grelhado, 3 colheres de arroz e salada com azeite..."
            />
            <button className="primary" disabled={busy || !dayReady}>
              {busy ? (
                <Loader2 className="spin" size={18} />
              ) : (
                <Sparkles size={18} />
              )}
              {busy ? "A analisar refeição…" : "Analisar refeição"}
              {!busy ? <ArrowUpRight size={18} /> : null}
            </button>
          </form>
          <p className="composer-note">
            <MessageCircleQuestion size={16} />
            Se houver dúvidas sobre a porção, perguntamos antes de contar.
          </p>
          <p className="composer-note">
            A descrição e a foto são analisadas pelo Gemini. Se falhar, usamos Cloudflare Workers AI.
          </p>
        </section>
      </div>
      <footer className="app-footer">
        <span>mealwise. Pequenos hábitos, mais equilíbrio.</span>
        <span>Um novo dia começa às 05:00.</span>
      </footer>
    </main>
  );
}

function authErrorMessage(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("invalid login credentials"))
    return "Email ou palavra-passe inválidos.";
  if (lower.includes("email not confirmed"))
    return "Confirma o teu email antes de entrar. Procura a mensagem de confirmação na tua caixa de entrada.";
  if (lower.includes("user already registered")) return "Esta conta já existe.";
  if (lower.includes("password"))
    return "Palavra-passe inválida. Usa pelo menos 6 caracteres.";
  return message;
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    let subscription: { unsubscribe: () => void } | null = null;

    getSupabase()
      .then((supabaseClient) => {
        if (!active) return;
        supabaseClient.auth.getSession().then(({ data }) => {
          if (!active) return;
          setSession(data.session);
          setReady(true);
        }).catch(() => { if (active) setReady(true); });

        const authListener = supabaseClient.auth.onAuthStateChange(
          (_event, nextSession) => {
            setSession(nextSession);
            setReady(true);
          },
        );

        subscription = authListener.data.subscription;
      })
      .catch(() => {
        setReady(true);
      });

    return () => { active = false; subscription?.unsubscribe(); };
  }, []);

  if (!ready) {
    return (
      <main className="loading" role="status" aria-label="A carregar mealwise">
        <Loader2 className="spin" size={28} />
      </main>
    );
  }

  return session ? <AppView key={session.user.id} session={session} /> : <AuthView />;
}
