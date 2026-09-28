// ── 출석 한 번 처리 — /출석체크(commands.js)와 음성 자동 출석(features/voiceXp.js)이 같이 쓴다 ──
//    📌 하루(KST) 한 번 자물쇠(lastAttendDate)를 조건부로 세운 쪽만 지급한다 — 두 길이 겹쳐도 합쳐서 한 번.
//    지급 XP = 출석 XP(attendXp) + 역할 버프(getAttendBuffXp) + 아이템 효과(getAttendEffectXp) + 연속 출석 보너스
//    연속 출석 보너스 빙옥은 UserXp.point 에 넣고 원장(WalletLog kind "streak")에 남긴다. 보너스 XP 는 출석 XP 와 같은 XpLog("attend")로.
//    (출석 빙옥 attendPoint 는 지금 어디서도 지급하지 않는다 — 동작을 바꾸지 않으려고 여기서도 주지 않는다)
import { UserXp } from "./db.js";
import { kstToday } from "./leveling.js";
import { getAttendBuffXp } from "./roleConfigs.js";
import { getAttendEffectXp } from "./itemEffects.js";
import { getSettings, isLevelOpen } from "./botSettings.js";
import { grantXp } from "./xp.js";
import { logWallet } from "./wallet.js";

const MAX_BONUS = 10_000_000; // 사이트 저장 한도(app/api/bot-settings)와 같다
const MAX_DAYS = 365;

