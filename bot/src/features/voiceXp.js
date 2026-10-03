// ── 음성 XP (설정된 주기마다 지급) ──────────────────
//    📌 아이템 효과: "음성 1회당"은 이 1회 지급에 더하고(percent 는 기본 음성 XP 기준, 음소거 배율은 전체에),
//       "하루 음성 N분"은 오늘 누적 분이 N 이상이 되면 하루 1번 따로, "출석 · 출석 N번째"는 출석 지급에 더한다.
//       "음성 파티"는 그 채널 인원(봇 제외)이 효과의 기준 이상일 때 1회당, "음소거 감소 완화"는 감소율에서 %p 를 뺀다(막기 모드는 그대로).
//       효과는 디스코드 역할이 아니라 인벤토리 보유 아이템 기준이다(itemEffects.js — 아이템 기본 효과 포함).
//    📌 레벨 비공개면 XP · 출석 · 효과는 주지 않고(grantXp · claimAttendance 가 막는다) 오늘 누적 분만 쌓는다.
//    📌 음성 XP 정지(UserXp.voiceXpOff — 관리자)인 사람은 주기를 통째로 건너뛴다: 지급 · 오늘 누적 분 · 자동 출석 · 하루 음성 효과.
//    📌 누적 음성 시간(UserXp.voiceSeconds · 랭킹 "음성 시간")은 이 주기가 아니라 features/voiceTime.js 가 실제 접속 초로 센다(2026-10-03 — 예전엔 주기마다 300초).
//       같은 대상 · 음소거 판정을 쓰도록 relieveMute 를 내보낸다
//    📌 지급 줄(XpLog "voice")에 그 주기의 음성 상황 ctx(인원 · 마이크 · 헤드셋 · 화면 공유/캠 · 마지막 활동 뒤 분)를 같이 남긴다.
//    📌 자동 출석이 되면 봇 메시지 autoAttend 를 출석 알림 채널(비우면 레벨업 채널)에 보낸다.
import { PermissionFlagsBits } from "discord.js";
import { UserXp } from "../db.js";
import { getVoiceBracketBonus, kstToday } from "../leveling.js";
import { getBuffXp } from "../roleConfigs.js";
import { effectXp, voicePartyXp, perksOf } from "../itemEffects.js";
import { getChannelPolicy } from "../channelConfigs.js";
import { getSettings, getActiveBoostXp, getMuteMultiplier, isLevelOpen } from "../botSettings.js";
import { grantXp, grantOnceEffects } from "../xp.js";
import { claimAttendance, streakBonusText } from "../attend.js";
import { buildMessageWithCard, cardAvatar, commonVars } from "../botMessages.js";
import { idleMinutes } from "./activity.js";
import { config } from "../config.js";

// 📌 음성 상황(XpLog.ctx) — n: 그 채널의 봇 아닌 사람 수(본인 포함) · mute/deaf: 본인 또는 서버가 끈 것 · live: 화면 공유 또는 캠
function voiceCtx(voiceState, n, now) {
  return {
    n,
    mute: !!(voiceState.selfMute || voiceState.serverMute),
    deaf: !!(voiceState.selfDeaf || voiceState.serverDeaf),
    live: !!(voiceState.streaming || voiceState.selfVideo),
    idle: idleMinutes(voiceState.id, now),
  };
}

// 📌 자동 출석 알림 — /출석체크(cmdAttend)와 같은 변수 · 같은 카드. 꺼진 메시지 · 채널 없음 · 권한 없음이면 조용히 넘긴다(출석 지급은 이미 끝났다).
//    틱을 기다리게 하지 않는다 — 아바타 받기 · 카드 그리기는 따로 돈다. 파일 첨부 권한이 없으면 카드 없이 글만
function announceAutoAttend(member, res) {
  sendAutoAttend(member, res).catch((e) => console.error(`자동 출석 알림 오류 (${member.displayName}):`, e?.message || e));
}

