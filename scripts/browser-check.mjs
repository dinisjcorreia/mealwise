import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";

// Production build, synthetic account/data only; no remote writes or screenshots.
const server = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "preview", "--host", "127.0.0.1", "--port", "4179", "--strictPort"], { stdio: "pipe" });
let browser;
try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Preview startup timed out")), 10000);
    server.stdout.on("data", data => { if (data.toString().includes("4179")) { clearTimeout(timer); resolve(); } });
    server.once("exit", code => { clearTimeout(timer); reject(new Error(`Preview exited ${code}`)); });
  });
  browser = await chromium.launch();
  const context = await browser.newContext({ serviceWorkers: "block", timezoneId: "Europe/Lisbon" });
  const user = { id: "11111111-1111-1111-1111-111111111111", email: "test@example.test", aud: "authenticated", user_metadata: {} };
  await context.addInitScript(session => localStorage.setItem("sb-mock-auth-token", JSON.stringify(session)), {
    access_token: "test-session", refresh_token: "test-refresh", expires_at: Math.floor(Date.now() / 1000) + 2592000, user
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  const item = { food_name: "Ovo", portion: "1", calories: 72, protein_g: 6, carbs_g: 0.4, fat_g: 5, fiber_g: 0, sugar_g: 0, sodium_mg: 70, confidence: 0.9 };
  let meal = { id: "22222222-2222-2222-2222-222222222222", status: "saved", description: "Ovo", meal_items: [item], photo_path: null,
    photo_url: null, clarification_question: null, ai_notes: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  let dayRequests = 0, adminRequests = 0, delayNextDay = false, delayedDate;
  await page.route("**/auth/v1/**", route => route.fulfill({ json: user }));
  await page.route("**/api/**", async route => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (path === "/api/config") return route.fulfill({ json: { supabaseUrl: "https://mock.supabase.co", supabaseAnonKey: "test-key" } });
    if (path === "/api/profile") return route.fulfill({ json: { isAdmin: false, profile: { daily_calorie_target: 2000, daily_protein_target_g: 120, daily_water_target_ml: 2500 } } });
    if (path.startsWith("/api/admin/")) { adminRequests++; return route.fulfill({ status: 403, json: {} }); }
    if (path.startsWith("/api/days/")) {
      dayRequests++;
      const date = path.split("/").at(-1);
      if (delayNextDay) { delayNextDay = false; delayedDate = date; await new Promise(resolve => setTimeout(resolve, 600)); }
      return route.fulfill({ json: { meals: [{ ...meal, meal_date: date, description: date === delayedDate ? "Stale meal" : "Ovo" }],
        summary: { date, water_ml: date === delayedDate ? 999 : 500, creatine_taken: false } } });
    }
    if (path.endsWith("/revise")) {
      meal = { ...meal, clarification_question: "Qual era a porção?" };
      return route.fulfill({ json: { meal } });
    }
    if (path.endsWith("/clarify")) {
      meal = { ...meal, clarification_question: null, meal_items: [{ ...item, calories: 144, portion: "2" }] };
      return route.fulfill({ json: { meal } });
    }
    if (path.startsWith("/api/water/")) return route.fulfill({ json: { water: { amount_ml: JSON.parse(route.request().postData()).amount_ml } } });
    if (route.request().method() === "DELETE") return route.fulfill({ json: { ok: true } });
    throw new Error(`Unexpected request ${path}`);
  });
  await page.goto("http://127.0.0.1:4179");
  await page.getByRole("heading", { name: "Ovo", exact: true }).waitFor();
  assert.equal(dayRequests, 1, "one request loads the day");
  assert.equal(adminRequests, 0, "ordinary dashboard does not download admin data");
  await page.getByText("Ajustar esta refeição", { exact: false }).click();
  await page.getByRole("textbox", { name: "Correção da refeição" }).fill("Era maior");
  await page.getByRole("button", { name: "Corrigir com IA" }).click();
  await page.getByText("Qual era a porção?").waitFor();
  assert.match(await page.getByRole("meter").getAttribute("aria-valuetext"), /^72 /, "pending revision preserves totals");
  await page.getByRole("textbox", { name: "Resposta sobre a refeição" }).fill("2 ovos");
  await page.getByRole("button", { name: "Enviar esclarecimento" }).click();
  await page.waitForFunction(() => document.querySelector('[role="meter"]').getAttribute("aria-valuetext").startsWith("144 "));
  assert.equal(dayRequests, 1, "editing does not refetch the day");
  await page.getByRole("button", { name: "500 ml", exact: true }).click();
  await page.getByRole("button", { name: "Anular água" }).waitFor({ state: "visible" });
  await page.waitForFunction(() => document.querySelector('#water-ml').value === '1000');
  delayNextDay = true;
  await page.getByRole("button", { name: "Dia anterior" }).click();
  await page.getByRole("button", { name: "Dia anterior" }).click();
  await page.getByRole("heading", { name: "Ovo", exact: true }).waitFor();
  await page.waitForTimeout(800);
  assert.equal(await page.getByRole("heading", { name: "Stale meal", exact: true }).count(), 0, "old response cannot replace current day");
  await page.getByRole("button", { name: "Remover refeição" }).click();
  await page.getByRole("heading", { name: "O teu diário começa aqui." }).waitFor();
  assert.match(await page.getByRole("meter").getAttribute("aria-valuetext"), /^0 /);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "mobile has no horizontal overflow");
  await page.clock.install({ time: new Date("2026-10-07T03:59:30Z") });
  await page.reload();
  await page.getByRole("heading", { name: "Ovo", exact: true }).waitFor();
  const beforeRollover = dayRequests;
  await page.clock.runFor(60000);
  await page.waitForResponse(response => response.url().endsWith("/api/days/2026-10-07"));
  assert.equal(dayRequests, beforeRollover + 1, "an open app advances at the 05:00 nutrition-day boundary");
  assert.deepEqual(errors, []);
  console.log("Browser checks passed: day load, revision, clarification, totals, water, stale requests, deletion, mobile layout, 05:00 rollover.");
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}
