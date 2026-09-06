// ── 음성 XP (설정된 주기마다 지급) ──────────────────
import { UserXp } from "../db.js";
import { getVoiceBracketBonus, kstToday, VOICE_TIME_START } from "../leveling.js";
import { getBuffXp, getAttendBuffXp } from "../roleConfigs.js";
import { getChannelPolicy } from "../channelConfigs.js";
import { getSettings, getActiveBoostXp, getMuteMultiplier } from "../botSettings.js";
import { grantXp } from "../xp.js";
import { config, policy } from "../config.js";

async function voiceXpTick(client) {
  try {
    const guild = client.guilds.cache.get(config.guildId);
    if (!guild) return;

    const s = getSettings();
    const afkChannelId = guild.afkChannelId;
    // 이번 틱이 대표하는 접속 시간 — XP를 준 틱만 시간으로 인정하므로
    // 잠수·제외 채널·음소거 차단으로 지급을 건너뛴 시간은 쌓이지 않는다.
    const tickSec = kstToday() >= VOICE_TIME_START ? s.voiceIntervalSec || 300 : 0;
    // 출석 자동 지급 판정에 쓰는 값 — 시간 집계와 달리 시즌 2 게이트를 타지 않는다
    const today = kstToday();
    const tickMin = Math.max(1, Math.round((s.voiceIntervalSec || 300) / 60));
    const attendMin = Math.max(1, s.attendVoiceMin || 60);

    for (const [, voiceState] of guild.voiceStates.cache) {
      const member = voiceState.member;
      const channel = voiceState.channel;
      if (!member || member.user.bot || !channel) continue;
      if (channel.id === afkChannelId) continue; // 잠수 채널 제외

      // 채널/카테고리 정책 (대시보드 설정)
      const channelPolicy = getChannelPolicy(channel);
      if (channelPolicy.excluded) continue;

      // 음소거 정책 — block이면 지급 자체를 건너뜀
      const muteMultiplier = getMuteMultiplier(voiceState);
      if (muteMultiplier === 0) continue;

      // 내전 채널은 env 설정이 있을 때만 별도 기본값 사용
      const base = config.scrimChannelIds.has(channel.id) ? policy.scrimBaseXp : s.voiceXp;
      const doc = await UserXp.findOne({ userId: member.id }, { level: 1 }).lean();

      const amount = Math.floor(
        (base + getVoiceBracketBonus(doc?.level || 0) + getBuffXp(member) + channelPolicy.boostXp + getActiveBoostXp(member, channel)) *
          muteMultiplier
      );

      await grantXp(member, amount, {
        reason: "voice",
        channelId: channel.id,
        channelName: channel.name || "",
        voiceSeconds: tickSec,
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

      if (upd && upd.voiceTodayMin >= attendMin && upd.lastAttendDate !== today) {
        // 자물쇠부터 — 오늘 미출석인 경우에만 통과하는 조건부 갱신 (틱이 겹쳐도 한 번만)
        const lock = await UserXp.updateOne(
          { userId: member.id, lastAttendDate: { $ne: today } },
          { $set: { lastAttendDate: today }, $inc: { attendCount: 1 } }
        );
        if (lock.modifiedCount) {
          const attendAmount = (s.attendXp || 0) + getAttendBuffXp(member);
          if (attendAmount > 0) {
            await grantXp(member, attendAmount, { reason: "attend" });
            console.log(`✅ 출석 자동 지급: ${member.displayName} +${attendAmount.toLocaleString()} (음성 ${upd.voiceTodayMin}분)`);
          }
        }
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
