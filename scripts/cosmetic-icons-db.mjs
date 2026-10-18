// 📌 꾸미기(카드 스킨 · 아바타 테두리) 아이템 · 상품의 아이콘을 전용 아이콘으로 바꾸는 일회용 스크립트 — 2026-10-11
//    공유 DB 라 실행하는 순간 실사이트 · 봇에도 뜬다. 새 아이콘 그림(lib/itemArt.js · bot/src/itemArt.js)이 실사이트 · 봇에 올라간 뒤에만 실행한다
//    (그 전에 실행하면 실사이트 · 봇이 모르는 아이콘이라 기본 상자 모양으로 보인다).
//    node scripts/cosmetic-icons-db.mjs            — 바꿀 대상만 보여 준다(쓰지 않음)
//    node scripts/cosmetic-icons-db.mjs --apply    — 바꾼다. 바꾸기 전 값을 scripts/cosmetic-icons-db.backup.json 에 남긴다
//    node scripts/cosmetic-icons-db.mjs --revert   — 그 백업으로 되돌린다(그 사이 운영자가 다시 바꾼 아이콘은 건드리지 않는다)
//    대상: 꾸미기 효과가 정확히 하나인 아이템 중 아이콘이 비었거나 옛 공용 아이콘(반짝 카드 · 승급 배지 · 프로필 배지)인 것 + 그 아이템을 연결한 상품.
//    운영자가 따로 고른 아이콘은 그대로 둔다
import { createRequire } from "module";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(ROOT, "package.json"));
const mongoose = require("mongoose");
const BACKUP = path.join(ROOT, "scripts", "cosmetic-icons-db.backup.json");
const mode = process.argv.includes("--apply") ? "apply" : process.argv.includes("--revert") ? "revert" : "dry";

const SKIN = {
  gold: "skin-gold", aurora: "skin-aurora", ice: "skin-ice", crimson: "skin-crimson", newworld: "skin-newworld", chart: "skin-chart", airship: "skin-airship",
  hw_pumpkin: "skin-pumpkin-patch", hw_ghost: "skin-ghost-party", hw_witch: "skin-witch-night", hw_candy: "skin-candy-shop", hw_grave: "skin-moon-grave", hw_blackcat: "skin-black-cat",
  ev_ghost: "skin-ghost-invite",
};
const TIERS = ["bronze", "silver", "gold", "platinum", "diamond", "master", "grandmaster", "challenger", "igloo"];
const DECO = {
  hwf_pumpkin: "deco-pumpkin-mouth", hwf_crystal: "deco-crystal-ball", hwf_ghost: "deco-ghost-sheet", hwf_candy: "deco-wrapped-candy",
  hwf_mummy: "deco-mummy", hwf_window: "deco-haunted-window", hwf_blackcat: "deco-black-cat", hwf_patch: "deco-pumpkin-patch", hwf_party: "deco-ghost-party", hwf_witch: "deco-witch-night", hwf_shop: "deco-candy-shop", hwf_grave: "deco-moon-grave", nwf_world: "deco-new-world", nwf_chart: "deco-sea-chart", nwf_airship: "deco-airship",
  evf_ghost: "deco-ghost-tail",
};
// 카드 배경(2026-10-15 — lib/cosmeticArt.js SCENE_ART 와 같은 값)
const SCENE = { sc_ghost: "scene-ghost-night" };
const artOfSkin = (s) => SKIN[s] || (typeof s === "string" && s.startsWith("rank_") && TIERS.includes(s.slice(5)) ? "tier-skin-" + s.slice(5) : "");
const artOfFrame = (f) => (TIERS.includes(f) ? "tier-frame-" + f : f === "all" ? "avatar-frame" : DECO[f] || "");
const artOfScene = (s) => SCENE[s] || "";
const GENERIC = new Set(["", "art:card-skin", "art:promo-badge", "art:profile-badge"]);

function uriOf() {
  if (process.env.MONGODB_URI) return process.env.MONGODB_URI;
  const env = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8");
  const m = env.match(/^MONGODB_URI=(.*)$/m);
  if (!m) throw new Error("MONGODB_URI 없음");
  return m[1].trim().replace(/^["']|["']$/g, "");
}

async function planOf(db) {
  const items = await db.collection("items").find({}, { projection: { name: 1, icon: 1, effects: 1 } }).toArray();
  const plan = [];
  for (const it of items) {
    const list = Array.isArray(it.effects) ? it.effects : Array.isArray(it.effects?.list) ? it.effects.list : [];
    const cos = list.filter((e) => e && (e.on === "cardSkin" || e.on === "cardScene" || e.on === "avatarFrame"));
    if (cos.length !== 1) continue;
    const art = cos[0].on === "cardSkin" ? artOfSkin(cos[0].skin) : cos[0].on === "cardScene" ? artOfScene(cos[0].scene) : artOfFrame(cos[0].frame);
    const from = String(it.icon || "");
    if (!art || !GENERIC.has(from) || from === "art:" + art) continue;
    plan.push({ col: "items", id: it._id, name: it.name, from, to: "art:" + art });
  }
  const to = new Map(plan.map((p) => [String(p.id), p.to]));
  const shop = await db.collection("shopitems").find({ itemId: { $in: [...to.keys()] } }, { projection: { name: 1, icon: 1, itemId: 1 } }).toArray();
  for (const s of shop) {
    const from = String(s.icon || ""), t = to.get(String(s.itemId));
    if (!t || from === t || !GENERIC.has(from)) continue;
    plan.push({ col: "shopitems", id: s._id, name: s.name, from, to: t });
  }
  return plan;
}

await mongoose.connect(uriOf());
const db = mongoose.connection.db;
try {
  if (mode === "revert") {
    const back = JSON.parse(fs.readFileSync(BACKUP, "utf8"));
    let n = 0;
    for (const b of back) {
      const r = await db.collection(b.col).updateOne({ _id: new mongoose.Types.ObjectId(b.id), icon: b.to }, { $set: { icon: b.from } });
      n += r.modifiedCount;
    }
    console.log(`되돌림 ${n} / ${back.length}`);
  } else {
    const plan = await planOf(db);
    for (const p of plan) console.log(`${p.col === "items" ? "아이템" : "상품"} | ${p.name} | ${p.from || "(없음)"} → ${p.to}`);
    console.log(`대상: 아이템 ${plan.filter((p) => p.col === "items").length} · 상품 ${plan.filter((p) => p.col === "shopitems").length}`);
    if (mode === "apply" && plan.length) {
      fs.writeFileSync(BACKUP, JSON.stringify(plan.map((p) => ({ ...p, id: String(p.id) })), null, 2));
      let n = 0;
      for (const p of plan) n += (await db.collection(p.col).updateOne({ _id: p.id, icon: p.from }, { $set: { icon: p.to } })).modifiedCount;
      console.log(`바꿈 ${n} / ${plan.length} — 백업 ${path.relative(ROOT, BACKUP)}`);
    }
  }
} finally {
  await mongoose.disconnect();
}
