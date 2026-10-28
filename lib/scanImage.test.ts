import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { toScanImage } from "./scanImage";

/** A table-like picture: a background colour with a few bars of the other colour. */
async function picture(background: number, ink: number) {
  const bars = [10, 40, 70].map((top) => ({
    input: { create: { width: 160, height: 12, channels: 3 as const, background: { r: ink, g: ink, b: ink } } },
    top,
    left: 20,
  }));
  return sharp({ create: { width: 200, height: 100, channels: 3, background: { r: background, g: background, b: background } } })
    .composite(bars)
    .png()
    .toBuffer();
}

async function stats(buffer: Buffer) {
  const s = await sharp(buffer).stats();
  return { mean: s.channels[0].mean };
}

describe("toScanImage", () => {
  it("gives a dark-mode screenshot a light background", async () => {
    const out = await toScanImage(await picture(30, 230));
    const s = await stats(out);
    expect((await sharp(out).metadata()).space).toBe("b-w"); // grey
    expect(s.mean).toBeGreaterThan(128);
  });

  it("keeps a light page light", async () => {
    const out = await toScanImage(await picture(240, 20));
    expect((await stats(out)).mean).toBeGreaterThan(128);
  });

  it("does not make a small picture bigger", async () => {
    const out = await toScanImage(await picture(240, 20));
    expect((await sharp(out).metadata()).width).toBe(200);
  });
});
