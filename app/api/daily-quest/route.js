export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { denyIfNotAdmin } from "@/lib/apiAuth";
import DailyQuest from "@/models/DailyQuest";

// 📌 일일 퀘스트 정의 CRUD — 관리자 전용 (xp-boost 라우트와 같은 형태)

const REASONS = ["chat", "voice", "attend", "any"];
const PERIODS = ["daily", "weekly", "monthly"];
const METRICS = ["count", "xp", "minute"];
const num = (v, def, { min = 0, max = 1_000_000 } = {}) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, Math.round(n)));
};

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
  const name = String(b?.name || "").trim();
  if (!name) {
    return NextResponse.json({ success: false, error: "퀘스트 이름을 입력해 주세요." }, { status: 400 });
  }

  const doc = {
    name: name.slice(0, 40),
    desc: String(b?.desc || "").trim().slice(0, 120),
    period: PERIODS.includes(b?.period) ? b.period : "daily",
    reason: REASONS.includes(b?.reason) ? b.reason : "chat",
    metric: METRICS.includes(b?.metric) ? b.metric : "count",
    target: num(b?.target, 1, { min: 1, max: 1_000_000 }),
    rewardXp: num(b?.rewardXp, 0, { min: 0, max: 1_000_000 }),
    // 등급 배율은 수령 시점에 곱하므로 여기 저장하는 값은 배율 적용 전 기본값이다
    rewardPoint: num(b?.rewardPoint, 0, { min: 0, max: 1_000_000 }),
    enabled: b?.enabled !== false,
    order: num(b?.order, 0, { min: 0, max: 999 }),
    updatedAt: new Date(),
  };

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
