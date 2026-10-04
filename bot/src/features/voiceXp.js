// ── 음성 XP (사람마다 5분 — 지급 계산 · 지급) ──────────────────
//    📌 2026-10-04 "개인별로 세어야지" · "5분 단위 지급은 똑같고, 다 못 채우고 나가면 그때 지급" — 예전엔 봇이 켜진 시각부터 5분마다
//       한 번, 그 순간 음성에 있는 사람 전원에게 1회분을 통째로 줬다(들어온 지 10초여도 1회분, 4분 50초 있다 나가면 0, 봇 재시작 때 진행 중인 몇 분은 사라짐).
//       이제 features/voiceTime.js 가 사람마다 실제 접속 초를 재 각자 5분(voiceIntervalSec)을 채울 때마다 1회분을 주고,
//       다 못 채우고 나가거나 다른 채널로 옮기면 그때 머문 시간만큼(1회분 × 머문 초 / 5분) 준다. 진행 중인 시간은 20초마다 DB 에 적어 재시작에도 이어 간다.
//    📌 1회분(voiceRate) = 기본 음성 XP + 등급 가산 + 강화 + 역할 · 채널 · 이벤트 부스트 + 아이템 효과("음성 1회당" · "음성 파티").
//       음소거 감소(완화 효과 반영)는 그 구간에 곱한다 — 마이크를 켰다 껐다 하거나 채널을 옮기면 구간마다 그때 상태로 따로 계산해 더한다.
//    📌 아이템 효과: "하루 음성 N분"은 오늘 누적 분이 N 이상이 되면 하루 1번 따로, "출석 · 출석 N번째"는 출석 지급에 더한다.
//       "음성 파티"는 그 채널 인원(봇 제외)이 효과의 기준 이상일 때, "음소거 감소 완화"는 감소율에서 %p 를 뺀다(막기 모드는 그대로).
//       효과는 디스코드 역할이 아니라 인벤토리 보유 아이템 기준이다(itemEffects.js — 아이템 기본 효과 포함).
//    📌 레벨 비공개면 바퀴를 받아도 아무것도 하지 않는다 — XP · 오늘 누적 분 · 자동 출석 · 하루 음성 효과 전부(payVoiceCycle 맨 위).
//       음성 시간(voiceSeconds — 랭킹)은 voiceTime.js 가 따로 쌓는다.
//    📌 음성 XP 정지(UserXp.voiceXpOff — 관리자)인 사람은 통째로 건너뛴다: 지급 · 오늘 누적 분 · 자동 출석 · 하루 음성 효과 · 음성 시간(voiceTime.js).
//       XP 획득 중단(UserXp.xpStopFrom ~ xpStopUntil — 관리자, xpStop.js) 중인 사람도 똑같이 건너뛴다.
//    📌 지급 줄(XpLog "voice")의 sec 는 그 지급의 실제 초(5분을 채웠으면 300), ctx 는 그 시간 동안 가장 오래였던 음성 상황(인원 · 마이크 · 헤드셋 · 화면 공유/캠)과 마지막 활동 뒤 분(모르면 idle 칸 없음).
//    📌 자동 출석이 되면 봇 메시지 autoAttend 를 출석 알림 채널(비우면 레벨업 채널)에 보낸다.
import { PermissionFlagsBits } from "discord.js";
import { UserXp } from "../db.js";
import { getVoiceBracketBonus, kstToday } from "../leveling.js";
import { getBuffXp } from "../roleConfigs.js";
import { effectXp, voicePartyXp, perksOf } from "../itemEffects.js";
import { getChannelPolicy } from "../channelConfigs.js";
import { getSettings, getActiveBoostXp, isLevelOpen } from "../botSettings.js";
import { grantXp, grantOnceEffects } from "../xp.js";
import { claimAttendance, streakBonusText } from "../attend.js";
import { isXpStopped } from "../xpStop.js";
import { buildMessageWithCard, cardAvatar, commonVars } from "../botMessages.js";
import { config } from "../config.js";

// 📌 자동 출석 알림 — /출석체크(cmdAttend)와 같은 변수 · 같은 카드. 꺼진 메시지 · 채널 없음 · 권한 없음이면 조용히 넘긴다(출석 지급은 이미 끝났다).
//    지급을 기다리게 하지 않는다 — 아바타 받기 · 카드 그리기는 따로 돈다. 파일 첨부 권한이 없으면 카드 없이 글만
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

// 📌 1회분(5분) XP — 음소거 배율을 곱하기 전. 채널이 없으면(지워진 채널) 채널에 붙는 가산 · 효과는 뺀다
//    doc: 그 사람의 UserXp(level · voiceEnhance), count: 그 채널의 봇 아닌 사람 수(본인 포함)
export function voiceRate(member, channel, doc, s, count) {
  const base = Math.max(0, Number(s.voiceXp) || 0);
  const enhanceXp = Math.max(0, Math.floor(Number(doc?.voiceEnhance) || 0)) * Math.max(0, Number(s.voiceEnhanceStep) || 0);
  const channelXp = channel ? getChannelPolicy(channel).boostXp || 0 : 0;
  // 📌 2026-10-04 "강화 포함이지. 강화는 '기본 XP'를 강화하는 개념" — % 효과("음성 1회당" · "음성 파티")는 강화로 늘어난 기본 XP 에 붙인다(채팅과 같은 기준)
  const pctBase = base + enhanceXp;
  const itemXp = effectXp(member, "voice", { base: pctBase, channel }) + voicePartyXp(member, { base: pctBase, channel, count });
  return base + getVoiceBracketBonus(doc?.level || 0) + enhanceXp + getBuffXp(member) + channelXp + getActiveBoostXp(member, channel) + itemXp;
}

