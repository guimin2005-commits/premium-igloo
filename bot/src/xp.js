// ── XP 지급 · 레벨업 감지 · 보상 역할 지급 · 로그 기록 ──────
import { EmbedBuilder } from "discord.js";
import { UserXp, XpLog } from "./db.js";
import { getLevelByXp, kstToday } from "./leveling.js";
import { getRoleConfigs } from "./roleConfigs.js";
import { heldEffects, effectXp, effectTimeOk, claimDaily, kstNow } from "./itemEffects.js";
import { getSettings } from "./botSettings.js";
import { config } from "./config.js";

export const EMBED_COLOR = 0xe91e3f;
export const EMBED_FOOTER = "고급 이글루 · SYSTEM : LEVEL";

// 지정 채널에 임베드 알림 전송 (채널 미설정·미존재 시 조용히 무시)
function sendNotice(guild, channelId, text) {
  if (!channelId) return;
  const channel = guild.channels.cache.get(channelId);
  if (!channel?.isTextBased()) return;

  const embed = new EmbedBuilder().setColor(EMBED_COLOR).setDescription(text).setFooter({ text: EMBED_FOOTER });
  channel.send({ embeds: [embed] }).catch(() => {});
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
async function grantRewardRoles(member, level) {
  const s = getSettings();
  const top = topExclusive(level);

  for (const cfg of getRoleConfigs()) {
    // 배타 역할인데 최상위가 아니면 지급하지 않는다
    if (cfg.exclusive && (!top || cfg.roleId !== top.roleId)) continue;
    if (cfg.rewardLevel != null && level >= cfg.rewardLevel && !member.roles.cache.has(cfg.roleId)) {
      try {
        await member.roles.add(cfg.roleId, `레벨 ${cfg.rewardLevel} 도달 보상`);
        console.log(`🎖 ${member.displayName} → ${cfg.roleName || cfg.roleId} 지급 (Lv.${level})`);

        if (s.roleGrantEnabled) {
          const roleName = cfg.roleName || member.guild.roles.cache.get(cfg.roleId)?.name || "역할";
          const text = (s.roleGrantMessage || "🎖 {user} 님에게 **{role}** 역할이 지급되었습니다! (Lv.{level})")
            .replaceAll("{user}", `<@${member.id}>`)
            .replaceAll("{role}", roleName)
            .replaceAll("{level}", String(level));
          // 역할 지급 전용 채널이 없으면 레벨업 채널을 함께 사용
          sendNotice(member.guild, s.roleGrantChannelId || s.levelupChannelId || config.levelupChannelId, text);
        }
      } catch (e) {
        console.error(`역할 지급 실패 (${cfg.roleName || cfg.roleId}):`, e.message);
      }
    }
  }
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
export async function syncRewardRoles(member, level) {
  await grantRewardRoles(member, level);
  await revokeRewardRoles(member, level);
}

// 대시보드에서 지정한 채널·문구로 레벨업 알림 ({user}, {level}, {xp} 치환)
function announceLevelUp(member, newLevel, totalXp) {
  const s = getSettings();
  const text = (s.levelupMessage || "🎉 {user} 님이 **Lv.{level}** 에 도달했습니다!")
    .replaceAll("{user}", `<@${member.id}>`)
    .replaceAll("{level}", String(newLevel))
    .replaceAll("{xp}", totalXp.toLocaleString());

  sendNotice(member.guild, s.levelupChannelId || config.levelupChannelId, text);
}

// XP 지급 + 레벨 재계산. 레벨업 시 알림·보상 역할까지 처리
// meta: { reason, channelId, channelName } — 로그 기록용
export async function grantXp(member, amount, meta = {}) {
  if (!amount) return null;

  const doc = await UserXp.findOneAndUpdate(
    { userId: member.id },
    {
      // 음성 지급이면 그 주기만큼 누적 참여 시간도 같은 쓰기에서 올린다 (추가 왕복 없음)
      $inc: meta.voiceSeconds ? { xp: amount, voiceSeconds: meta.voiceSeconds } : { xp: amount },
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
      if (newLevel > Math.max(1, before)) announceLevelUp(member, newLevel, doc.xp);
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
