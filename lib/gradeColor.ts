// Grade codes are now admin-defined free text (not a fixed A/B/C enum), so
// badge colors can't be a hardcoded lookup — hash the code to a stable pick
// from a small palette instead, so a given grade always renders the same
// color without needing a color assigned when it's created.
const PALETTE = [
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-700",
  "bg-rose-100 text-rose-700",
  "bg-sky-100 text-sky-700",
  "bg-violet-100 text-violet-700",
  "bg-teal-100 text-teal-700",
  "bg-fuchsia-100 text-fuchsia-700",
];

export function gradeBadgeClass(code: string): string {
  let hash = 0;
  for (let i = 0; i < code.length; i++) {
    hash = (hash * 31 + code.charCodeAt(i)) | 0;
  }
  return PALETTE[Math.abs(hash) % PALETTE.length];
}
