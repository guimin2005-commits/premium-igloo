import { NextResponse } from "next/server";
import { isAdminName } from "@/lib/admins";
import BotSetting from "@/models/BotSetting";

// 📌 SYSTEM : LEVEL 비공개 동안 쓰기 API(퀘스트 수령 · 강화 · 시즌 패스)를 서버에서 막는다 — 관리자는 통과.
//    화면만 가리면 API 를 아는 유저가 공개 전에 앞서간다. 판정은 랭킹(app/api/xp/leaderboard) · lib/shopAccess 와 같다.
//    사용법: connectToDatabase 뒤에 `const deny = await denyIfLevelClosed(session); if (deny) return deny;`
export async function denyIfLevelClosed(session) {
  if (isAdminName(session?.user?.name)) return null;
  const setting = await BotSetting.findOne({ key: "main" }, { levelPublic: 1 }).lean();
  if (setting?.levelPublic) return null;
  return NextResponse.json({ success: false, message: "공개 전입니다.", error: "공개 전입니다." }, { status: 403 });
}
