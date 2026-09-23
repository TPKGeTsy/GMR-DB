// One-off script: creates two LINE Rich Menus and wires them up:
//   - "GMR main menu" (3 buttons: ออกหน้างาน / การลา / จองรถ) — set as the
//     global default, so every user gets it automatically.
//   - "GMR manager menu" (same 3 + เปิด OT) — explicitly linked to each
//     individual user (by their lineUserId) whose role is ADMIN, OPERATOR,
//     or SENIOR (the same OT_MANAGER_ROLES gate the "เปิด OT" trigger
//     itself already enforces — this is just about who *sees* the button,
//     not an additional permission check).
// Run manually whenever the menu needs to be (re)created — re-running
// deletes all existing rich menus first, so it's safe to re-run after
// changing the images or the button set.
//
// Usage: node scripts/setup-line-rich-menu.js

const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");

const envText = fs.readFileSync(path.join(__dirname, "..", ".env"), "utf8");
function readEnv(key) {
  const match = envText.match(new RegExp(`^${key}=(.+)$`, "m"));
  if (!match) throw new Error(`${key} not found in .env`);
  return match[1].trim().replace(/^'|'$/g, "");
}
// The production database is documented, but commented out, as a
// `# DATABASE_URL='...'` line in .env (never the active/uncommented one —
// that's the local dev branch). Read it from there instead of hardcoding
// the credential in this file, which — unlike .env — isn't gitignored.
function readProductionDatabaseUrl() {
  const match = envText.match(/^# DATABASE_URL='(.+)'$/m);
  if (!match) throw new Error("Commented-out production DATABASE_URL not found in .env");
  return match[1];
}
const PRODUCTION_DATABASE_URL = readProductionDatabaseUrl();

const ACCESS_TOKEN = readEnv("LINE_CHANNEL_ACCESS_TOKEN");
const SITE_URL = "https://gmr-db.vercel.app";
const WIDTH = 2500;
const HEIGHT = 843;

function areasFor(buttonCount, extraAction) {
  const colWidth = WIDTH / buttonCount;
  const base = [
    { action: { type: "message", label: "ออกหน้างาน", text: "ไปทำงานนอกสถานที่" } },
    { action: { type: "uri", label: "การลา", uri: `${SITE_URL}/leave` } },
    { action: { type: "uri", label: "จองรถ", uri: `${SITE_URL}/carbook` } },
  ];
  const all = extraAction ? [...base, extraAction] : base;
  return all.map((a, i) => ({
    bounds: { x: i * colWidth, y: 0, width: colWidth, height: HEIGHT },
    action: a.action,
  }));
}

const MAIN_MENU = {
  size: { width: WIDTH, height: HEIGHT },
  selected: true,
  name: "GMR main menu",
  chatBarText: "เมนู",
  areas: areasFor(3),
};

const MANAGER_MENU = {
  size: { width: WIDTH, height: HEIGHT },
  selected: true,
  name: "GMR manager menu",
  chatBarText: "เมนู",
  areas: areasFor(4, { action: { type: "message", label: "เปิด OT", text: "เปิด OT" } }),
};

async function api(pathname, options = {}) {
  const res = await fetch(`https://api.line.me/v2/bot${pathname}`, {
    ...options,
    headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, ...(options.headers || {}) },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${options.method || "GET"} ${pathname} -> ${res.status}: ${body}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function createAndUpload(menuBody, imageFileName) {
  const created = await api("/richmenu", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(menuBody),
  });
  const richMenuId = created.richMenuId;
  console.log(`Created "${menuBody.name}":`, richMenuId);

  const imageBuffer = fs.readFileSync(path.join(__dirname, "assets", imageFileName));
  const uploadRes = await fetch(`https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`, {
    method: "POST",
    headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, "Content-Type": "image/png" },
    body: imageBuffer,
  });
  if (!uploadRes.ok) throw new Error(`Image upload failed: ${uploadRes.status} ${await uploadRes.text()}`);
  console.log(`Uploaded image for "${menuBody.name}".`);

  return richMenuId;
}

(async () => {
  console.log("Deleting existing rich menus...");
  const existing = await api("/richmenu/list");
  for (const menu of existing.richmenus) {
    await api(`/richmenu/${menu.richMenuId}`, { method: "DELETE" });
    console.log(`Deleted old "${menu.name}" (${menu.richMenuId})`);
  }

  const mainMenuId = await createAndUpload(MAIN_MENU, "line-rich-menu.png");
  const managerMenuId = await createAndUpload(MANAGER_MENU, "line-rich-menu-manager.png");

  console.log("Setting main menu as default for all users...");
  await api(`/user/all/richmenu/${mainMenuId}`, { method: "POST" });

  console.log("Finding managers (ADMIN/OPERATOR/SENIOR) with a linked LINE account...");
  const prisma = new PrismaClient({ datasources: { db: { url: PRODUCTION_DATABASE_URL } } });
  const managers = await prisma.user.findMany({
    where: { role: { in: ["ADMIN", "OPERATOR", "SENIOR"] }, lineUserId: { not: null } },
    select: { username: true, lineUserId: true },
  });
  await prisma.$disconnect();

  console.log(`Linking manager menu to ${managers.length} user(s)...`);
  for (const m of managers) {
    await api(`/user/${m.lineUserId}/richmenu/${managerMenuId}`, { method: "POST" });
    console.log(`  -> ${m.username}`);
  }

  console.log("Done. Rich menus are now live.");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
