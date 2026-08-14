// ── 자동 지급 큐 (30초 주기) ──────────────────
//  · ARCTIC 역할 상품 구매 → 역할 자동 지급
//  · XP 지급 대기열(코드·초대 보상 등) → XP 자동 지급
//  · 코드 역할 지급 요청 → 역할 자동 지급
//  · 사이트에서 XP가 바뀐 유저 → 레벨 보상 역할 재동기화(지급·회수)
import { Purchase, Payout, CodeGrant, UserXp } from "../db.js";
import { syncRewardRoles } from "../xp.js";
import { getLevelByXp } from "../leveling.js";
import { config } from "../config.js";

const TICK_MS = 30 * 1000;

// 길드 멤버 조회 (캐시에 없으면 fetch)
async function fetchMember(guild, userId) {
  return guild.members.cache.get(userId) || (await guild.members.fetch(userId).catch(() => null));
}

// ── 역할 상품 구매 처리 ──────────────────────
async function processPurchases(guild) {
  const rows = await Purchase.find({ status: "pending", itemType: { $in: ["role", "perk"] } }).limit(25);

  for (const p of rows) {
    try {
      const member = await fetchMember(guild, p.userId);
      if (!member) {
        p.error = "서버에서 유저를 찾을 수 없습니다.";
        await p.save();
        continue;
      }
      if (p.roleId) await member.roles.add(p.roleId, `ARCTIC 구매: ${p.itemName}`);

      p.status = "completed";
      p.processedAt = new Date();
      p.error = "";
      await p.save();
      console.log(`🛒 역할 지급 완료: ${p.userName} ← ${p.itemName}${p.days > 0 ? ` (${p.days}일)` : ""}`);

      // 기간제는 언제까지인지 본인에게 알려 준다 (DM이 막혀 있으면 조용히 넘어간다)
      if (p.days > 0 && p.expiresAt) {
        const until = new Date(p.expiresAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
        member.send(`🎫 **${p.itemName}** 역할이 지급되었습니다.\n이용 기간 ${p.days}일 — ${until}까지 유지되며, 기간이 끝나면 자동으로 회수됩니다.`).catch(() => {});
      }
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
      const newLevel = getLevelByXp(doc.xp);
      await UserXp.updateOne({ userId }, { $set: { level: newLevel } });

      // 지급·회수로 레벨이 달라졌을 수 있으니 보상 역할을 현재 레벨에 맞춘다
      const member = await fetchMember(guild, userId);
      if (member) await syncRewardRoles(member, newLevel).catch(() => {});

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

// ── 레벨 역할 재동기화 ────────────────────────
//    사이트에서 XP를 깎거나(ARCTIC 구매) 초기화하면 needsRoleSync가 세워진다.
//    봇만 디스코드 역할을 만질 수 있으므로 이곳에서 현재 레벨에 맞춰 지급·회수한다.
async function processRoleSyncs(guild) {
  const rows = await UserXp.find({ needsRoleSync: true }, { userId: 1, level: 1, displayName: 1 }).limit(50).lean();

  for (const r of rows) {
    try {
      const member = await fetchMember(guild, r.userId);
      if (member) await syncRewardRoles(member, r.level || 0);
      // 서버에 없는 유저는 다시 들어올 때 레벨업 흐름에서 처리되므로 표시만 내린다
      await UserXp.updateOne({ userId: r.userId }, { $set: { needsRoleSync: false } });
    } catch (e) {
      console.error(`🧩 역할 동기화 실패 (${r.displayName || r.userId}):`, e.message);
    }
  }
}

// ── 기간제 역할 회수 ──────────────────────────
//    산 기간이 지난 구매 건을 찾아 역할을 거둬들인다.
//    같은 역할을 다른 경로(다른 상품·코드 등)로 아직 갖고 있으면 남겨 둔다.
async function processExpiries(guild) {
  const rows = await Purchase.find({
    status: "completed",
    itemType: { $in: ["role", "perk"] },
    expiresAt: { $ne: null, $lte: new Date() },
  }).limit(50);

  for (const p of rows) {
    try {
      const member = await fetchMember(guild, p.userId);
      if (member && p.roleId) {
        // 같은 역할을 주는, 아직 살아 있는 다른 구매가 있으면 회수하지 않는다
        const alive = await Purchase.findOne({
          userId: p.userId,
          roleId: p.roleId,
          status: "completed",
          _id: { $ne: p._id },
          $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
        }).lean();
        if (!alive) {
          await member.roles.remove(p.roleId, `ARCTIC 기간 만료: ${p.itemName}`);
          member.send(`⌛ **${p.itemName}** 이용 기간(${p.days}일)이 끝나 역할이 회수되었습니다.\nARCTIC에서 다시 구매하면 계속 이용할 수 있습니다.`).catch(() => {});
        }
      }

      p.status = "expired";
      p.revokedAt = new Date();
      await p.save();
      console.log(`⌛ 기간제 역할 회수: ${p.userName} → ${p.itemName} (${p.days}일)`);
    } catch (e) {
      p.error = e.message;
      await p.save();
      console.error(`⌛ 기간제 역할 회수 실패 (${p.userName} / ${p.itemName}):`, e.message);
    }
  }
}

async function tick(client) {
  try {
    const guild = client.guilds.cache.get(config.guildId);
    if (!guild) return;
    await processPurchases(guild);
    await processExpiries(guild);
    await processPayouts(guild);
    await processCodeGrants(guild);
    await processRoleSyncs(guild);
  } catch (e) {
    console.error("자동 지급 큐 오류:", e.message);
  }
}

export function startGrantQueue(client) {
  tick(client);
  setInterval(() => tick(client), TICK_MS);
  console.log("✅ 자동 지급 큐 시작 (30초 주기 — 상점·XP·코드)");
}
