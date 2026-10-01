export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { denyIfNotAdmin } from "@/lib/apiAuth";
import DailyQuest from "@/models/DailyQuest";
import { normalizeQuestDoc } from "@/lib/questKinds";

// 📌 일일 퀘스트 정의 CRUD — 관리자 전용 (xp-boost 라우트와 같은 형태)

export async function GET() {
  const deny = await denyIfNotAdmin();
  if (deny) return deny;
  await connectToDatabase();
  const data = await DailyQuest.find().sort({ order: 1, createdAt: 1 }).lean();
  return NextResponse.json({ success: true, data });
}

export async function POST(request) {
  const deny = await denyIfNotAdmin();
  if (deny) return deny;

  const b = await request.json().catch(() => ({}));
  // 📌 조건(대상 · 세는 방식 · 시간대) 정리는 lib/questKinds.js — 추천 퀘스트 등록과 같은 함수
  const doc = { ...normalizeQuestDoc(b), updatedAt: new Date() };
  if (!doc.name) {
    return NextResponse.json({ success: false, error: "퀘스트 이름을 입력해 주세요." }, { status: 400 });
  }

  await connectToDatabase();
  const saved = b?.id
    ? await DailyQuest.findByIdAndUpdate(b.id, { $set: doc }, { new: true })
    : await DailyQuest.create(doc);

  if (!saved) {
    return NextResponse.json({ success: false, error: "대상 퀘스트를 찾을 수 없습니다." }, { status: 404 });
  }
  return NextResponse.json({ success: true, data: saved });
}

export async function DELETE(request) {
  const deny = await denyIfNotAdmin();
  if (deny) return deny;
  const id = new URL(request.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ success: false, error: "삭제할 퀘스트를 지정해 주세요." }, { status: 400 });
  }
  await connectToDatabase();
  await DailyQuest.findByIdAndDelete(id);
  return NextResponse.json({ success: true });
}
