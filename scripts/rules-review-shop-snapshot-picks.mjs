// 규칙 검토 #159 · #160 — 배지 · 카드 스킨 자동 착용을 없애기 전에, 지금 보이는 것을 직접 고른 값으로 적어 두기
//
// 📌 2026-10-04 "직접 안 고른 유저는 자동으로도 달리지 않게"(#159) · "굳이임 이것도"(#160) — 사이트 · 봇이 자동 착용을 없앴다.
//    코드만 배포하면 안 고른 유저(badgePick · cardSkinPick 없음) 전원이 그 순간 배지 없음 · 기본 카드로 바뀐다(DB 변경도 알림도 없이).
//    이 스크립트는 그 유저들이 옛 규칙으로 지금 보고 있는 것을 직접 고른 값으로 한 번 적어, 배포해도 보이는 것이 그대로이게 한다.
//    옛 규칙(63943ec 직전 lib/itemEffects.js — pickBadges · pickCardSkin, 봇 bot/src/itemEffects.js · views/inventory.js 도 같았다):
//      배지 : badgePick 이 배열이 아니면 상점에서 산 배지(allBadges 의 bought) 중 관리자 순서상 앞의 3개
//      스킨 : cardSkinPick 이 "" 이면 가진 스킨(cardSkins) 중 관리자 순서상 첫 스킨 ("none" 은 끔 — 그대로 둔다)
//    보유 판정 · 순서는 사이트와 같은 lib/ownedItems.js · lib/itemEffects.js perksOfItems 를 그대로 쓴다(구매 조건은 lib/itemPerks.js OWN_PURCHASE_QUERY 와 같다).
//      (B) 구매 기록 없이 역할로만 가진 아이템(스킨)은 디스코드 역할이 있어야 보여 lib/guildRoster.js 로 멤버 명단을 한 번 받는다(봇 토큰, 읽기만).
//    건드리지 않는 것: 이미 고른 유저 · 옛 규칙으로도 보이던 게 없는 유저 · UserXp 문서가 없는 유저(문서를 새로 만들지 않는다 — 수만 보인다)
//      · 고른 스킨을 더 이상 갖고 있지 않은 유저(옛 규칙은 첫 스킨, 새 규칙은 기본 카드 — 고른 값을 덮지 않고 수만 보인다)
//    쓰기는 문서마다 '읽은 그대로(안 고름)'일 때만 — 그 사이 유저가 직접 고른 값은 덮지 않는다.
//
// 사용 (저장소 루트에서, 배포 직전 또는 직후 — 그 사이 새로 산 배지 · 스킨도 옛 규칙대로 잡히게 가까울수록 좋다):
//   node scripts/rules-review-shop-snapshot-picks.mjs            미리보기 — 읽기만 한다(기본)
//   node scripts/rules-review-shop-snapshot-picks.mjs --apply    실제로 쓴다
//   --no-roles   디스코드 명단 없이 구매 기록 기준 보유(A)만 본다 — 역할로만 가진 스킨은 빠진다
//   --sample=N   미리보기에 보일 줄 수(기본 15)
// MONGODB_URI · DISCORD_GUILD_ID · DISCORD_BOT_TOKEN — 환경변수, 없으면 .env.local 에서 읽는다
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import mongoose from "mongoose";
import { ownedItems } from "../lib/ownedItems.js";
import { perksOfItems, normalizeEffects, MAX_BADGES, SKIN_NONE } from "../lib/itemEffects.js";
import { getGuildRoster } from "../lib/guildRoster.js";

// ── 옛 규칙 — DB 없이 돌려 볼 수 있게 순수 함수로 ──
//    반환: { badges: [아이템 id](관리자 순서 · 최대 3), badgeNames, skin: 스킨 키 | "", skins: 가진 스킨 전부 }
export function oldAutoOf({ purchases, items, shopItems, heldRoles, now = Date.now() }) {
  const { allBadges, cardSkins } = perksOfItems(ownedItems({ purchases, items, shopItems, heldRoles, now }));
  const auto = allBadges.filter((b) => b.bought).slice(0, MAX_BADGES);
  return { badges: auto.map((b) => b.itemId), badgeNames: auto.map((b) => b.name), skin: cardSkins[0] || "", skins: cardSkins };
}

