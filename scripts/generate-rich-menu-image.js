const sharp = require("sharp");
const path = require("path");

const WIDTH = 2500;
const HEIGHT = 843;

const BASE_BUTTONS = [
  { icon: "📍", label: "ออกหน้างาน", fill: "#ea580c" },
  { icon: "🗓️", label: "การลา", fill: "#f97316" },
  { icon: "🚗", label: "จองรถ", fill: "#ea580c" },
];
const MANAGER_BUTTONS = [...BASE_BUTTONS, { icon: "⏰", label: "เปิด OT", fill: "#f97316" }];

function buildSvg(buttons) {
  const colWidth = WIDTH / buttons.length;
  const columns = buttons
    .map((b, i) => {
      const x = i * colWidth;
      const cx = x + colWidth / 2;
      return `
        <rect x="${x}" y="0" width="${colWidth}" height="${HEIGHT}" fill="${b.fill}" />
        ${i > 0 ? `<line x1="${x}" y1="0" x2="${x}" y2="${HEIGHT}" stroke="white" stroke-width="4" opacity="0.4" />` : ""}
        <text x="${cx}" y="380" font-size="180" text-anchor="middle" dominant-baseline="middle">${b.icon}</text>
        <text x="${cx}" y="560" font-size="${buttons.length > 3 ? 75 : 90}" font-family="Tahoma, 'Leelawadee UI', sans-serif" font-weight="bold" text-anchor="middle" fill="white">${b.label}</text>
      `;
    })
    .join("\n");

  return `
<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${WIDTH}" height="${HEIGHT}" fill="#1f2937" />
  ${columns}
</svg>
`;
}

async function render(buttons, outName) {
  const outPath = path.join(__dirname, "assets", outName);
  await sharp(Buffer.from(buildSvg(buttons))).png().toFile(outPath);
  console.log("Wrote", outPath);
}

(async () => {
  await render(BASE_BUTTONS, "line-rich-menu.png");
  await render(MANAGER_BUTTONS, "line-rich-menu-manager.png");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
