export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { getServerSession } from "next-auth/next";
import { connectToDatabase } from "@/lib/mongodb";
import { authOptions } from "@/lib/authOptions";
import { isSupporterSession } from "@/lib/supporters";
import { kstDayStart } from "@/lib/kst";
import SupporterReport from "@/models/SupporterReport";

const TYPES = ["report", "feedback"];
const TYPE_LABEL = { report: "유저 신고", feedback: "피드백" };
const DAILY_LIMIT = 10; // 한 사람이 하루(KST)에 낼 수 있는 건수 — 도배·실수 연타 방지

// 로그인 → 서포터즈 순으로 거른다. 통과하면 session 을, 아니면 응답을 돌려준다.
//    userId 가 비면 빈 문자열끼리 남의 제출물이 섞여 보이므로 id 없는 세션은 로그인으로 취급하지 않는다
async function gate() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.name || !session.user.id) {
    return { deny: NextResponse.json({ success: false, error: "로그인이 필요합니다." }, { status: 401 }) };
  }
  if (!isSupporterSession(session)) {
    return { deny: NextResponse.json({ success: false, error: "서포터즈 전용입니다." }, { status: 403 }) };
  }
  return { session };
}

const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");

// 본인이 고치거나 지울 수 있는 상태 — 접수 중이고 관리자 답변이 아직 없을 때만.
//    답변이 달린 뒤에 내용이 바뀌면 답변이 엉뚱한 글에 붙은 꼴이 되므로 그때부터 잠근다.
const isEditable = (r) => r.status !== "done" && !r.adminReply;

// 조건부 갱신용 필터 — 소유·상태·답변 없음을 한 번에 검사해 조회와 저장 사이의 틈을 없앤다.
//    adminReply 는 예전 문서에 필드가 없을 수 있어 null(=없음)도 함께 본다
const ownEditable = (id, userId) => ({ _id: id, userId, status: "open", adminReply: { $in: ["", null] } });

// 본인 화면에 내려가는 모양 — userId/userName 은 본인 것이라 굳이 싣지 않는다
const pick = (r) => ({
  _id: String(r._id),
  type: r.type,
  target: r.target || "",
  content: r.content || "",
  status: r.status === "done" ? "done" : "open",
  adminReply: r.adminReply || "",
  repliedAt: r.repliedAt || null,
  createdAt: r.createdAt,
  editable: isEditable(r),
});

// content(1~2000)·target(report 면 1~80) 검증 — 제출과 수정이 같은 기준을 쓴다. 통과하면 { content, target }, 아니면 { error }
function validateBody(type, b, fallbackTarget = "") {
  const content = str(b.content, 2001);
  if (!content || content.length > 2000) return { error: "내용은 1~2000자로 적어 주세요." };
  const target = type === "report" ? (b.target === undefined ? fallbackTarget : str(b.target, 81)) : "";
  if (type === "report" && (!target || target.length > 80)) return { error: "신고 대상을 1~80자로 적어 주세요." };
  return { content, target };
}

const LOCKED = "답변이 달린 뒤에는 수정할 수 없습니다.";

// 관리자 알림 — 저장이 끝난 뒤 보내며, 실패해도 접수 결과에는 영향을 주지 않는다
async function notifyAdmins(doc) {
  const webhookUrl = process.env.DISCORD_SUPPORTER_REPORT_WEBHOOK_URL || process.env.DISCORD_INQUIRY_WEBHOOK_URL;
  if (!webhookUrl) return;

  const body = String(doc.content || "");
  const preview = body.slice(0, 300) + (body.length > 300 ? "…" : "");
  const fields = [{ name: "작성자", value: doc.userName || doc.userId, inline: true }];
  if (doc.type === "report") fields.push({ name: "신고 대상", value: doc.target || "-", inline: true });
  fields.push({ name: "내용", value: preview || "-" });

  await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      embeds: [{
        title: `📮 서포터즈 ${TYPE_LABEL[doc.type] || doc.type} 접수`,
        color: doc.type === "report" ? 15286591 : 4162488, // 신고 #e91e3f · 피드백 #3f83b8
        fields,
        footer: { text: "고급 이글루 · 관리자 → 서포터즈 → 신고·피드백에서 답변" },
        timestamp: new Date().toISOString(),
      }],
    }),
  }).catch(() => {});
}

// ── [조회] 내가 낸 신고·피드백 — 본인 것만 최신 50건 ──
export async function GET() {
  try {
    const g = await gate();
    if (g.deny) return g.deny;
    await connectToDatabase();

    const userId = g.session.user.id;
    const rows = await SupporterReport.find({ userId }).sort({ createdAt: -1 }).limit(50).lean();
    return NextResponse.json({ success: true, reports: rows.map(pick) });
  } catch (e) {
    console.error("서포터즈 제출함 조회 오류:", e);
    return NextResponse.json({ success: false, error: "조회 중 오류가 발생했습니다." }, { status: 500 });
  }
}