// 이 유저 문서에 적을 것 — { badgePick?: string[], cardSkinPick?: string, staleSkin: boolean }
//    staleSkin: 고른 스킨이 더 이상 없어 옛 규칙은 첫 스킨, 새 규칙은 기본 카드(덮지 않는다 — 수만 센다)
export function planFor(doc, auto) {
  const out = { staleSkin: false };
  if (!Array.isArray(doc?.badgePick) && auto.badges.length) out.badgePick = auto.badges;
  const pick = doc?.cardSkinPick || "";
  if (!pick && auto.skin) out.cardSkinPick = auto.skin;
  else if (pick && pick !== SKIN_NONE && !auto.skins.includes(pick) && auto.skin) out.staleSkin = true;
  return out;
}

// lib/itemPerks.js OWN_PURCHASE_QUERY · OWN_PURCHASE_FIELDS · PERK_ITEM_FIELDS 와 같은 조건 · 칸
const OWN_QUERY = { status: { $in: ["pending", "completed"] }, itemType: { $ne: "physical" }, consumedAt: null };
const OWN_FIELDS = { userId: 1, status: 1, itemRef: 1, itemId: 1, roleId: 1, itemType: 1, expiresAt: 1, consumedAt: 1 };
const ITEM_FIELDS = {
  name: 1, type: 1, roleId: 1, visible: 1, icon: 1, imageUrl: 1, color: 1,
  chatBuffXp: 1, voiceBuffXp: 1, attendBuffXp: 1, effects: 1, sortOrder: 1, createdAt: 1,
};
const CHUNK = 500;

function envOf(name) {
  if (process.env[name]) return process.env[name];
  const file = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(file)) return "";
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = new RegExp(`^\\s*${name}\\s*=\\s*(.*)\\s*$`).exec(line);
    if (m) return m[1].replace(/^["']|["']$/g, "");
  }
  return "";
}

const fmt = (n) => Number(n || 0).toLocaleString("ko-KR");

