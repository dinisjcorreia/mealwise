import { afterEach, expect, it, vi } from "vitest";
import { prepareMealPhoto } from "./photo";

afterEach(() => vi.unstubAllGlobals());

it("resizes camera photos, retries compression, bounds output and releases the bitmap", async () => {
  const bitmap = { width: 4000, height: 3000, close: vi.fn() };
  vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue(bitmap));
  const context = { fillRect: vi.fn(), drawImage: vi.fn(), fillStyle: "" };
  const toBlob = vi.fn().mockImplementationOnce((done) => done(new Blob([new Uint8Array(600000)])))
    .mockImplementationOnce((done) => done(new Blob(["compressed"], { type: "image/jpeg" })));
  const canvas = { width: 0, height: 0, getContext: () => context, toBlob };
  vi.stubGlobal("document", { createElement: () => canvas });
  const file = await prepareMealPhoto(new File(["original"], "camera.png", { type: "image/png" }));
  expect([canvas.width, canvas.height]).toEqual([1280, 960]);
  expect(file.type).toBe("image/jpeg");
  expect(file.size).toBeLessThanOrEqual(524288);
  expect(toBlob).toHaveBeenCalledTimes(2);
  expect(bitmap.close).toHaveBeenCalledOnce();
});

it("does not upscale small photos and rejects failed/oversized encodings", async () => {
  const bitmap = { width: 400, height: 300, close: vi.fn() };
  vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue(bitmap));
  const canvas = { width: 0, height: 0, getContext: () => ({ fillRect: vi.fn(), drawImage: vi.fn() }),
    toBlob: (done: (blob: Blob | null) => void) => done(null) };
  vi.stubGlobal("document", { createElement: () => canvas });
  await expect(prepareMealPhoto(new File(["photo"], "a.jpg"))).rejects.toThrow("mais pequena");
  expect([canvas.width, canvas.height]).toEqual([400, 300]);
  expect(bitmap.close).toHaveBeenCalledOnce();
  canvas.toBlob = done => done(new Blob([new Uint8Array(600000)]));
  await expect(prepareMealPhoto(new File(["photo"], "a.jpg"))).rejects.toThrow("mais pequena");
});
