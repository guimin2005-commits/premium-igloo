export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { denyIfNotAdmin } from "@/lib/apiAuth";
import { QUEST_PRESETS, questPresetDoc, questPresetLine } from "@/lib/questPresets";
import DailyQuest from "@/models/DailyQuest";
import ShopLock from "@/models/ShopLock";

// 📌 추천 퀘스트 불러오기 — 관리자가 창에서 골라 한 번에 등록한다(목록 · 임시 값은 lib/questPresets.js).
//    이름이 곧 키 — 같은 이름의 퀘스트가 이미 있으면 건너뛴다. 추천 아이템(../../items/presets)과 같은 방식.
//    저장 정리는 관리자 퀘스트 등록(app/api/daily-quest POST)과 같다(normalizeQuestDoc). 순서는 그 주기의 맨 뒤에 이어 붙인다.

// 📌 두 관리자가(또는 탭 두 개에서) 동시에 눌러도 같은 이름이 두 번 생기지 않게 등록을 한 번에 하나씩만 돌린다.
//    DailyQuest.name 에는 유니크 인덱스가 없어 upsert 만으로는 동시 삽입을 못 막는다 — 결제 자물쇠(ShopLock, _id 유니크)를 이 키로 빌려 쓴다
const LOCK_ID = "admin:quest-presets";

// ── [조회] 추천 목록 + 이미 있는지(이름 기준) ──
export async function GET() {
  try {
    const deny = await denyIfNotAdmin();
    if (deny) return deny;
    await connectToDatabase();
    const have = await DailyQuest.find({ name: { $in: QUEST_PRESETS.map((p) => p.name) } }, { name: 1 }).lean();
    const haveSet = new Set(have.map((q) => q.name));
    const data = QUEST_PRESETS.map((p) => ({
      key: p.key, period: p.period, name: p.name, desc: p.desc, line: questPresetLine(p), exists: haveSet.has(p.name),
    }));
    return NextResponse.json({ success: true, data });
  } catch (e) {
    console.error("추천 퀘스트 조회 오류:", e);
    return NextResponse.json({ success: false, data: [], message: "조회 중 오류가 발생했습니다." }, { status: 500 });
  }
}

// ── [등록] { keys: [목록 키, ...] } → { created, skipped } (이름 배열). 목록 순서대로 등록한다(보낸 순서와 무관) ──
export async function POST(request) {
  let lock = null;
  try {
    const deny = await denyIfNotAdmin();
    if (deny) return deny;
    const b = await request.json().catch(() => ({}));
    const keys = new Set((Array.isArray(b?.keys) ? b.keys : []).map((k) => String(k || "")));
    const picked = QUEST_PRESETS.filter((p) => keys.has(p.key));
    if (picked.length === 0) {
      return NextResponse.json({ success: false, message: "등록할 퀘스트를 골라 주세요." }, { status: 400 });
    }
    await connectToDatabase();
    lock = await ShopLock.acquire(LOCK_ID);
    if (!lock) return NextResponse.json({ success: false, message: "다른 등록이 진행 중입니다. 잠시 후 다시 시도해 주세요." }, { status: 409 });

    // 순서 — 주기마다 지금 맨 뒤 다음부터 하나씩(관리자 등록과 같은 999 상한)
    const next = {};
    for (const per of new Set(picked.map((p) => p.period))) {
      const last = await DailyQuest.findOne({ period: per }, { order: 1 }).sort({ order: -1 }).lean();
      next[per] = Math.floor(Number(last?.order) || 0) + 1;
    }

    const created = [];
    const skipped = [];
    for (const p of picked) {
      const { name, ...rest } = questPresetDoc(p);
      if (!name) { skipped.push(p.name); continue; }
      // 📌 조건부 삽입 — 같은 이름이 있으면 아무것도 쓰지 않는다($setOnInsert). 두 번 눌러도 중복 없이 건너뛴다
      const r = await DailyQuest.updateOne(
        { name },
        { $setOnInsert: { ...rest, order: Math.min(999, next[p.period]), updatedAt: new Date() } },
        { upsert: true }
      );
      if (r.upsertedCount > 0) { created.push(name); next[p.period]++; }
      else skipped.push(name);
    }
    return NextResponse.json({ success: true, created, skipped });
  } catch (e) {
    console.error("추천 퀘스트 등록 오류:", e);
    return NextResponse.json({ success: false, message: "등록 중 오류가 발생했습니다." }, { status: 500 });
  } finally {
    if (lock) await ShopLock.release(lock);
  }
}
