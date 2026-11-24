import { expect, it } from "vitest";
import { handleError, inputText, json, mealId, normalizeDate, requireAdmin, requireUser } from "./env";

it("rejects invalid dates, IDs, non-text values and unbounded prompts", () => {
  expect(normalizeDate("2024-02-29")).toBe("2024-02-29");
  for (const value of ["", "2026-02-29", "2026-04-31", "2026-13-01"]) expect(() => normalizeDate(value)).toThrow();
  for (const value of [42, {}, "x".repeat(4001)]) expect(() => inputText(value)).toThrow();
  expect(inputText("  pão  ")).toBe("pão");
  expect(() => mealId("other?id=1")).toThrow();
  expect(mealId("11111111-1111-1111-1111-111111111111")).toContain("1111");
  expect(json({}).headers.get("Cache-Control")).toBe("no-store");
});

it("marks authentication and authorization errors as private JSON responses", async () => {
  const env = { SUPABASE_URL: "", SUPABASE_ANON_KEY: "", SUPABASE_SERVICE_ROLE_KEY: "" };
  const unauthorized = await requireUser(new Request("https://example.test/api/profile"), env).catch(handleError);
  expect(unauthorized).toBeInstanceOf(Response);
  expect((unauthorized as Response).status).toBe(401);
  expect((unauthorized as Response).headers.get("Cache-Control")).toBe("no-store");
  try { requireAdmin({ id: "user" }, env); throw new Error("Expected denied access"); }
  catch (error) {
    const forbidden = await handleError(error);
    expect(forbidden.status).toBe(403);
    expect(forbidden.headers.get("Content-Type")).toBe("application/json");
    expect(forbidden.headers.get("Cache-Control")).toBe("no-store");
  }
});
