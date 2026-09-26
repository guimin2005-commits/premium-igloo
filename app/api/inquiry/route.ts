export const dynamic = "force-dynamic"; 

import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { denyIfNotAdmin, requireSelfOrAdmin, getSession } from "@/lib/apiAuth";
import Inquiry from "../../models/Inquiry"; // (아까 해결하신 경로)

// 1:1 문의는 사적인 내용(연락처·환불 정보 등)을 담으므로 열람 권한을 엄격히 나눈다.
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const user = searchParams.get("user");

    if (user) {
      // 본인 문의 내역 — 남의 것은 볼 수 없다
      const auth = await requireSelfOrAdmin(user);
      if (auth.deny) return auth.deny;
    } else {
      // 파라미터가 없으면 전체 목록이므로 관리자만
      const deny = await denyIfNotAdmin();
      if (deny) return deny;
    }

    await connectToDatabase();
    const inquiries = user
      ? await Inquiry.find({ user }).sort({ createdAt: -1 })
      : await Inquiry.find().sort({ createdAt: -1 });
    return NextResponse.json({ success: true, data: inquiries });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// 유형별 세부 항목 — 작성 화면은 유형과 상관없이 모든 칸(환불 유형 기본값 등)을 보내므로 고른 유형의 것만 남긴다
const TYPE_FIELDS: Record<string, string[]> = {
  "일반": ["subType"],
  "오류": ["errorDesc"],
  "신고": ["reportDate", "reportType"],
  "환불 및 교환": ["productName", "refundType"],
};

// 디스코드 임베드 필드 값은 1,024자까지 — 넘으면 웹훅 전체가 거절된다
const clip = (s: any, n = 1000) => {
  const v = String(s || "").trim() || "-";
  return v.length > n ? v.slice(0, n) + "…" : v;
};

// [작성] 유저 문의 접수 및 디스코드 알림 발송
export async function POST(request: Request) {
  try {
    await connectToDatabase();
    const data = await request.json();

    // ⚠️ 작성자는 세션으로만 정한다 — 본문의 user · userId 를 믿으면 남의 이름으로 문의를 남기고
    //    답변 DM 을 엉뚱한 사람에게 보내게 할 수 있다. 비로그인은 상단의 비회원 문의로 들어온다.
    const session: any = await getSession();
    const me = session?.user?.name ? session.user : null;
    const str = (k: string, n = 200) => (typeof data?.[k] === "string" ? data[k].trim().slice(0, n) : "");
    const mainType = str("mainType", 50);

    // 받는 칸만 골라 담는다 — answer · answeredAt · status 같은 운영 필드는 받지 않는다
    const doc: any = {
      user: me ? me.name : "비회원 (게스트)",
      userId: me ? String(me.id || "") : "",
      mainType,
      content: str("content", 5000),
      notifyDiscord: data?.notifyDiscord !== false,
      status: "접수 중",
    };
    const email = str("email");
    if (email) doc.email = email;
    for (const k of TYPE_FIELDS[mainType] || []) {
      const v = str(k);
      if (v) doc[k] = v;
    }

    // 제목은 유저가 적은 걸 쓰고, 비어 있으면 유형으로 만들어 준다
    const generatedTitle =
      mainType === "오류" ? (doc.errorDesc || "오류 제보")
      : mainType === "신고" ? `[${doc.reportType || "기타"}] 신고 접수`
      : mainType === "환불 및 교환" ? `[${doc.refundType || "환불"}] ${doc.productName || "상품"}`
      : doc.subType ? `[${doc.subType}] 일반 문의`
      : mainType === "비회원 문의" ? "비회원 문의" : "일반 문의";
    doc.title = str("title", 100) || generatedTitle;

    const newInquiry = await Inquiry.create(doc);

    // 디스코드 실시간 웹훅 알림 전송
    const detail =
      mainType === "오류" ? doc.errorDesc
      : mainType === "신고" ? doc.reportType
      : mainType === "환불 및 교환" ? `${doc.refundType || "-"} · ${doc.productName || "-"}`
      : doc.subType;
    const webhookUrl = process.env.DISCORD_INQUIRY_WEBHOOK_URL;
    if (webhookUrl) {
      // 알림 실패(거절 · 네트워크 오류)가 이미 저장된 접수를 실패 응답으로 돌려놓지 않게 한다 — 다시 제출해 중복 접수되는 것을 막는다
      await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(5000),
        body: JSON.stringify({
          embeds: [{
            title: `🚨 새로운 1:1 문의 접수: ${mainType}`,
            color: 15286591, // #e91e3f
            fields: [
              { name: "작성자", value: clip(doc.user, 100), inline: true },
              { name: "세부 유형", value: clip(detail, 100), inline: true },
              { name: "문의 내용", value: clip(doc.content) }
            ],
            timestamp: new Date().toISOString()
          }]
        })
      })
        .then((r) => { if (!r.ok) console.error(`문의 웹훅 실패: ${r.status}`); })
        .catch((e) => console.error("문의 웹훅 오류:", e));
    }

    return NextResponse.json({ success: true, data: newInquiry });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// 📌 답변 알림 — 유저에게 디스코드 DM으로 보낸다 (동의한 문의에만)
async function sendAnswerDm(inquiry: any) {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token || !inquiry?.userId || inquiry.notifyDiscord === false) return;

  try {
    // 1) 유저와의 개인 대화방을 연다
    const dmRes = await fetch("https://discord.com/api/v10/users/@me/channels", {
      method: "POST",
      headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ recipient_id: inquiry.userId }),
    });
    if (!dmRes.ok) return;
    const dm = await dmRes.json();
    if (!dm?.id) return;

    // 2) 답변 내용을 보낸다 (DM이 막혀 있으면 디스코드가 거절하므로 조용히 넘어간다)
    await fetch(`https://discord.com/api/v10/channels/${dm.id}/messages`, {
      method: "POST",
      headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        embeds: [{
          title: "1:1 문의 답변이 도착했습니다",
          description: `**${inquiry.title || "문의"}**\n\n${String(inquiry.answer || "").slice(0, 1500)}`,
          color: 15286591,
          footer: { text: "고급 이글루 · 내 정보에서도 확인할 수 있습니다" },
          timestamp: new Date().toISOString(),
        }],
      }),
    });
  } catch {
    // 알림 실패가 답변 저장을 막지 않도록 한다
  }
}

// [답변] 관리자 답변 달기 및 상태 업데이트
export async function PUT(request: Request) {
  try {
    // ⚠️ 답변은 유저에게 디스코드 DM으로 발송되므로, 사칭 답변을 막기 위해 관리자만 허용한다
    const deny = await denyIfNotAdmin();
    if (deny) return deny;
    await connectToDatabase();
    const { id, answer } = await request.json();
    const updatedInquiry = await Inquiry.findByIdAndUpdate(
      id,
      { answer: answer, status: "답변 완료", answeredAt: new Date() },
      { new: true }
    );
    await sendAnswerDm(updatedInquiry);
    return NextResponse.json({ success: true, data: updatedInquiry });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// [삭제] 관리자 문의 삭제
export async function DELETE(request: Request) {
  try {
    const deny = await denyIfNotAdmin();
    if (deny) return deny;
    await connectToDatabase();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ success: false, error: "ID가 없습니다." }, { status: 400 });
    }
    await Inquiry.findByIdAndDelete(id);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}