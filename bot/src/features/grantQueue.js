// ── 자동 지급 큐 (30초 주기) ──────────────────
//  · IGLOO SHOP 역할 상품 구매 → 역할 자동 지급
//  · XP 지급 대기열(코드·초대 보상 등) → XP 자동 지급
//  · 코드 역할 지급 요청 → 역할 자동 지급
import { Purchase, Payout, CodeGrant, UserXp } from "../db.js";
import { getLevelByXp } from "../leveling.js";
import { config } from "../config.js";

const TICK_MS = 30 * 1000;

// 길드 멤버 조회 (캐시에 없으면 fetch)
async function fetchMember(guild, userId) {
  return guild.members.cache.get(userId) || (await guild.members.fetch(userId).catch(() => null));
}

// ── 역할 상품 구매 처리 ──────────────────────
async function processPurchases(guild) {
  const rows = await Purchase.find({ status: "pending", itemType: "role" }).limit(25);

  for (const p of rows) {
    try {
      const member = await fetchMember(guild, p.userId);
      if (!member) {
        p.error = "서버에서 유저를 찾을 수 없습니다.";
        await p.save();
        continue;
      }
      if (p.roleId) await member.roles.add(p.roleId, `IGLOO SHOP 구매: ${p.itemName}`);

      p.status = "completed";
      p.processedAt = new Date();
      p.error = "";
      await p.save();
      console.log(`🛒 역할 지급 완료: ${p.userName} ← ${p.itemName}`);
    } catch (e) {
      p.error = e.message;
      await p.save();
      console.error(`🛒 역할 지급 실패 (${p.userName} / ${p.itemName}):`, e.message);
    }
  }
}

// ── XP 지급 대기열 처리 ──────────────────────
async function processPayouts(guild) {
  const rows = await Payout.find({ status: "pending" }).limit(50);

  for (const p of rows) {
    try {
      // userId가 없는 옛 기록은 닉네임으로 역조회
      let userId = p.userId;
      if (!userId && p.userName) {
        const found = await UserXp.findOne({ username: p.userName }, { userId: 1 }).lean();
        userId = found?.userId || "";
      }
      if (!userId) {
        p.status = "failed";
        p.error = "지급 대상 ID를 찾을 수 없습니다.";
        await p.save();
        continue;
      }

      const doc = await UserXp.findOneAndUpdate(
        { userId },
        { $inc: { xp: p.amount }, $set: { updatedAt: new Date() } },
        { upsert: true, new: true }
      );
      await UserXp.updateOne({ userId }, { $set: { level: getLevelByXp(doc.xp) } });

      p.status = "paid";
      p.paidAt = new Date();
      p.error = "";
      await p.save();
      console.log(`💰 XP 지급 완료: ${p.userName} +${p.amount.toLocaleString()} (${p.reason || p.source})`);
    } catch (e) {
      p.error = e.message;
      await p.save();
      console.error(`💰 XP 지급 실패 (${p.userName}):`, e.message);
    }
  }
}

// ── 코드 역할 지급 처리 ──────────────────────
async function processCodeGrants(guild) {
  const rows = await CodeGrant.find({ status: "pending" }).limit(25);

  for (const g of rows) {
    try {
      const member = await fetchMember(guild, g.userId);
      if (!member) {
        g.error = "서버에서 유저를 찾을 수 없습니다.";
        await g.save();
        continue;
      }
      if (g.roleId) await member.roles.add(g.roleId, `코드 사용: ${g.code}`);

      g.status = "completed";
      g.processedAt = new Date();
      g.error = "";
      await g.save();
      console.log(`🎫 코드 역할 지급 완료: ${g.userName} (${g.code})`);
    } catch (e) {
      g.error = e.message;
      await g.save();
      console.error(`🎫 코드 역할 지급 실패 (${g.userName}):`, e.message);
    }
  }
}

async function tick(client) {
  try {
    const guild = client.guilds.cache.get(config.guildId);
    if (!guild) return;
    await processPurchases(guild);
    await processPayouts(guild);
    await processCodeGrants(guild);
  } catch (e) {
    console.error("자동 지급 큐 오류:", e.message);
  }
}

export function startGrantQueue(client) {
  tick(client);
  setInterval(() => tick(client), TICK_MS);
  console.log("✅ 자동 지급 큐 시작 (30초 주기 — 상점·XP·코드)");
}
