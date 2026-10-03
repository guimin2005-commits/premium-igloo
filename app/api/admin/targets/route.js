export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/apiAuth";
import { parseTargetKeys, resolveTargets, MAX_TARGETS } from "@/lib/adminTargets";

// 📌 지급 대상 미리 확인 — 관리 › 레벨 설정 › 수동 지급의 대상 칸이 입력할 때마다 묻는다. 쓰기 없음.
//    { keys: string | string[] } → { found: [{ userId, name, username }], missing: [key], ambiguous: [{ key, candidates }] }
//    판정은 여러 명 지급(app/api/xp/grant · app/api/admin/items/grant 의 targets)과 같은 lib/adminTargets.js
export async function POST(request) {
  try {
    const { deny } = await requireAdmin();
    if (deny) return deny;

    const b = await request.json().catch(() => ({}));
    const keys = parseTargetKeys(b?.keys);
    if (keys.length > MAX_TARGETS) {
      return NextResponse.json({ success: false, message: `한 번에 ${MAX_TARGETS}명까지 지정할 수 있습니다.` }, { status: 400 });
    }
    if (!keys.length) return NextResponse.json({ success: true, data: { found: [], missing: [], ambiguous: [] } });

    await connectToDatabase();
    const { found, missing, ambiguous } = await resolveTargets(keys, { userId: 1, username: 1, displayName: 1 });
    return NextResponse.json({
      success: true,
      data: {
        found: found.map((r) => ({ userId: r.userId, name: r.displayName || r.username || r.userId, username: r.username || "" })),
        missing,
        ambiguous,
      },
    });
  } catch (e) {
    console.error("지급 대상 확인 오류:", e);
    return NextResponse.json({ success: false, message: "처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}
