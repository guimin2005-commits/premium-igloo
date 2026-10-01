// ── XP 지급 · 레벨업 감지 · 보상 역할 지급 · 로그 기록 ──────
import { UserXp, XpLog } from "./db.js";
import { getLevelByXp, getCumulativeXpByLevel, kstToday } from "./leveling.js";
import { getRoleConfigs } from "./roleConfigs.js";
import { heldEffects, effectXp, effectTimeOk, claimDaily, kstNow, perksOf } from "./itemEffects.js";
import { getSettings, isLevelOpen } from "./botSettings.js";
import { buildMessageWithCard, cardAvatar, commonVars, tierOf, progressBar } from "./botMessages.js";
import { config } from "./config.js";

export const EMBED_COLOR = 0xe91e3f;
export const EMBED_FOOTER = "고급 이글루 · SYSTEM : LEVEL";

// 지정 채널에 알림 전송 — 메시지는 buildMessageWithCard 결과 그대로 (채널 미설정 · 미존재 · 꺼진 메시지(null)면 조용히 넘어간다)
function sendNotice(guild, channelId, payload) {
  if (!channelId || !payload) return;
  const channel = guild.channels.cache.get(channelId);
  if (!channel?.isTextBased()) return;

  channel.send(payload).catch((e) => console.error(`알림 전송 실패 (${channelId}):`, e.message));
}

// 배타 역할(티어) 중 지금 레벨에서 유지해야 할 최상위 하나를 고른다.
//    없으면 null — 아직 어떤 티어에도 도달하지 못한 경우다.
function topExclusive(level) {
  let best = null;
  for (const cfg of getRoleConfigs()) {
    if (!cfg.exclusive || cfg.rewardLevel == null) continue;
    if (level >= cfg.rewardLevel && (best === null || cfg.rewardLevel > best.rewardLevel)) best = cfg;
  }
  return best;
}

// 도달한 레벨 이하의 보상 역할 중 미보유분 지급 + 알림
//    배타 역할은 최상위 하나만 지급한다 (하위 티어는 아래 revoke가 거둬간다)
//    📌 notify=false 면 알림 없이 역할만 맞춘다 — 티어 설정 저장 뒤 전원 재동기화(needsRoleSync)가 채널을 도배하지 않게
async function grantRewardRoles(member, level, { notify = true } = {}) {
  const s = getSettings();
  const top = topExclusive(level);

  for (const cfg of getRoleConfigs()) {
    // 배타 역할인데 최상위가 아니면 지급하지 않는다
    if (cfg.exclusive && (!top || cfg.roleId !== top.roleId)) continue;
    if (cfg.rewardLevel != null && level >= cfg.rewardLevel && !member.roles.cache.has(cfg.roleId)) {
      try {
        await member.roles.add(cfg.roleId, `레벨 ${cfg.rewardLevel} 도달 보상`);
        console.log(`🎖 ${member.displayName} → ${cfg.roleName || cfg.roleId} 지급 (Lv.${level})`);

        if (notify && s.roleGrantEnabled) announceRoleGrant(member, cfg);
      } catch (e) {
        console.error(`역할 지급 실패 (${cfg.roleName || cfg.roleId}):`, e.message);
      }
    }
  }
}

// 역할 지급 알림 — 문구 · 디자인은 관리자 봇 메시지 설정(roleGrant). 카드가 켜져 있으면 이미지 카드(레벨업 카드와 한 벌)를 붙인다
//   📌 다음 역할 지급을 기다리게 하지 않는다 — 아바타 받기 · 카드 그리기는 따로 돈다. 못 그리면(실패 · 3초 초과) 글 임베드만
function announceRoleGrant(member, cfg) {
  sendRoleGrant(member, cfg).catch((e) => console.error(`역할 지급 알림 오류 (${member.displayName}):`, e?.message || e));
}

// 📌 역할 색 "#rrggbb" — discord.js 의 hexColor 는 role.colors 가 없으면 던진다. 그때 카드를 통째로 잃지 않게 빈 값(흰색)
function roleHex(role) {
  try {
    return role?.hexColor || "";
  } catch {
    return "";
  }
}