// ── [제출] 신고·피드백 접수 — body { type, target, content } ──
//    report 는 대상이 필수, feedback 은 대상을 비운다. 하루 10건을 넘기면 429.
export async function POST(request) {
  try {
    const g = await gate();
    if (g.deny) return g.deny;
    await connectToDatabase();

    const b = await request.json().catch(() => ({}));
    const type = str(b.type, 16);
    if (!TYPES.includes(type)) {
      return NextResponse.json({ success: false, error: "유형이 올바르지 않습니다." }, { status: 400 });
    }
    const v = validateBody(type, b);
    if (v.error) return NextResponse.json({ success: false, error: v.error }, { status: 400 });
    const { content, target } = v;

    const userId = g.session.user.id;
    const userName = g.session.user.name || "";

    const todayCount = await SupporterReport.countDocuments({ userId, createdAt: { $gte: kstDayStart() } });
    if (todayCount >= DAILY_LIMIT) {
      return NextResponse.json(
        { success: false, error: `하루 ${DAILY_LIMIT}건까지 제출할 수 있습니다. 내일 다시 시도해 주세요.` },
        { status: 429 }
      );
    }

    const doc = await SupporterReport.create({ userId, userName, type, target, content, status: "open" });
    await notifyAdmins(doc);

    return NextResponse.json({ success: true, report: pick(doc) });
  } catch (e) {
    console.error("서포터즈 제출 오류:", e);
    return NextResponse.json({ success: false, error: "제출 중 오류가 발생했습니다." }, { status: 500 });
  }
}

// ── [수정] 본인 건 내용 고치기 — body { id, content, target? } ──
//    유형(type)은 바꿀 수 없다. target 을 빼면 기존 값을 유지한다. 답변이 달렸거나 완료면 409.
export async function PATCH(request) {
  try {
    const g = await gate();
    if (g.deny) return g.deny;
    await connectToDatabase();

    const b = await request.json().catch(() => ({}));
    const id = str(b.id, 32);
    if (!mongoose.isValidObjectId(id)) {
      return NextResponse.json({ success: false, error: "대상을 확인해 주세요." }, { status: 400 });
    }
    const userId = g.session.user.id;

    // 유형에 따라 검증이 달라서 먼저 읽는다 — 남의 것은 있어도 없는 것으로 답한다
    const cur = await SupporterReport.findOne({ _id: id, userId }).lean();
    if (!cur) {
      return NextResponse.json({ success: false, error: "해당 건을 찾을 수 없습니다." }, { status: 404 });
    }
    if (!isEditable(cur)) {
      return NextResponse.json({ success: false, error: LOCKED }, { status: 409 });
    }

    const v = validateBody(cur.type, b, cur.target || "");
    if (v.error) return NextResponse.json({ success: false, error: v.error }, { status: 400 });

    // 읽은 뒤 저장 사이에 답변이 달리면 필터에 걸리지 않아 null → 같은 409
    const doc = await SupporterReport.findOneAndUpdate(
      ownEditable(id, userId),
      { $set: { content: v.content, target: v.target } },
      { new: true }
    ).lean();
    if (!doc) {
      return NextResponse.json({ success: false, error: LOCKED }, { status: 409 });
    }

    return NextResponse.json({ success: true, report: pick(doc) });
  } catch (e) {
    console.error("서포터즈 제출 수정 오류:", e);
    return NextResponse.json({ success: false, error: "수정 중 오류가 발생했습니다." }, { status: 500 });
  }
}

// ── [삭제] 본인 건 지우기 — ?id= ──
//    수정과 같은 조건(본인·접수 중·답변 없음)일 때만. 조건에 안 맞으면 409, 남의 것·없는 것은 404.
export async function DELETE(request) {
  try {
    const g = await gate();
    if (g.deny) return g.deny;
    await connectToDatabase();

    const id = str(new URL(request.url).searchParams.get("id") || "", 32);
    if (!mongoose.isValidObjectId(id)) {
      return NextResponse.json({ success: false, error: "대상을 확인해 주세요." }, { status: 400 });
    }
    const userId = g.session.user.id;

    const deleted = await SupporterReport.findOneAndDelete(ownEditable(id, userId)).lean();
    if (!deleted) {
      // 못 지운 이유를 갈라 답한다 — 본인 것이 있으면 잠긴 것, 없으면 남의 것이거나 이미 없는 것
      const mine = await SupporterReport.exists({ _id: id, userId });
      return mine
        ? NextResponse.json({ success: false, error: LOCKED }, { status: 409 })
        : NextResponse.json({ success: false, error: "해당 건을 찾을 수 없습니다." }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("서포터즈 제출 삭제 오류:", e);
    return NextResponse.json({ success: false, error: "삭제 중 오류가 발생했습니다." }, { status: 500 });
  }
}
