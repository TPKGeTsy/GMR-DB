import { describe, expect, it } from "vitest";
import { pieceLines } from "./pdfLines";
import { parseBomLines } from "./steel";

const t = (str: string, x: number, y: number) => ({ str, x, y });

describe("pieceLines", () => {
  const table = [
    t("ITEM NO.", 580, 707),
    t("QTY.", 676, 707),
    t("DESCRIPTION", 848, 707),
    t("LENGTH", 1065, 707),
    t("3", 604, 687),
    t("1", 687, 687),
    t("RT 75 x 38 x 2.3", 811, 687),
    t("3567", 1070, 687),
  ];

  it("keeps a balloon of the 3D view at the same height out of the table row", () => {
    const withBalloon = [...table, t("8", 400, 687.5), t("4", 120, 686)];
    expect(pieceLines(withBalloon)).toEqual(["ITEM NO. QTY. DESCRIPTION LENGTH", "3 1 RT 75 x 38 x 2.3 3567"]);
    const { parts } = parseBomLines(pieceLines(withBalloon));
    expect(parts[0]).toMatchObject({ steelType: "RT", cutLength: 3567, quantity: 1 });
  });

  it("keeps everything when the page has no ITEM NO. header", () => {
    expect(pieceLines([t("a", 10, 100), t("b", 5, 100)])).toEqual(["b a"]);
  });
});
