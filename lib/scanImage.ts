const MAX_WIDTH = 2400;

/** Turns a screenshot / photo of a table into a clean "scanned" page for printing:
 *  grey, light background with dark text (a dark-mode screenshot is inverted),
 *  stretched contrast and sharpened, at a sensible size. */
export async function toScanImage(input: Buffer): Promise<Buffer> {
  // Loaded here, not at the top: the native module must not break every page that imports the steel actions.
  const { default: sharp } = await import("sharp");
  const grey = sharp(input, { failOn: "none" }).rotate().resize({ width: MAX_WIDTH, withoutEnlargement: true }).grayscale();
  const { channels } = await grey.clone().stats();
  const darkBackground = channels[0].mean < 128;
  const upright = darkBackground ? grey.negate({ alpha: false }) : grey;
  return upright.normalise().linear(1.15, -12).sharpen().toColourspace("b-w").png({ compressionLevel: 9 }).toBuffer();
}
