import { mkdir, writeFile, appendFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";

export function projectKey(url) {
  const ref = new URL(url).hostname.split(".")[0];
  const keys = JSON.parse(execFileSync("supabase", ["projects", "api-keys", "--project-ref", ref, "--output", "json"], { stdio: ["ignore", "pipe", "pipe"] }));
  const key = keys.find(item => item.name === "service_role" || item.type === "secret")?.api_key;
  if (!key) throw new Error("No server-side API key available for the selected project");
  return key;
}

export async function run({ url, key, apply = false, backupDir }) {
  const project = new URL(url);
  if (project.protocol !== "https:" || !/^[a-z0-9-]+\.supabase\.co$/.test(project.hostname)) {
    throw new Error("Use the affected project's HTTPS Supabase URL");
  }
  async function request(path, init = {}) {
    const response = await fetch(new URL(path, project), {
      ...init,
      headers: { apikey: key, Authorization: `Bearer ${key}`, ...init.headers },
      signal: AbortSignal.timeout(30000)
    });
    if (!response.ok) throw new Error(`Supabase ${response.status}: ${init.method || "GET"} ${path.split("?")[0]}`);
    return response;
  }
  const referenced = new Set();
  for (let offset = 0; ; offset += 1000) {
    const rows = await (await request(`/rest/v1/meals?select=photo_path&photo_path=not.is.null&order=id.asc&offset=${offset}&limit=1000`)).json();
    for (const row of rows) if (row.photo_path) referenced.add(row.photo_path);
    if (rows.length < 1000) break;
  }
  const candidates = [], directories = [""];
  const cutoff = Date.now() - 86400000;
  while (directories.length) {
    const prefix = directories.pop();
    for (let offset = 0; ; offset += 1000) {
      const objects = await (await request("/storage/v1/object/list/meal-photos", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prefix, limit: 1000, offset, sortBy: { column: "name", order: "asc" } })
      })).json();
      for (const object of objects) {
        const path = prefix ? `${prefix}/${object.name}` : object.name;
        if (!object.id) directories.push(path);
        else if (Date.parse(object.created_at) < cutoff && !referenced.has(path)) {
          candidates.push({ path, bytes: Number(object.metadata?.size || 0) });
        }
      }
      if (objects.length < 1000) break;
    }
  }
  const bytes = candidates.reduce((sum, item) => sum + item.bytes, 0);
  console.log(`${candidates.length} unused photos older than 24 hours; ${(bytes / 1000000).toFixed(2)} MB. ${referenced.size} referenced paths preserved.`);
  if (!apply) {
    console.log("Dry run: no image downloads, writes or deletions. Use --apply to back up and remove these unused photos.");
    return { candidates, bytes };
  }
  const root = resolve(backupDir || `.photo-backups/${new Date().toISOString().replaceAll(":", "-")}`);
  await mkdir(root, { recursive: true, mode: 0o700 });
  console.log(`Originals will be backed up to ${root}`);
  let removed = 0, failures = 0;
  for (const { path } of candidates) {
    try {
      if (!/^[a-zA-Z0-9_./-]+$/.test(path) || path.split("/").some(part => !part || part === "." || part === "..")) {
        throw new Error("Invalid storage path");
      }
      const response = await request(`/storage/v1/object/meal-photos/${path.split("/").map(encodeURIComponent).join("/")}`);
      const original = Buffer.from(await response.arrayBuffer());
      const backup = resolve(root, path);
      await mkdir(dirname(backup), { recursive: true, mode: 0o700 });
      await writeFile(backup, original, { flag: "wx", mode: 0o600 });
      await appendFile(resolve(root, "manifest.jsonl"), JSON.stringify({ path, contentType: response.headers.get("content-type"), bytes: original.length }) + "\n", { mode: 0o600 });
      const current = await (await request(`/rest/v1/meals?photo_path=eq.${encodeURIComponent(path)}&select=id&limit=1`)).json();
      if (current.length) continue;
      await request("/storage/v1/object/meal-photos", {
        method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prefixes: [path] })
      });
      removed++;
    } catch (error) {
      failures++;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`${path}: ${message}`);
      if (/^Supabase (401|402|403|429):/.test(message)) throw error;
    }
  }
  console.log(`Removed ${removed} unused photos; ${failures} failures. Backups: ${root}`);
  if (failures) throw new Error("Some photos could not be removed; inspect errors and backups before retrying");
  return { candidates, bytes, removed, backupDir: root };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const url = process.env.SUPABASE_URL || "https://dpcakoopjncincfucflv.supabase.co";
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || projectKey(url);
    await run({ url, key, apply: process.argv.includes("--apply"), backupDir: process.env.PHOTO_BACKUP_DIR });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1;
  }
}
