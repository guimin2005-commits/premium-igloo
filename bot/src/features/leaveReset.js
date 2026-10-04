// ── 서버 퇴장 시 XP 초기화 (대시보드에서 켠 경우에만) ──
//    📌 음성 XP 정지(관리자 — voiceXpOff · voiceXpOffAt · voiceXpOffBy)는 초기화에서 남긴다.
//       정지 중이었으면 지운 뒤 정지 칸(+ 이름 — 관리 검색용)만 든 새 문서를 다시 세운다(나머지는 기본값).
//    📌 2026-10-04 "아이템도 함께 없앱니다(실물 상품은 제외)" — 인벤토리 아이템(상점 구매 · 운영진 지급 · 시즌 패스 보상, 대기 · 완료)도 회수한다.
//       실물(기프트카드 — itemType physical) · 이미 쓴 소모품(consumedAt)은 그대로 둔다.
//       돌려줄 값은 없다(지갑을 통째로 지웠다) — 환불 · 취소가 아니라 봇 기간 만료와 같은 expired + revokedAt 으로 끝내고 운영진 메모에 "퇴장 초기화"를 붙인다.
//       refunded · cancelled 로 두면 원장(/api/xp/ledger) · 재화 통계(lib/adminEconomy)가 낸 값을 돌려준 것으로 센다.
//       디스코드 역할은 서버를 나가며 이미 빠졌다(다시 들어와도 돌아오지 않는다). 효과 캐시는 바로 다시 읽는다(itemEffects.js)
//    📌 이번 달 랭킹 — 퇴장 초기화 기록(Payout kind "reset" · paid, 관리자 초기화와 같은 표시)을 남긴다. 사이트 랭킹(app/api/xp/leaderboard monthBoard)이
//       그 시각까지를 0 으로 쳐서, 같은 달에 다시 들어와도 나가기 전에 번 XP 가 '이번 달'에 다시 잡히지 않는다(내역 · 재화 통계에는 보이지 않는다).
//       금액은 0 — 지운 XP 는 문서와 함께 사라졌고, 패스 기준선 셈(사이트 lib/seasonPass · views/pass.js 의 지급 합)에 끼지 않게
import { Events } from "discord.js";
import { UserXp, ActivityStat, Purchase, Payout } from "../db.js";
import { dropActivity } from "./activityStats.js";
import { refreshItemEffects } from "../itemEffects.js";
import { getSettings } from "../botSettings.js";
import { config } from "../config.js";

const NOTE = "퇴장 초기화";

// 보유 중인 아이템 회수 — 조건부 한 번(두 번 와도 한 번만 바뀐다). 운영진 메모는 있던 글 뒤에 붙인다(역할 이전 기록 표시 "역할 이전 …"를 지우지 않게)
async function revokeItems(userId, at) {
  const res = await Purchase.updateMany(
    { userId, status: { $in: ["pending", "completed"] }, itemType: { $ne: "physical" }, consumedAt: null },
    [
      {
        $set: {
          status: "expired",
          revokedAt: at,
          processedAt: at,
          error: "",
          adminNote: {
            $cond: [
              { $gt: [{ $strLenCP: { $ifNull: ["$adminNote", ""] } }, 0] },
              { $concat: ["$adminNote", ` · ${NOTE}`] },
              NOTE,
            ],
          },
        },
      },
    ]
  );
  return res.modifiedCount || 0;
}

export function registerLeaveReset(client) {
  client.on(Events.GuildMemberRemove, async (member) => {
    try {
      if (member.guild?.id !== config.guildId) return;
      if (!getSettings().resetOnLeave) return;
      const at = new Date();

      const gone = await UserXp.findOneAndDelete(
        { userId: member.id },
        { projection: { username: 1, displayName: 1, voiceXpOff: 1, voiceXpOffAt: 1, voiceXpOffBy: 1 } }
      ).lean();
      // 📌 퀘스트용 활동 횟수(ActivityStat)도 같이 지운다 — 다시 들어와 이전 진행도로 퀘스트를 받지 않게(XP 문서가 없던 사람도)
      dropActivity(member.id);
      await ActivityStat.deleteMany({ u: member.id }).catch((e) => console.error("퇴장 초기화(활동 횟수) 오류:", e.message));
      // 📌 아이템 — XP 문서가 없던 사람(운영진 지급만 받은 사람 등)도
      try {
        const n = await revokeItems(member.id, at);
        if (n) {
          console.log(`🧹 퇴장으로 아이템 회수: ${member.user?.username || member.id} — ${n}건`);
          await refreshItemEffects();
        }
      } catch (e) {
        console.error("퇴장 초기화(아이템) 오류:", e.message);
      }
      if (!gone) return;
      console.log(`🧹 퇴장으로 XP 초기화: ${member.user?.username || member.id}`);

      // 📌 이번 달 랭킹이 이 시각까지를 0 으로 치게 — 정지 칸 문서를 다시 세우기 전에 남긴다. 실패해도 초기화는 이미 끝났다
      await Payout.create({
        userName: gone.displayName || gone.username || member.user?.username || member.id,
        userId: member.id,
        amount: 0,
        reason: NOTE,
        source: "etc",
        kind: "reset",
        by: "bot",
        status: "paid",
        createdAt: at,
        paidAt: at,
      }).catch((e) => console.error("퇴장 초기화(기록) 오류:", e.message));

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
