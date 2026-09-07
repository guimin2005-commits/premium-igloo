export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
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
});

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
    const content = str(b.content, 2001);
    if (!content || content.length > 2000) {
      return NextResponse.json({ success: false, error: "내용은 1~2000자로 적어 주세요." }, { status: 400 });
    }
    const target = type === "report" ? str(b.target, 81) : "";
    if (type === "report" && (!target || target.length > 80)) {
      return NextResponse.json({ success: false, error: "신고 대상을 1~80자로 적어 주세요." }, { status: 400 });
    }

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
