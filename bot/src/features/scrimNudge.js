// ── 스크림 캘린더 미제출자 DM 재촉 ──────────────
//  사이트에서 "재촉" 을 누르면 ScrimNudge 에 pending 이 쌓인다 → 여기서 개인 DM 으로 보낸다.
//  ⚠️ 자동으로 찌르지 않는다. 보내는 시점은 사람이 정한다.
//  DM 이 막혀 있으면 실패로 남긴다 (운영 화면에서 사유가 보인다).
import { ScrimNudge } from "../db.js";
import { buildNudgeMessage } from "../nudgeMessage.js";

const TICK_MS = 20 * 1000;

async function tick(client) {
  const rows = await ScrimNudge.find({ status: "pending" }).sort({ createdAt: 1 }).limit(20);
  if (!rows.length) return;

  for (const n of rows) {
    try {
      const user = await client.users.fetch(n.userId).catch(() => null);
      if (!user) {
        n.status = "failed";
        n.error = "디스코드에서 유저를 찾을 수 없습니다.";
        await n.save();
        continue;
      }
      // 문구는 사이트가 완성해 넣어준다. 비어 있으면(옛 기록) 기본 문구로 만든다.
      await user.send(n.message || buildNudgeMessage({ teamName: n.teamName, url: n.url }));
      n.status = "sent";
      n.sentAt = new Date();
      n.error = "";
      await n.save();
      console.log(`📮 캘린더 재촉 DM: ${n.userName || n.userId} (${n.teamName})`);
    } catch (e) {
      n.status = "failed";
      // 50007 = Cannot send messages to this user (DM 차단)
      n.error = e?.code === 50007 ? "DM 이 막혀 있어 보내지 못했습니다." : e.message;
      await n.save();
      console.error(`📮 재촉 DM 실패 (${n.userName || n.userId}):`, n.error);
    }
  }
}

export function startScrimNudge(client) {
  const run = async () => { try { await tick(client); } catch (e) { console.error("재촉 DM 오류:", e.message); } };
  run();
  setInterval(run, TICK_MS);
  console.log("✅ 캘린더 재촉 대기열 시작 (20초 주기 — 사람이 누를 때만 쌓인다)");
}
