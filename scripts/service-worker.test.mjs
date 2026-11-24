import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { expect, it, vi } from "vitest";

it("keeps APIs/private origins out of cache; serves assets offline and tolerates cache write failure", async () => {
  const handlers = {};
  const cache = { match: vi.fn().mockResolvedValue(undefined), put: vi.fn().mockRejectedValue(new Error("quota")) };
  const fetch = vi.fn().mockResolvedValue(new Response("network"));
  runInNewContext(readFileSync(new URL("../public/sw.js", import.meta.url), "utf8"), {
    self: { location: { origin: "https://app.test" }, addEventListener: (name, fn) => { handlers[name] = fn; } },
    caches: { open: async () => cache }, fetch, URL, Response
  });
  const event = url => ({ request: new Request(url), respondWith: vi.fn(), waitUntil: vi.fn() });
  for (const url of ["https://app.test/api/days/today", "https://storage.test/private-photo.jpg"]) {
    const e = event(url); handlers.fetch(e); expect(e.respondWith).not.toHaveBeenCalled();
  }
  const online = event("https://app.test/assets/app.js"); handlers.fetch(online);
  expect(await (await online.respondWith.mock.calls[0][0]).text()).toBe("network");
  await Promise.all(online.waitUntil.mock.calls.map(([promise]) => promise));
  cache.match.mockResolvedValue(new Response("cached")); fetch.mockClear();
  const offline = event("https://app.test/assets/app.js"); handlers.fetch(offline);
  expect(await (await offline.respondWith.mock.calls[0][0]).text()).toBe("cached");
  expect(fetch).not.toHaveBeenCalled();
});
