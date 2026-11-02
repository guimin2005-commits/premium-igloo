// 📌 남의 이름을 서버 별명으로 — userId 들 → Map(userId → UserXp.displayName || username). lib/nick.js 와 같은 규칙(2026-11-01 서버 별명 통일)
//    봇이 활동 때마다 UserXp.displayName 에 서버 별명(길드 nick → 표시 이름 → 계정 이름)을 적는다. 저장 때 굳은 이름(초대 · 그룹 · 댓글 · 채팅)은 읽을 때 이 값으로 바꿔 보인다.
//    문서가 없거나 두 칸이 다 비면 Map 에 넣지 않는다 — 부르는 쪽이 저장된 글자로 둔다
import { connectToDatabase } from "@/lib/mongodb";
import UserXp from "@/models/UserXp";

export async function serverNamesOf(ids) {
  const list = [...new Set((ids || []).map((x) => String(x || "")).filter(Boolean))];
  const out = new Map();
  if (!list.length) return out;
  await connectToDatabase();
  const docs = await UserXp.find({ userId: { $in: list } }, { userId: 1, displayName: 1, username: 1 }).lean();
  for (const d of docs) {
    const n = String(d.displayName || d.username || "").trim();
    if (n) out.set(String(d.userId), n);
  }
  return out;
}