async function sendRoleGrant(member, cfg) {
  const s = getSettings();
  // 역할 지급 전용 채널이 없으면 레벨업 채널을 함께 사용 — 보낼 채널이 없으면 카드도 그리지 않는다
  const channelId = s.roleGrantChannelId || s.levelupChannelId || config.levelupChannelId;
  if (!channelId || !member.guild.channels.cache.get(channelId)?.isTextBased()) return;
  const role = member.guild.roles.cache.get(cfg.roleId);
  const roleName = cfg.roleName || role?.name || "역할";
  // 📌 {level} 은 이 역할의 지급 레벨 — 기본 문구가 "Lv.{level} 달성 보상" 이고
  //    레벨이 한 번에 크게 올라도 역할과 맞는 숫자 · 등급 색이 나오게 (지금 레벨을 넣으면 브론즈에 "Lv.450 달성 보상" 이 된다)
  const vars = { ...commonVars(member), role: roleName, level: cfg.rewardLevel };
  const payload = await buildMessageWithCard("roleGrant", vars, async (m) => ({
    avatar: await cardAvatar(member),
    name: vars.name,
    role: roleName,
    roleColor: roleHex(role), // "#000000" 은 색 없음 — 카드가 흰색으로 그린다
    level: cfg.rewardLevel,
    // 배타 역할(티어)이 등급 시작 레벨에 걸려 있으면 그 등급(색 · 엠블럼). 아니면 카드가 역할 이름으로 등급인지 본다
    tier: cfg.exclusive && m.CARD_TIERS.some((t) => t.min === cfg.rewardLevel) ? m.cardTierIndex(cfg.rewardLevel) : undefined,
  }));
  sendNotice(member.guild, channelId, payload);
}

// 들고 있으면 안 되는 보상 역할을 회수한다
//    ① 레벨이 내려가 지급 기준에 못 미치는 역할 (ARCTIC 구매·관리자 초기화 등)
//    ② 배타 역할(티어) 중 최상위가 아닌 하위 티어 — 승급하면 아래 티어는 떨어져 나간다
export async function revokeRewardRoles(member, level) {
  const top = topExclusive(level);

  for (const cfg of getRoleConfigs()) {
    if (cfg.rewardLevel == null || !member.roles.cache.has(cfg.roleId)) continue;
    const belowThreshold = level < cfg.rewardLevel;
    const staleTier = cfg.exclusive && (!top || cfg.roleId !== top.roleId);
    if (belowThreshold || staleTier) {
      try {
        await member.roles.remove(cfg.roleId, staleTier ? `상위 티어 승급 (Lv.${level})` : `레벨 ${cfg.rewardLevel} 미만으로 하락`);
        console.log(`🧹 ${member.displayName} → ${cfg.roleName || cfg.roleId} 회수 (Lv.${level})`);
      } catch (e) {
        console.error(`역할 회수 실패 (${cfg.roleName || cfg.roleId}):`, e.message);
      }
    }
  }
}

// 보상 역할을 현재 레벨에 맞춘다 — 모자란 건 주고, 넘치는 건 거둔다
//    opts.notify=false: 역할 지급 알림 없이 (전원 재동기화용)
export async function syncRewardRoles(member, level, opts = {}) {
  await grantRewardRoles(member, level, opts);
  await revokeRewardRoles(member, level);
}

// 레벨업 알림 — 채널은 대시보드 설정, 문구 · 디자인은 관리자 봇 메시지 설정(levelUp). 카드가 켜져 있으면 이미지 카드를 붙인다
//   📌 지급(grantXp)은 기다리지 않는다 — 아바타 받기 · 카드 그리기로 지급이 늦어지지 않게
function announceLevelUp(member, prevLevel, newLevel, totalXp) {
  sendLevelUp(member, prevLevel, newLevel, totalXp).catch((e) =>
    console.error(`레벨업 알림 오류 (${member.displayName}):`, e?.message || e)
  );
}

