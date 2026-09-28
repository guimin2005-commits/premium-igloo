// ── 기간제 만료 임박 DM (10분 주기) ──────────────
//  · completed 기간제(역할 · 퍽 · 아이템) 중 N시간 안에 끝나는 건에 한 번만 DM (reminderSentAt 조건부 선점)
//  · 같은 역할 · 아이템이 더 늦게까지 이어지면(연장분 · 다른 구매) 보내지 않는다
//  · 소모된 건(consumedAt)은 대상도, 이어지는 구매도 아니다
//  · 설정: BotSetting.expiryReminderEnabled(기본 켜짐) · expiryReminderHours(기본 24)
import { Purchase, BotSetting, ShopItem } from "../db.js";
import { config } from "../config.js";
import { buildMessage, commonVars, formatUntil, SITE_URL } from "../botMessages.js";
import { findContinuation } from "./grantQueue.js";

const TICK_MS = 10 * 60 * 1000;
const BATCH = 50; // 한 틱에 보내는 DM 수
// 📌 읽는 건 넉넉히 — 연장분이 있어 건너뛰는 건은 reminderSentAt 을 세우지 않아 매 틱 다시 잡힌다.
//    읽기도 50건이면 건너뛸 건 50개가 앞자리를 차지해 뒤의 건이 알림을 못 받는다
const SCAN = 500;
const OBJECT_ID_RE = /^[0-9a-f]{24}$/i;

// 📌 옛 BotSetting 문서에는 새 필드가 없다(lean 이라 스키마 기본값도 안 붙는다) — undefined 는 켜짐 · 24시간
async function readSetting() {
  const s = await BotSetting.findOne({ key: "main" }, { expiryReminderEnabled: 1, expiryReminderHours: 1 }).lean();
  const h = Number(s?.expiryReminderHours);
  return {
    enabled: s?.expiryReminderEnabled !== false,
    hours: Number.isFinite(h) && h > 0 ? Math.min(168, Math.max(1, h)) : 24,
  };
}

// 연장하기 주소 — 상점 상품 상세. 산 상품이 판매 중이면 그것, 아니면 같은 아이템(itemRef)을 파는 판매 중 상품, 없으면 인벤토리
//   📌 판매 중(active)만 — 내린 상품의 상세는 유저에게 "상품을 찾을 수 없습니다" 로 뜬다 (api/shop/items/[id] 와 같은 기준).
//      운영진 지급 · 패스 보상은 상품 id 가 없어 itemRef 로만 찾는다
async function renewUrlOf(p) {
  const own = OBJECT_ID_RE.test(String(p.itemId || "")) ? String(p.itemId) : "";
  const ref = OBJECT_ID_RE.test(String(p.itemRef || "")) ? String(p.itemRef) : "";
  const or = [];
  if (own) or.push({ _id: own });
  if (ref) or.push({ itemId: ref });
  if (or.length) {
    const rows = await ShopItem.find({ $or: or, active: true }, { _id: 1 }).lean().catch(() => []);
    const pick = rows.find((r) => String(r._id) === own) || rows[0];
    if (pick) return `${SITE_URL}/arctic/item/${pick._id}`;
  }
  return `${SITE_URL}/arctic/inventory`;
}

async function fetchMember(guild, userId) {
  return guild.members.cache.get(userId) || (await guild.members.fetch(userId).catch(() => null));
}

async function tick(client) {
  const guild = client.guilds.cache.get(config.guildId);
  if (!guild) return;
  const { enabled, hours } = await readSetting();
  if (!enabled) return;

  const now = new Date();
  const windowMs = hours * 3600e3;
  const rows = await Purchase.find({
    status: "completed",
    itemType: { $in: ["role", "perk", "item"] },
    expiresAt: { $gt: now, $lte: new Date(now.getTime() + windowMs) },
    reminderSentAt: null, // 필드가 없는 옛 문서도 잡힌다
    consumedAt: null, // 📌 이미 소모한 건(쓴 보호막 등)은 끝날 것도 연장할 것도 없다
    // 📌 쓰기 시작한 때가 이미 알림 구간 안인 짧은 건(24시간 알림에 1일권 등)은 빼낸다 — 지급 DM 직후 "곧 끝납니다" 가 가지 않게
    $expr: {
      $lt: [
        { $ifNull: ["$startsAt", { $ifNull: ["$processedAt", "$createdAt"] }] },
        { $subtract: ["$expiresAt", windowMs] },
      ],
    },
  })
    .sort({ expiresAt: 1 })
    .limit(SCAN)
    .lean();

  let sent = 0;
  for (const p of rows) {
    if (sent >= BATCH) break; // 나머지는 다음 틱에
    try {
      // 같은 역할 · 아이템이 이 구매보다 늦게까지 이어지면(연장분 등) 끝나는 게 아니다
      if (await findContinuation(p, p.expiresAt)) continue;

      // 📌 조건부 선점 — 봇이 둘 떠 있거나 틱이 겹쳐도 한 번만.
      //    연장은 새 구매 문서(renewOf)라 이 건의 만료는 그대로다 — 연장분은 자기 reminderSentAt 으로 따로 알린다
      const claim = await Purchase.updateOne(
        { _id: p._id, status: "completed", reminderSentAt: null, consumedAt: null }, // 읽은 뒤 소모됐으면 보내지 않는다
        { $set: { reminderSentAt: new Date() } }
      );
      if (!claim.modifiedCount) continue;
      sent += 1;

      // 서버를 나간 유저는 보낼 곳이 없다 — 선점만 남겨 다시 집지 않는다
      const member = await fetchMember(guild, p.userId);
      if (!member) continue;

      const hoursLeft = Math.max(1, Math.round((new Date(p.expiresAt).getTime() - Date.now()) / 3600e3));
      const msg = buildMessage("expiryReminder", {
        ...commonVars(member, guild),
        item: p.itemName,
        until: formatUntil(p.expiresAt),
        hoursLeft,
        renewUrl: await renewUrlOf(p),
      });
      if (!msg) continue;
      await member.send(msg).catch(() => {}); // DM 이 막혀 있으면 조용히 넘어간다
      console.log(`⏰ 만료 임박 DM: ${p.userName} / ${p.itemName} (약 ${hoursLeft}시간)`);
    } catch (e) {
      console.error(`⏰ 만료 임박 DM 실패 (${p.userName} / ${p.itemName}):`, e.message);
    }
  }
}

let ticking = false;
let started = false;

async function run(client) {
  if (ticking) return;
  ticking = true;
  try {
    await tick(client);
  } catch (e) {
    console.error("만료 임박 DM 오류:", e.message);
  } finally {
    ticking = false;
  }
}

export function startExpiryReminder(client) {
  if (started) return;
  started = true;
  run(client);
  setInterval(() => run(client), TICK_MS);
  console.log("✅ 만료 임박 DM 시작 (10분 주기)");
}