async function sendAutoAttend(member, res) {
  const s = getSettings();
  const channelId = s.attendChannelId || s.levelupChannelId || config.levelupChannelId;
  const channel = channelId ? member.guild.channels.cache.get(channelId) : null;
  const me = member.guild.members.me;
  if (!channel?.isTextBased() || !me) return;
  const perms = channel.permissionsFor(me);
  if (!perms?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])) return;

  const streakBonus = streakBonusText(res.streakBonus);
  const vars = { ...commonVars(member), amount: res.amount, attendCount: res.attendCount, streak: res.streak, bestStreak: res.bestStreak, streakBonus };
  const cardData = perms.has(PermissionFlagsBits.AttachFiles)
    ? async () => ({
        avatar: await cardAvatar(member),
        name: vars.name,
        amount: res.amount,
        streak: res.streak,
        bestStreak: res.bestStreak,
        attendCount: res.attendCount,
        streakBonus,
      })
    : null;
  const payload = await buildMessageWithCard("autoAttend", vars, cardData);
  if (payload) await channel.send(payload);
}

// 📌 음소거 감소 완화(아이템 효과 muteRelief) — 감소 모드에서 음소거로 깎일 때만, 감소율에서 합 %p 를 뺀다.
//    상한(감소율 전체)은 perksOf 가 건다. 막기(block) · 끔(off) 은 그대로
export function relieveMute(multiplier, member, s) {
  if (!(multiplier < 1) || s.muteMode !== "reduce") return multiplier;
  const relief = perksOf(member).muteRelief;
  if (!(relief > 0)) return multiplier;
  const pct = Math.min(100, Math.max(0, Number(s.muteReducePct) || 0));
  return Math.max(0, 1 - Math.max(0, pct - relief) / 100);
}

