// ── 서버 퇴장 시 XP 초기화 (대시보드에서 켠 경우에만) ──
//    📌 음성 XP 정지(관리자 — voiceXpOff · voiceXpOffAt · voiceXpOffBy)는 초기화에서 남긴다.
//       정지 중이었으면 지운 뒤 정지 칸(+ 이름 — 관리 검색용)만 든 새 문서를 다시 세운다(나머지는 기본값).
import { Events } from "discord.js";
import { UserXp } from "../db.js";
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
