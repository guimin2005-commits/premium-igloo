export const dynamic = "force-dynamic"; 

import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { denyIfNotAdmin, requireSelfOrAdmin } from "@/lib/apiAuth";
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

// [작성] 유저 문의 접수 및 디스코드 알림 발송
export async function POST(request: Request) {
  try {
    await connectToDatabase();
    const data = await request.json();
    
    // 제목은 유저가 적은 걸 쓰고, 비어 있으면 유형으로 만들어 준다
    const generatedTitle =
      data.mainType === "오류" ? data.errorDesc
      : data.mainType === "신고" ? `[${data.reportType}] 신고 접수`
      : data.mainType === "환불 및 교환" ? `[${data.refundType}] ${data.productName}`
      : `[${data.subType}] 일반 문의`;

    const newInquiry = await Inquiry.create({
      ...data,
      title: (data.title || "").trim() || generatedTitle,
      status: "접수 중"
    });

    // 디스코드 실시간 웹훅 알림 전송
    const webhookUrl = process.env.DISCORD_INQUIRY_WEBHOOK_URL;
    if (webhookUrl) {
      await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          embeds: [{
            title: `🚨 새로운 1:1 문의 접수: ${data.mainType}`,
            color: 15286591, // #e91e3f
            fields: [
              { name: "작성자", value: data.user, inline: true },
              { name: "세부 유형", value: data.subType || data.reportType || "오류 제보", inline: true },
              { name: "문의 내용", value: data.content }
            ],
            timestamp: new Date().toISOString()
          }]
        })
      });
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