async function voiceXpTick(client) {
  try {
    const guild = client.guilds.cache.get(config.guildId);
    if (!guild) return;

    const s = getSettings();
    const afkChannelId = guild.afkChannelId;
    // 이번 틱의 주기(초) — 지급 줄(XpLog.sec)에만 남긴다. 관리 › 이상 활동이 이 값으로 간격 · 시간을 센다(lib/adminActivity.js).
    //    📌 누적 음성 시간(voiceSeconds)은 여기서 더하지 않는다 — features/voiceTime.js 가 실제 초로 센다
    const logSec = s.voiceIntervalSec || 300;
    // 출석 자동 지급 판정에 쓰는 값 — 시간 집계와 달리 시즌 2 게이트를 타지 않는다
    const today = kstToday();
    const tickMin = Math.max(1, Math.round((s.voiceIntervalSec || 300) / 60));
    const attendMin = Math.max(1, s.attendVoiceMin || 60);
    // 채널별 인원(봇 제외) — 음성 파티 효과용, 틱마다 채널당 한 번만 센다
    const headcount = new Map();
    const countOf = (channel) => {
      if (!headcount.has(channel.id)) headcount.set(channel.id, channel.members?.filter((m) => !m.user.bot).size || 0);
      return headcount.get(channel.id);
    };

    // 대상 먼저 — 봇 · 잠수 채널 · 제외 채널(대시보드 채널/카테고리 정책)을 걸러 둔다
    const targets = [];
    for (const [, voiceState] of guild.voiceStates.cache) {
      const member = voiceState.member;
      const channel = voiceState.channel;
      if (!member || member.user.bot || !channel) continue;
      if (channel.id === afkChannelId) continue; // 잠수 채널 제외
      const channelPolicy = getChannelPolicy(channel);
      if (channelPolicy.excluded) continue;
      targets.push({ voiceState, member, channel, channelPolicy });
    }
    if (!targets.length) return;

    // 📌 레벨 · 강화 · 음성 XP 정지는 이번 틱에 한 번만($in) 읽는다 — 사람마다 따로 읽지 않는다
    const docs = await UserXp.find(
      { userId: { $in: targets.map((t) => t.member.id) } },
      { userId: 1, level: 1, voiceEnhance: 1, voiceXpOff: 1 }
    ).lean();
    const docOf = new Map(docs.map((d) => [d.userId, d]));
    const now = Date.now();

    for (const { voiceState, member, channel, channelPolicy } of targets) {
      // 📌 틱 도중 나갔거나 옮긴 사람은 건너뛴다 — voiceState 는 캐시 객체라 그 자리에서 바뀐다(나가면 활동 기록도 지워져 ctx.idle 이 틀어진다)
      if (voiceState.channelId !== channel.id || !voiceState.member) continue;
      const doc = docOf.get(member.id);
      // 📌 음성 XP 정지 — 이 사람만 주기를 통째로 건너뛴다(지급 · 오늘 누적 분 · 자동 출석 · 하루 음성 효과. 음성 시간도 voiceTime.js 가 뺀다)
      if (doc?.voiceXpOff === true) continue;

      // 음소거 정책 — block이면 지급 자체를 건너뜀 (감소 모드는 아이템 효과로 완화될 수 있다)
      const muteMultiplier = relieveMute(getMuteMultiplier(voiceState), member, s);
      if (muteMultiplier === 0) continue;

      // 기본 음성 XP — 내전 채널도 따로 두지 않고 같은 값(대시보드 설정)을 쓴다
      const base = s.voiceXp;

      // 강화 가산 — 단계(영구) × voiceEnhanceStep. 등급·역할·채널 가산과 같은 자리에서 더하고 음소거 배율을 곱한다
      const enhanceXp = Math.max(0, Math.floor(Number(doc?.voiceEnhance) || 0)) * Math.max(0, Number(s.voiceEnhanceStep) || 0);
      const itemXp = effectXp(member, "voice", { base, channel }) + voicePartyXp(member, { base, channel, count: countOf(channel) });
      const amount = Math.floor(
        (base + getVoiceBracketBonus(doc?.level || 0) + enhanceXp + getBuffXp(member) + channelPolicy.boostXp + getActiveBoostXp(member, channel) + itemXp) *
          muteMultiplier
      );

      await grantXp(member, amount, {
        reason: "voice",
        channelId: channel.id,
        channelName: channel.name || "",
        logSec,
        ctx: voiceCtx(voiceState, countOf(channel), now),
      });

      // ── 출석 자동 지급 ──
      //    유저가 눌러서 받는 방식이 아니라, 기준 시간을 채우면 그 자리에서 준다.
      //    오늘 누적 분은 파이프라인 갱신으로 원자적으로 쌓는다 — 날짜가 바뀌면 그 자리에서 리셋.
      const upd = await UserXp.findOneAndUpdate(
        { userId: member.id },
        [
          {
            $set: {
              voiceTodayMin: {
                $cond: [
                  { $eq: [{ $ifNull: ["$voiceTodayDate", ""] }, today] },
                  { $add: [{ $ifNull: ["$voiceTodayMin", 0] }, tickMin] },
                  tickMin,
                ],
              },
              voiceTodayDate: today,
            },
          },
        ],
        { new: true, projection: { voiceTodayMin: 1, lastAttendDate: 1 } }
      );

      //    📌 자물쇠 · 지급 · 연속 출석은 claimAttendance(attend.js) 한 곳에서 — /출석체크와 같은 규칙, 합쳐서 하루 한 번.
      //       레벨 비공개면 자물쇠를 세우지 않는다(공개된 날 다시 받을 수 있게). 한 명의 오류가 이번 틱의 다른 사람을 막지 않게 따로 잡는다.
      if (upd && upd.voiceTodayMin >= attendMin && upd.lastAttendDate !== today && isLevelOpen()) {
        try {
          const res = await claimAttendance(member, { source: "voice" });
          if (res?.ok) announceAutoAttend(member, res);
        } catch (e) {
          console.error(`출석 자동 지급 오류 (${member.displayName}):`, e.message);
        }
      }

      // 하루 음성 N분 효과 — 오늘 누적 분이 효과의 기준 이상이면 하루 1번 (오류는 안에서 삼킨다)
      if (upd) {
        await grantOnceEffects(member, "voiceDaily", { test: (e) => upd.voiceTodayMin >= e.minMinutes });
      }
    }
  } catch (e) {
    console.error("음성 XP 오류:", e.message);
  }
}

// 설정된 주기로 루프를 돌리고, 주기가 바뀌면 타이머를 다시 건다
export function startVoiceXpLoop(client) {
  let timer = null;
  let currentSec = 0;

  const ensureTimer = () => {
    const sec = getSettings().voiceIntervalSec || 300;
    if (sec === currentSec) return;
    currentSec = sec;
    if (timer) clearInterval(timer);
    timer = setInterval(() => voiceXpTick(client), sec * 1000);
    console.log(`🔊 음성 XP 주기: ${sec}초`);
  };

  ensureTimer();
  setInterval(ensureTimer, 60 * 1000); // 대시보드에서 주기를 바꾸면 1분 내 반영
}
