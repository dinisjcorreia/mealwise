import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { run } from "./cleanup-unused-photos.mjs";

const json = data => new Response(JSON.stringify(data));
const object = (name, recent = false) => ({ name, id: name, created_at: new Date(Date.now() - (recent ? 1000 : 172800000)).toISOString(), metadata: { size: 123 } });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it("dry run excludes referenced/recent files and descends into folders without downloading images", async () => {
  const fetch = vi.fn().mockResolvedValueOnce(json([{ photo_path: "user/used.jpg" }]))
    .mockResolvedValueOnce(json([{ name: "user", id: null }]))
    .mockResolvedValueOnce(json([object("unused.jpg"), object("used.jpg"), object("new.jpg", true)]));
  vi.stubGlobal("fetch", fetch); vi.spyOn(console, "log").mockImplementation(() => {});
  const result = await run({ url: "https://example.supabase.co", key: "test" });
  expect(result.candidates).toEqual([{ path: "user/unused.jpg", bytes: 123 }]);
  expect(fetch).toHaveBeenCalledTimes(3);
  expect(fetch.mock.calls.every(([, init]) => init.method !== "DELETE")).toBe(true);
});

it("apply backs up bytes before deletion and skips a newly referenced file", async () => {
  const backupDir = await mkdtemp(join(tmpdir(), "meal-photo-check-"));
  const original = Buffer.from("original photo");
  vi.spyOn(console, "log").mockImplementation(() => {});
  const fetch = vi.fn().mockResolvedValueOnce(json([]))
    .mockResolvedValueOnce(json([object("unused.jpg"), object("new-reference.jpg")]))
    .mockResolvedValueOnce(new Response(original, { headers: { "Content-Type": "image/jpeg" } }))
    .mockResolvedValueOnce(json([]))
    .mockImplementationOnce(async (_url, init) => {
      expect(await readFile(join(backupDir, "unused.jpg"))).toEqual(original);
      expect(JSON.parse(init.body)).toEqual({ prefixes: ["unused.jpg"] });
      return json([]);
    })
    .mockResolvedValueOnce(new Response(original))
    .mockResolvedValueOnce(json([{ id: "new-meal" }]));
  vi.stubGlobal("fetch", fetch);
  try {
    const result = await run({ url: "https://example.supabase.co", key: "test", apply: true, backupDir });
    expect(result.removed).toBe(1);
    expect(fetch.mock.calls.filter(([, init]) => init.method === "DELETE")).toHaveLength(1);
  } finally { await rm(backupDir, { recursive: true, force: true }); }
});

it("stops at quota restrictions without continuing through candidates", async () => {
  const backupDir = await mkdtemp(join(tmpdir(), "meal-photo-check-"));
  vi.spyOn(console, "log").mockImplementation(() => {}); vi.spyOn(console, "error").mockImplementation(() => {});
  const fetch = vi.fn().mockResolvedValueOnce(json([])).mockResolvedValueOnce(json([object("a.jpg"), object("b.jpg")]))
    .mockResolvedValueOnce(new Response("restricted", { status: 402 }));
  vi.stubGlobal("fetch", fetch);
  try {
    await expect(run({ url: "https://example.supabase.co", key: "test", apply: true, backupDir })).rejects.toThrow("Supabase 402");
    expect(fetch).toHaveBeenCalledTimes(3);
  } finally { await rm(backupDir, { recursive: true, force: true }); }
});
