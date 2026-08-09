// ── 서버 퇴장 시 XP 초기화 (대시보드에서 켠 경우에만) ──
import { Events } from "discord.js";
import { UserXp } from "../db.js";
import { getSettings } from "../botSettings.js";
import { config } from "../config.js";

export function registerLeaveReset(client) {
  client.on(Events.GuildMemberRemove, async (member) => {
    try {
      if (member.guild?.id !== config.guildId) return;
      if (!getSettings().resetOnLeave) return;

      const res = await UserXp.deleteOne({ userId: member.id });
      if (res.deletedCount) {
        console.log(`🧹 퇴장으로 XP 초기화: ${member.user?.username || member.id}`);
      }
    } catch (e) {
      console.error("퇴장 초기화 오류:", e.message);
    }
  });
}