async function sendLevelUp(member, prevLevel, newLevel, totalXp) {
  const s = getSettings();
  const channelId = s.levelupChannelId || config.levelupChannelId;
  // 보낼 채널이 없으면 카드도 그리지 않는다
  if (!channelId || !member.guild.channels.cache.get(channelId)?.isTextBased()) return;
  const cur = getCumulativeXpByLevel(newLevel);
  const next = getCumulativeXpByLevel(newLevel + 1);
  const span = next - cur;
  const need = Math.max(0, next - totalXp);
  const progress = span > 0 ? (totalXp - cur) / span : 1;
  const vars = {
    ...commonVars(member),
    level: newLevel,
    prevLevel,
    xp: totalXp,
    nextXp: need,
    tier: tierOf(newLevel).name,
    progressBar: progressBar(progress),
  };
  const payload = await buildMessageWithCard("levelUp", vars, async () => ({
    avatar: await cardAvatar(member),
    name: vars.name,
    level: newLevel,
    prevLevel,
    xp: totalXp,
    need,
    progress,
  }));

  sendNotice(member.guild, channelId, payload);
}

// XP 지급 + 레벨 재계산. 레벨업 시 알림·보상 역할까지 처리
// meta: { reason, channelId, channelName } — 로그 기록용
//   📌 봇이 스스로 만드는 XP(채팅 · 음성 · 출석 · 아이템 효과 · 레벨업 효과)는 전부 이 함수로 들어온다 — 레벨 비공개면 여기서 막는다.
//      (지급 대기열 Payout 은 grantQueue.js 가 따로 넣으므로 막히지 않는다)
export async function grantXp(member, amount, meta = {}) {
  if (!amount) return null;

  if (!isLevelOpen()) {
    // 음성 참여 시간은 비공개여도 그대로 쌓는다 — 문서가 없으면 만들어 둔다(오늘 누적 분 · 자동 출석 판정이 이 문서를 쓴다)
    if (meta.voiceSeconds != null) {
      await UserXp.updateOne(
        { userId: member.id },
        {
          $inc: { voiceSeconds: Math.max(0, Number(meta.voiceSeconds) || 0) },
          $set: { username: member.user.username, displayName: member.displayName, updatedAt: new Date() },
        },
        { upsert: true }
      ).catch((e) => console.error(`음성 시간 기록 오류 (${member.displayName}):`, e.message));
    }
    return null;
  }

  // 📌 시즌 패스 가속(아이템 효과 passBoost, 상한 50%) — 이 지급 XP 의 합% 만큼 기준선(passBaseXp)을 같은 쓰기에서 낮춘다.
  //    진행도(xp - passBaseXp)만 더 오르고 레벨 · XP 는 그대로다. 회수(음수)에는 붙이지 않는다
  const passBoost = amount > 0 ? Math.floor((amount * perksOf(member).passBoost) / 100) : 0;
  // 음성 지급이면 그 주기만큼 누적 참여 시간도 같은 쓰기에서 올린다 (추가 왕복 없음)
  const inc = { xp: amount };
  if (meta.voiceSeconds) inc.voiceSeconds = meta.voiceSeconds;
  if (passBoost > 0) inc.passBaseXp = -passBoost;
  const doc = await UserXp.findOneAndUpdate(
    { userId: member.id },
    {
      $inc: inc,
      $set: { username: member.user.username, displayName: member.displayName, updatedAt: new Date() },
    },
    { upsert: true, new: true }
  );

  // 지급 로그 (실패해도 지급 자체는 유지)
  XpLog.create({
    userId: member.id,
    displayName: member.displayName,
    amount,
    reason: meta.reason || "",
    channelId: meta.channelId || "",
    channelName: meta.channelName || "",
    ...(passBoost > 0 ? { passBoost } : {}),
  }).catch(() => {});

  const newLevel = getLevelByXp(doc.xp);
  if (newLevel !== doc.level) {
    doc.level = newLevel;
    // 바꾸기 직전 레벨을 돌려받는다 — 두 지급이 동시에 같은 레벨업을 봐도 알림 · 역할 · 레벨업 효과는 실제로 오른 쪽 하나만 처리하게.
    // 📌 xp 가 방금 $inc 결과 그대로일 때만 쓴다 — 그 사이 다른 지급(채팅 · 음성 · 큐)이 xp 를 바꿨으면
    //    뒤에 온 쪽이 더 큰 xp 로 레벨을 맞추므로 여기서 작은 레벨로 덮어쓰지 않는다(레벨 역행 방지).
    const prev = await UserXp.findOneAndUpdate(
      { userId: member.id, xp: doc.xp },
      { $set: { level: newLevel } },
      { new: false, projection: { level: 1 } }
    ).lean();
    if (!prev) return doc;
    const before = Math.floor(Number(prev.level) || 0);

    if (newLevel > before) {
      // 지급하면서 하위 티어(배타 역할)도 함께 거둔다
      syncRewardRoles(member, newLevel).catch(() => {});
      // 레벨 0(아직 계산 전인 새 문서) → 1 은 시작 레벨이라 알리지 않는다 (역할 지급은 그대로)
      if (newLevel > Math.max(1, before)) announceLevelUp(member, Math.max(1, before), newLevel, doc.xp);
      // 📌 최고 도달 레벨(maxLevel)은 어떤 지급으로 올랐든 $max 로 원자적으로 기록한다 — 효과 지급으로 오른 레벨 포함.
      //    📌 아이템 효과 "레벨이 오를 때마다" — 효과 지급으로 오른 레벨에는 다시 붙이지 않는다(재귀 방지).
      //       레벨 0(아직 계산 전인 새 문서) → 1 은 레벨업으로 치지 않는다.
      //       그 전 최고치를 넘은 만큼만 준다 — 상점 · 강화에 XP 를 써서 레벨이 내려갔다가 다시 오를 때 같은 레벨업 효과를 또 받지 않게.
      //       (옛 문서는 maxLevel 이 없어 직전 레벨로 본다)
      const pm = await UserXp.findOneAndUpdate(
        { userId: member.id },
        { $max: { maxLevel: newLevel } },
        { new: false, projection: { maxLevel: 1 } }
      ).lean();
      if (meta.reason !== "effect-levelup") {
        const floor = Math.max(1, before, Math.floor(Number(pm?.maxLevel) || 0));
        await grantLevelUpEffects(member, newLevel - floor);
      }
    } else if (newLevel < before) {
      // 회수(음수 지급)로 레벨이 내려가면 그만큼 보상 역할도 거둔다
      revokeRewardRoles(member, newLevel).catch(() => {});
    }
  }
  return doc;
}