async function main() {
  const args = process.argv.slice(2);
  const APPLY = args.includes("--apply");
  const NO_ROLES = args.includes("--no-roles");
  const SAMPLE = Math.max(0, Number((args.find((a) => a.startsWith("--sample=")) || "").split("=")[1]) || 15);

  const uri = envOf("MONGODB_URI");
  if (!uri) throw new Error("MONGODB_URI 가 없습니다 (환경변수 또는 .env.local)");
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  const UserXp = db.collection("userxps");
  const Purchase = db.collection("purchases");
  const Item = db.collection("items");
  const ShopItem = db.collection("shopitems");
  console.log(`배지 · 카드 스킨 지금 상태 적기 · ${APPLY ? "쓰기" : "미리보기(쓰지 않음)"}${NO_ROLES ? " · 디스코드 역할 없이" : ""}`);

  const items = await Item.find({}, { projection: ITEM_FIELDS }).sort({ sortOrder: 1, createdAt: 1 }).toArray();
  const cosmetic = items.some((it) => it.type !== "physical" && normalizeEffects(it.effects).some((e) => e.on === "profileBadge" || e.on === "cardSkin"));
  if (!cosmetic) {
    console.log("배지 · 카드 스킨 효과가 있는 아이템이 없습니다. 할 일이 없습니다.");
    return;
  }
  const shopItems = await ShopItem.find({}, { projection: { itemId: 1 } }).toArray();

  // 디스코드 역할 — 옛 화면(내 정보 · 봇 카드)은 역할로만 가진 아이템(B)까지 봤다. 명단에 없으면 서버에 없는 사람(역할 없음)
  let rolesOf = () => null;
  if (!NO_ROLES) {
    process.env.DISCORD_GUILD_ID ||= envOf("DISCORD_GUILD_ID");
    process.env.DISCORD_BOT_TOKEN ||= envOf("DISCORD_BOT_TOKEN");
    let roster;
    try {
      roster = await getGuildRoster({ fresh: true });
    } catch (e) {
      throw new Error(`디스코드 멤버 명단을 받지 못했습니다(${e?.message || e}). 역할 없이 보려면 --no-roles`);
    }
    const byId = new Map(roster.members.map((m) => [m.id, m.roles]));
    rolesOf = (userId) => byId.get(String(userId)) || [];
    console.log(`디스코드 멤버 ${fmt(roster.members.length)}명`);
  }

  const now = Date.now();
  const docs = await UserXp.find({}, { projection: { _id: 1, userId: 1, badgePick: 1, cardSkinPick: 1, displayName: 1, username: 1 } }).toArray();
  const plans = [];
  let staleSkin = 0;
  for (let i = 0; i < docs.length; i += CHUNK) {
    const chunk = docs.slice(i, i + CHUNK).filter((d) => d.userId);
    // 쪽마다 구매 기록을 한 번에 읽는다(이미 고른 문서도 — 고른 스킨이 더 이상 없는 유저 수를 센다)
    const ids = chunk.map((d) => String(d.userId));
    const rows = await Purchase.find({ ...OWN_QUERY, userId: { $in: ids } }, { projection: OWN_FIELDS }).toArray();
    const byUser = new Map();
    for (const p of rows) {
      const list = byUser.get(p.userId);
      if (list) list.push(p);
      else byUser.set(p.userId, [p]);
    }
    for (const d of chunk) {
      const auto = oldAutoOf({ purchases: byUser.get(String(d.userId)) || [], items, shopItems, heldRoles: rolesOf(d.userId), now });
      const plan = planFor(d, auto);
      if (plan.staleSkin) staleSkin++;
      if (plan.badgePick || plan.cardSkinPick) plans.push({ d, auto, plan });
    }
  }

  // UserXp 문서가 없는데 옛 규칙으로 무언가 보이던 사람 — 문서를 만들지 않으므로 그 사람은 배포 뒤 바뀐다(수만)
  const known = new Set(docs.map((d) => String(d.userId)));
  const orphanIds = new Set((await Purchase.distinct("userId", OWN_QUERY)).map(String).filter((id) => id && !known.has(id)));
  let orphans = 0;
  if (orphanIds.size) {
    const list = [...orphanIds];
    for (let i = 0; i < list.length; i += CHUNK) {
      const rows = await Purchase.find({ ...OWN_QUERY, userId: { $in: list.slice(i, i + CHUNK) } }, { projection: OWN_FIELDS }).toArray();
      const byUser = new Map();
      for (const p of rows) byUser.set(p.userId, [...(byUser.get(p.userId) || []), p]);
      for (const [userId, mine] of byUser) {
        const auto = oldAutoOf({ purchases: mine, items, shopItems, heldRoles: rolesOf(userId), now });
        if (auto.badges.length || auto.skin) orphans++;
      }
    }
  }

  const badgeN = plans.filter((x) => x.plan.badgePick).length;
  const skinN = plans.filter((x) => x.plan.cardSkinPick).length;
  console.log(`UserXp ${fmt(docs.length)}명 · 적을 대상 ${fmt(plans.length)}명 (배지 ${fmt(badgeN)} · 스킨 ${fmt(skinN)})`);
  console.log(`건드리지 않음 — 고른 스킨이 더는 없어 옛 규칙은 첫 스킨이던 유저 ${fmt(staleSkin)}명 · UserXp 문서 없이 배지 · 스킨이 보이던 유저 ${fmt(orphans)}명`);
  for (const x of plans.slice(0, SAMPLE)) {
    const name = x.d.displayName || x.d.username || "";
    const parts = [];
    if (x.plan.badgePick) parts.push(`배지 ${x.auto.badgeNames.join(" / ")}`);
    if (x.plan.cardSkinPick) parts.push(`스킨 ${x.plan.cardSkinPick}`);
    console.log(`  ${x.d.userId} ${name} · ${parts.join(" · ")}`);
  }

  if (!APPLY) {
    console.log("미리보기만 했습니다. 쓰려면 --apply 를 붙여 다시 실행하세요.");
    return;
  }

  // 문서마다 읽은 그대로(안 고름)일 때만 — 배지 · 스킨을 따로 걸어 한쪽을 그 사이 골랐어도 다른 쪽은 적힌다
  let wrote = 0;
  for (let i = 0; i < plans.length; i += CHUNK) {
    const ops = [];
    for (const x of plans.slice(i, i + CHUNK)) {
      if (x.plan.badgePick) {
        ops.push({ updateOne: { filter: { _id: x.d._id, badgePick: { $not: { $type: "array" } } }, update: { $set: { badgePick: x.plan.badgePick } } } });
      }
      if (x.plan.cardSkinPick) {
        ops.push({ updateOne: { filter: { _id: x.d._id, cardSkinPick: { $in: ["", null] } }, update: { $set: { cardSkinPick: x.plan.cardSkinPick } } } });
      }
    }
    if (!ops.length) continue;
    const r = await UserXp.bulkWrite(ops, { ordered: false });
    wrote += r?.modifiedCount || 0;
  }
  console.log(`적었습니다: ${fmt(wrote)}/${fmt(badgeN + skinN)}건 (그 사이 유저가 직접 고른 문서는 건너뜀)`);
}

// 직접 실행할 때만 — 순수 함수(oldAutoOf · planFor)는 DB 없이 import 해 시험할 수 있다
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main()
    .catch((e) => {
      console.error("실패:", e?.message || e);
      process.exitCode = 1;
    })
    .finally(() => mongoose.disconnect().catch(() => {}));
}
