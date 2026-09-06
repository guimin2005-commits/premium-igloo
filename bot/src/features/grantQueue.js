// ── 자동 지급 큐 (30초 주기) ──────────────────
//  · ARCTIC 역할 상품 구매 → 역할 자동 지급
//  · XP 지급 대기열(코드·초대 보상 등) → XP 자동 지급
//  · 코드 역할 지급 요청 → 역할 자동 지급
//  · 사이트에서 XP가 바뀐 유저 → 레벨 보상 역할 재동기화(지급·회수)
//  · 시즌 전환으로 사이트 보유(siteOnly)가 된 구매 → 디스코드 역할 표기만 떼기
import { Purchase, Payout, CodeGrant, UserXp, BotSetting } from "../db.js";
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
  // 아이템 유형도 결국 디스코드 역할을 주는 상품이다 — 여기서 빠지면 사도 영영 지급되지 않는다
  const rows = await Purchase.find({ status: "pending", itemType: { $in: ["role", "perk", "item"] } }).limit(25);

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
        // 📌 시즌 패스 보상 XP 는 진행도(xp - passBaseXp)를 채우면 안 된다 —
        //    보상이 다음 티어 게이지를 스스로 밀어 올려 관리자가 정한 need 간격이 무의미해진다.
        //    사이트가 미리 올려 두면 봇이 지급하기 전까지 진행도만 깎여 이미 도달한 티어가 잠기므로,
        //    실제로 xp 가 들어오는 이 순간에 기준선을 같은 폭으로 함께 올린다.
        p.source === "pass"
          ? { $inc: { xp: p.amount, passBaseXp: p.amount }, $set: { updatedAt: new Date() } }
          : { $inc: { xp: p.amount }, $set: { updatedAt: new Date() } },
        { upsert: true, new: true }
      );
      const newLevel = getLevelByXp(doc.xp);
      await UserXp.updateOne({ userId }, { $set: { level: newLevel } });

      // 지급·회수로 레벨이 달라졌을 수 있으니 보상 역할을 현재 레벨에 맞춘다
      const member = await fetchMember(guild, userId);
      if (member) {
        await syncRewardRoles(member, newLevel).catch(() => {});
        // 큐로만 XP 가 들어온 계정은 이름이 비어 있어 랭킹에 "이름 없음" 으로 뜬다.
        // grantXp 와 달리 여기서는 이름을 채우지 않았기 때문 — 멤버를 이미 받아왔으니 같이 채운다.
        if (!doc.displayName || !doc.username) {
          await UserXp.updateOne(
            { userId },
            { $set: { displayName: member.displayName, username: member.user.username } }
          ).catch(() => {});
        }
      }

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
    itemType: { $in: ["role", "perk", "item"] }, // 기간제 아이템도 기간이 지나면 회수한다
    expiresAt: { $ne: null, $lte: new Date() },
  }).limit(50);

  for (const p of rows) {
    try {
      const member = await fetchMember(guild, p.userId);
      if (member && p.roleId) {
        // 같은 역할을 주는, 아직 살아 있는 다른 구매가 있으면 회수하지 않는다
        // 📌 시즌 전환으로 표기를 뗀 구매(siteOnly)는 "역할을 정당화하는 살아 있는 구매"가 아니다.
        //    빼먹으면 근거가 하나도 없는데 역할만 영구히 남는다. detach 라우트·processDetachments 와
        //    반드시 같은 표현($ne: true — 필드가 없는 옛 문서까지 잡는다)을 써야 한다.
        const alive = await Purchase.findOne({
          userId: p.userId,
          roleId: p.roleId,
          status: "completed",
          siteOnly: { $ne: true },
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

// ── 시즌 전환 표기 이전 ────────────────────────
//    사이트가 siteOnly를 세운 구매 건의 디스코드 역할만 뗀다.
//    회수가 아니다 — 소유도 인벤토리도 그대로라 DM은 보내지 않는다.
//    (잃은 게 없는데 알림이 가면 뺏긴 줄 안다. 기록은 로그로만 남긴다)
// ── 환불 역할 회수 ────────────────────────────
//    관리자가 완료된 구매를 환불하면 XP·POINT 는 사이트가 바로 돌려주지만
//    디스코드 역할은 봇만 뗄 수 있다. 만료와 같은 alive 검사를 거쳐 회수한다.
async function processRefunds(guild) {
  const rows = await Purchase.find({ status: "refunded", roleDetached: { $ne: true } })
    .sort({ revokedAt: 1 })
    .limit(50);

  for (const p of rows) {
    try {
      const hasRole = p.roleId && ["role", "perk", "item"].includes(p.itemType);
      if (hasRole) {
        const member = await fetchMember(guild, p.userId);
        if (member) {
          // 같은 역할을 정당하게 주는 다른 구매가 살아 있으면 남긴다 (만료 처리와 같은 기준)
          const alive = await Purchase.findOne({
            userId: p.userId,
            roleId: p.roleId,
            status: "completed",
            siteOnly: { $ne: true },
            _id: { $ne: p._id },
            $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
          }).lean();
          if (!alive) {
            await member.roles.remove(p.roleId, `ARCTIC 환불: ${p.itemName}`);
            member.send(`↩️ **${p.itemName}** 구매가 환불되어 역할이 회수되었습니다. 결제한 XP·POINT 는 돌려드렸습니다.`).catch(() => {});
          }
        }
      }
      p.roleDetached = true;
      p.error = "";
      await p.save();
      console.log(`↩️ 환불 역할 회수: ${p.userName} → ${p.itemName}`);
    } catch (e) {
      p.error = e.message;
      await p.save();
      console.error(`↩️ 환불 역할 회수 실패 (${p.userName} / ${p.itemName}):`, e.message);
    }
  }
}

async function processDetachments(guild) {
  // 정렬 키 조합으로 head-of-line blocking 을 막는다.
  //  · error 오름차순 — 빈 문자열("")·필드 없음이 먼저라 아직 시도 안 한 건이 앞에 온다.
  //    한 번 실패해 error 가 찬 건은 뒤로 밀려, 실패 50건이 큐 앞을 영원히 막지 않는다.
  //  · siteOnlyAt 오름차순 — 그 안에서는 먼저 전환된 순서로 처리되어 매 틱 순서가 흔들리지 않는다.
  //    (정렬이 없으면 limit(50)이 매번 같은 실패 문서만 다시 집어 올 수 있다)
  const rows = await Purchase.find({ status: "completed", siteOnly: true, roleDetached: false })
    .sort({ error: 1, siteOnlyAt: 1 })
    .limit(50);
  if (rows.length === 0) return;

  // 펭귄 등급처럼 잠가 둔 역할 — 건마다 읽으면 낭비라 틱마다 한 번만 읽는다
  const setting = await BotSetting.findOne({ key: "main" }, { protectedRoleIds: 1 }).lean();
  const protectedIds = new Set(setting?.protectedRoleIds || []);

  for (const p of rows) {
    try {
      // 보호 역할은 어떤 경우에도 떼지 않는다. 표시만 내려 큐에서 빼낸다
      if (!p.roleId || protectedIds.has(p.roleId)) {
        p.roleDetached = true;
        await p.save();
        if (p.roleId) console.log(`🧊 보호 역할이라 그대로 둠: ${p.userName} / ${p.itemName}`);
        continue;
      }

      // 서버에 없으면 뗄 역할도 없다 — 다시 들어와도 역할은 붙지 않으므로 표시만 내린다.
      //
      // 다만 공용 fetchMember 는 .catch(() => null) 이라 진짜 탈퇴와 일시 장애(게이트웨이 재연결·
      // 네트워크 단절·API 5xx)를 구분하지 못한다. 수백 건을 훑는 도중 잠깐 끊기면 멀쩡히 서버에 있는
      // 유저까지 roleDetached 로 확정돼 역할이 그대로 남고 재시도도 안 된다.
      // 그래서 이 지점에서만 직접 잡아, 확실한 탈퇴(10007 Unknown Member)일 때만 확정한다.
      let member = guild.members.cache.get(p.userId);
      if (!member) {
        try {
          member = await guild.members.fetch(p.userId);
        } catch (e) {
          if (e?.code !== 10007) throw e; // 일시 장애는 바깥 catch 로 넘겨 다음 틱에 다시 시도
          member = null;
        }
      }
      if (!member) {
        p.roleDetached = true;
        await p.save();
        continue;
      }

      // 같은 역할을 아직 정당하게 갖고 있어야 하는 구매(전환 대상이 아닌 살아 있는 건)가 있으면 남긴다.
      // siteOnly 는 새로 생긴 필드라 옛 구매 문서에는 키가 없다. { siteOnly: false } 로 쓰면 그 옛 구매를
      // "살아 있지 않다"고 보고 역할을 떼는데, 정작 사이트는 siteOnly 표시가 없어 "디스코드 역할 보유"로
      // 계속 표시한다 — my-items 의 이상상태 감지에 걸려 유저에게 오류처럼 보인다.
      // 그래서 detach 라우트와 정확히 같은 $ne: true 를 쓴다 (없음 + false 를 함께 잡는다).
      const alive = await Purchase.findOne({
        userId: p.userId,
        roleId: p.roleId,
        status: "completed",
        siteOnly: { $ne: true },
        _id: { $ne: p._id },
        $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
      }).lean();

      if (alive) {
        console.log(`🧊 다른 구매가 살아 있어 역할 유지: ${p.userName} / ${p.itemName}`);
      } else {
        await member.roles.remove(p.roleId, "시즌 전환 — 사이트 인벤토리로 이전");
        console.log(`🧊 디스코드 표기 이전 완료: ${p.userName} → ${p.itemName} (소유·인벤토리는 유지)`);
      }

      p.roleDetached = true;
      p.error = "";
      await p.save();
    } catch (e) {
      // 다시 시도해도 결과가 같은 오류는 큐에서 확정해 빼낸다.
      //  · 50013 Missing Permissions — 봇 역할보다 위에 있는 역할은 영원히 remove 가 안 된다
      //  · 10011 Unknown Role — 역할이 이미 삭제됐다. 뗄 대상 자체가 없다
      // 남겨 두면 30초마다 같은 건을 다시 집어 뒤의 멀쩡한 건들이 큐에 도달하지 못한다.
      // 사유는 error 에 남겨 관리자가 나중에 확인할 수 있게 한다
      // (Purchase 스키마에 재시도 횟수 필드가 없어 기존 error 필드로 갈음한다).
      const permanent = e?.code === 50013 || e?.code === 10011;
      p.error = permanent ? `영구 실패(${e.code}): ${e.message}` : e.message;
      if (permanent) p.roleDetached = true;
      await p.save();
      console.error(
        `🧊 디스코드 표기 이전 ${permanent ? "영구" : "일시"} 실패 (${p.userName} / ${p.itemName}):`,
        e.message
      );
    }
  }
}

// 📌 대량 시즌 전환 때는 한 틱이 30초를 넘길 수 있다(멤버 fetch + 역할 편집 레이트리밋).
//    setInterval 은 이전 틱을 기다리지 않으므로 잠그지 않으면 틱이 겹쳐 돌며
//    같은 문서를 중복 처리하고 뒤에 있는 XP 지급 큐를 계속 밀어낸다.
let ticking = false;

async function tick(client) {
  if (ticking) return;
  ticking = true;
  try {
    const guild = client.guilds.cache.get(config.guildId);
    if (!guild) return;
    await processPurchases(guild);
    await processExpiries(guild);
    await processRefunds(guild);
    await processDetachments(guild);
    await processPayouts(guild);
    await processCodeGrants(guild);
    await processRoleSyncs(guild);
  } catch (e) {
    console.error("자동 지급 큐 오류:", e.message);
  } finally {
    ticking = false;
  }
}

export function startGrantQueue(client) {
  tick(client);
  setInterval(() => tick(client), TICK_MS);
  console.log("✅ 자동 지급 큐 시작 (30초 주기 — 상점·XP·코드)");
}