// KST "YYYY-MM-DD" 의 하루 전
function dayBefore(day) {
  return new Date(Date.parse(`${day}T00:00:00Z`) - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

const toInt = (v, lo, hi) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo;
};

// 📌 연속 출석 보너스 — 켜져 있을 때만. 규칙마다 따로 본다: days 일째에 한 번, repeat 면 days 의 배수마다.
//    같은 날 여러 규칙이 맞으면 합쳐서 준다. 없으면 null. days 는 달성한 연속 일수.
function streakBonusOf(s, streak) {
  if (s.attendStreakEnabled !== true || !Array.isArray(s.attendStreakRules) || !(streak > 0)) return null;
  let xp = 0;
  let point = 0;
  let hit = false;
  for (const r of s.attendStreakRules) {
    const days = toInt(r?.days, 0, MAX_DAYS);
    if (days < 1) continue;
    if (!(streak === days || (r?.repeat === true && streak % days === 0))) continue;
    hit = true;
    xp += toInt(r?.xp, 0, MAX_BONUS);
    point += toInt(r?.point, 0, MAX_BONUS);
  }
  return hit && (xp > 0 || point > 0) ? { xp, point, days: streak } : null;
}

/**
 * 출석 — member 는 GuildMember. source: "command" | "voice" (로그용)
 * @returns {{ closed: true }
 *   | { already: true, streak: number }
 *   | { ok: true, amount: number, attendCount: number, streak: number, bestStreak: number,
 *       streakBonus: { xp: number, point: number, days: number } | null }}
 *   amount = 출석 XP(버프 · 효과 포함, 연속 보너스 제외) — 보너스는 streakBonus 에 따로. 실제 지급 XP 는 amount + streakBonus.xp
 */
export async function claimAttendance(member, { source = "command" } = {}) {
  // 📌 레벨 비공개면 자물쇠도 세우지 않는다 — 공개된 날 그날 출석을 받을 수 있게
  if (!isLevelOpen()) return { closed: true };
  // 📌 날것(API) 멤버면 id · 역할 캐시가 없다 — userId 없이 upsert 하면 userId 가 빈 문서가 생기므로 쓰기 전에 멈춘다
  if (!member?.id || !member.roles?.cache) throw new Error("멤버 정보를 읽지 못했습니다.");

  const s = getSettings();
  const userId = member.id;
  const today = kstToday();

  // 문서가 없는 유저(아직 XP 를 한 번도 못 받음)도 출석할 수 있게 먼저 만들어 둔다
  await UserXp.updateOne({ userId }, { $setOnInsert: { userId } }, { upsert: true }).catch((e) => {
    if (e?.code !== 11000) throw e; // 동시에 만들어진 경우 — 이미 있으니 그대로 간다
  });

  // 자물쇠부터 — 오늘 미출석일 때만 통과하는 조건부 갱신 (연타 · 음성 자동 출석과 겹쳐도 한 번만)
  //    바꾸기 전 문서를 돌려받아 어제 출석했는지(연속)와 누적 출석 수를 본다
  const prev = await UserXp.findOneAndUpdate(
    { userId, lastAttendDate: { $ne: today } },
    { $set: { lastAttendDate: today }, $inc: { attendCount: 1 } },
    { new: false, projection: { attendCount: 1, lastAttendDate: 1, attendStreak: 1, attendBestStreak: 1 } }
  ).lean();

  if (!prev) {
    const cur = await UserXp.findOne({ userId }, { attendStreak: 1 }).lean();
    // 오늘 이미 출석했으니 최소 1일 (연속 기록이 생기기 전에 출석한 문서는 0 이다)
    return { already: true, streak: Math.max(1, Math.floor(Number(cur?.attendStreak) || 0)) };
  }

  const attendCount = Math.max(0, Math.floor(Number(prev.attendCount) || 0)) + 1;
  // 어제 출석이면 이어서 +1, 아니면 1 부터. 어제 출석했는데 기록이 0 인 옛 문서는 어제를 1일로 본다
  const streak =
    prev.lastAttendDate === dayBefore(today) ? Math.max(1, Math.floor(Number(prev.attendStreak) || 0)) + 1 : 1;
  const bestStreak = Math.max(streak, Math.floor(Number(prev.attendBestStreak) || 0));
  // 자물쇠를 통과한 쪽만 여기 온다 — 같은 날 두 번 쓰지 않는다
  await UserXp.updateOne({ userId }, { $set: { attendStreak: streak }, $max: { attendBestStreak: streak } });

  // 아이템 효과 "출석 시" · "출석 N번째마다"(방금 올린 누적 출석 수 기준)도 같은 지급에 더한다
  const amount = Math.max(
    0,
    (Number(s.attendXp) || 0) + getAttendBuffXp(member) + getAttendEffectXp(member, attendCount)
  );
  const streakBonus = streakBonusOf(s, streak);

  const totalXp = amount + (streakBonus?.xp || 0);
  if (totalXp > 0) await grantXp(member, totalXp, { reason: "attend" });

  // 연속 보너스 빙옥 — XP 는 이미 들어갔으니 실패해도 던지지 않는다(출석 자체를 실패로 보이지 않게)
  if (streakBonus?.point > 0) {
    try {
      const paid = await UserXp.updateOne({ userId }, { $inc: { point: streakBonus.point }, $set: { updatedAt: new Date() } });
      // 실제로 들어간 경우에만 원장에 남긴다 (사이트 lib/points.js addPoints 와 같은 규칙)
      if (paid.matchedCount) await logWallet({
        userId,
        currency: "point",
        amount: streakBonus.point,
        kind: "streak",
        label: `연속 출석 ${streak}일 보너스`,
        refId: today,
        meta: { streak, source },
      });
    } catch (e) {
      console.error(`연속 출석 빙옥 지급 오류 (${member.displayName}):`, e.message);
    }
  }

  const bonusText = streakBonus
    ? ` · 연속 ${streak}일 보너스 +${streakBonus.xp.toLocaleString()} XP${streakBonus.point ? ` +${streakBonus.point.toLocaleString()} 빙옥` : ""}`
    : "";
  console.log(
    `✅ 출석(${source === "voice" ? "음성 자동" : "명령어"}): ${member.displayName} +${amount.toLocaleString()} · 연속 ${streak}일${bonusText}`
  );

  return { ok: true, amount, attendCount, streak, bestStreak, streakBonus };
}
