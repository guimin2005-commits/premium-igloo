// ── 서버 퇴장 시 XP 초기화 (대시보드에서 켠 경우에만) ──
//    📌 음성 XP 정지(관리자 — voiceXpOff · voiceXpOffAt · voiceXpOffBy)는 초기화에서 남긴다.
//       정지 중이었으면 지운 뒤 정지 칸(+ 이름 — 관리 검색용)만 든 새 문서를 다시 세운다(나머지는 기본값).
import { Events } from "discord.js";
import { UserXp, ActivityStat } from "../db.js";
import { dropActivity } from "./activityStats.js";
import { getSettings } from "../botSettings.js";
import { config } from "../config.js";

export function registerLeaveReset(client) {
  client.on(Events.GuildMemberRemove, async (member) => {
    try {
      if (member.guild?.id !== config.guildId) return;
      if (!getSettings().resetOnLeave) return;

      const gone = await UserXp.findOneAndDelete(
        { userId: member.id },
        { projection: { username: 1, displayName: 1, voiceXpOff: 1, voiceXpOffAt: 1, voiceXpOffBy: 1 } }
      ).lean();
      // 📌 퀘스트용 활동 횟수(ActivityStat)도 같이 지운다 — 다시 들어와 이전 진행도로 퀘스트를 받지 않게(XP 문서가 없던 사람도)
      dropActivity(member.id);
      await ActivityStat.deleteMany({ u: member.id }).catch((e) => console.error("퇴장 초기화(활동 횟수) 오류:", e.message));
      if (!gone) return;
      console.log(`🧹 퇴장으로 XP 초기화: ${member.user?.username || member.id}`);

      // 📌 upsert — 그 사이 다른 지급이 문서를 먼저 만들었어도 정지는 덮어 세운다(새로 만들면 나머지 칸은 스키마 기본값)
      if (gone.voiceXpOff === true) {
        await UserXp.updateOne(
          { userId: member.id },
          {
            $set: {
              username: gone.username || "",
              displayName: gone.displayName || "",
              voiceXpOff: true,
              voiceXpOffAt: gone.voiceXpOffAt || null,
              voiceXpOffBy: gone.voiceXpOffBy || "",
            },
          },
          { upsert: true }
        );
      }
    } catch (e) {
      console.error("퇴장 초기화 오류:", e.message);
    }
  });
}