// 레벨업 효과 — (효과 합 × 오른 레벨 수) 를 따로 지급. 오류는 로그만 남긴다(원래 지급은 이미 끝났다)
async function grantLevelUpEffects(member, gained) {
  if (!(gained > 0)) return;
  try {
    const per = effectXp(member, "levelUp");
    if (per > 0) await grantXp(member, per * gained, { reason: "effect-levelup" });
  } catch (e) {
    console.error(`아이템 효과 지급 오류 (levelUp / ${member.displayName}):`, e.message);
  }
}

// 📌 "하루 1번" 아이템 효과 지급 — 하루 첫 채팅(firstChat) · 하루 음성 N분(voiceDaily)
//    요일 · 시간대 조건과 test(e) 를 통과한 효과마다 claimDaily 자물쇠("<itemId>:<effectId>")를 세우고, 통과한 것만 따로 지급한다.
//    meta: XpLog 에 남길 채널 정보. 오류는 효과별로 삼킨다 — 기존 지급을 막지 않게.
export async function grantOnceEffects(member, on, { test = () => true, meta = {} } = {}) {
  // 📌 레벨 비공개면 "하루 1번" 자물쇠도 세우지 않는다 — 세우고 grantXp 에서 막히면 공개된 그날 효과를 못 받는다
  if (!isLevelOpen()) return;
  let effects = [];
  try {
    effects = heldEffects(member, on);
  } catch (e) {
    console.error(`아이템 효과 조회 오류 (${on}):`, e.message);
    return;
  }
  if (!effects.length) return;

  const kst = kstNow();
  const today = kstToday();
  for (const e of effects) {
    try {
      if (!effectTimeOk(e, kst) || !test(e)) continue;
      if (!(await claimDaily(member.id, `${e.itemId}:${e.id}`, today))) continue;
      await grantXp(member, e.amount, { ...meta, reason: "effect" });
      console.log(`✨ 아이템 효과(${on}): ${member.displayName} +${e.amount.toLocaleString()}`);
    } catch (err) {
      console.error(`아이템 효과 지급 오류 (${on} / ${member.displayName}):`, err.message);
    }
  }
}