// 📌 한 바퀴(5분을 채웠거나 · 다 못 채우고 나감 · 옮김) 지급 — XP · 오늘 누적 분 · 자동 출석 · 하루 음성 효과.
//    c: { ch, chName, pc, sec(실제 초), amount(줄 XP — 부르는 쪽이 1 XP 미만을 사람마다 이월해 정수로 맞춘다), ctx }. 1초 미만은 부르는 쪽이 버린다
export async function payVoiceCycle(member, c) {
  // 📌 2026-10-04 "다 막아" — 레벨 비공개 동안 머문 시간은 그날 출석에도 치지 않는다. 예전엔 XP · 출석만 막고 오늘 누적 분은 계속 쌓아,
  //    공개로 바꾼 다음 바퀴에 그날 이미 60분을 채운 사람이 한꺼번에 출석 처리되고 알림이 몰렸다(10/1 공개 때).
  //    이제 공개한 뒤 머문 시간만 센다 — 공개 전부터 와 있던 사람도 공개 뒤 기준 시간을 새로 채워야 출석된다
  //    ⚠ 경계: 공개 여부는 바퀴를 줄 때 본다(구간마다가 아니라). 공개하는 순간 돌던 바퀴는 공개 뒤에 닫히므로 그 바퀴의 비공개 몫
  //       (사람마다 최대 한 주기 — voiceIntervalSec, 기본 5분)은 XP · 오늘 누적 분에 들어간다. 출석이 몰리지 않는 크기라 그대로 둔다
  if (!isLevelOpen()) return;
  // 📌 XP 획득 중단(xpStop.js) — voiceTime.js 가 기록할 때 거르지만, 그 사이 시작된 중단도 여기서 한 번 더(오늘 누적 분 · 자동 출석까지 통째로)
  if (isXpStopped(member.id)) return;
  const s = getSettings();
  const today = kstToday();
  const attendMin = Math.max(1, s.attendVoiceMin || 60);

  await grantXp(member, Math.max(0, Math.floor(Number(c.amount) || 0)), {
    reason: "voice",
    channelId: c.ch,
    channelName: c.chName || "",
    pc: c.pc || "", // 카테고리 — 퀘스트 채널 조건(XpLog.pc)
    // 실제 초를 0.1초까지 — 퀘스트 · 서포터즈 음성 분이 이 합으로 센다(반올림해 정수로 남기면 짧은 줄이 쌓여 부풀어진다)
    logSec: Math.max(0.1, Math.round(c.sec * 10) / 10),
    ctx: c.ctx,
  });

  // ── 출석 자동 지급 ──
  //    유저가 눌러서 받는 방식이 아니라, 기준 시간을 채우면 그 자리에서 준다.
  //    오늘 누적 분은 실제 머문 시간(초 ÷ 60)을 파이프라인 갱신으로 원자적으로 쌓는다 — 날짜가 바뀌면 그 자리에서 리셋
  const addMin = c.sec / 60;
  const upd = await UserXp.findOneAndUpdate(
    { userId: member.id },
    [
      {
        $set: {
          voiceTodayMin: {
            $cond: [{ $eq: [{ $ifNull: ["$voiceTodayDate", ""] }, today] }, { $add: [{ $ifNull: ["$voiceTodayMin", 0] }, addMin] }, addMin],
          },
          voiceTodayDate: today,
        },
      },
    ],
    { new: true, projection: { voiceTodayMin: 1, lastAttendDate: 1 } }
  );

  //    📌 자물쇠 · 지급 · 연속 출석은 claimAttendance(attend.js) 한 곳에서 — /출석체크와 같은 규칙, 합쳐서 하루 한 번.
  //       그 사이 비공개로 바뀌었으면 자물쇠를 세우지 않는다(공개된 날 다시 받을 수 있게). 출석 오류가 하루 음성 효과를 막지 않게 따로 잡는다
  if (upd && upd.voiceTodayMin >= attendMin && upd.lastAttendDate !== today && isLevelOpen()) {
    try {
      const res = await claimAttendance(member, { source: "voice" });
      if (res?.ok) announceAutoAttend(member, res);
    } catch (e) {
      console.error(`출석 자동 지급 오류 (${member.displayName}):`, e.message);
    }
  }

  // 하루 음성 N분 효과 — 오늘 누적 분이 효과의 기준 이상이면 하루 1번 (오류는 안에서 삼킨다)
  if (upd) await grantOnceEffects(member, "voiceDaily", { test: (e) => upd.voiceTodayMin >= e.minMinutes });
}
