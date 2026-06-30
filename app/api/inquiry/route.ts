export const dynamic = "force-dynamic"; 

import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import Inquiry from "../../models/Inquiry"; // (아까 해결하신 경로)

export async function GET(request: Request) {
  try {
    await connectToDatabase();
    const { searchParams } = new URL(request.url);
    const user = searchParams.get("user");

    let inquiries;
    if (user) {
      inquiries = await Inquiry.find({ user: user }).sort({ createdAt: -1 });
    } else {
      inquiries = await Inquiry.find().sort({ createdAt: -1 });
    }
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
    
    // UI 구조에 맞게 제목 자동 생성
    const generatedTitle = data.mainType === "오류 문의" ? data.errorDesc : (data.mainType === "신고 문의" ? `[${data.reportType}] 신고 접수` : `[${data.subType}] 일반 문의`);

    const newInquiry = await Inquiry.create({
      ...data,
      title: generatedTitle,
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

// [답변] 관리자 답변 달기 및 상태 업데이트
export async function PUT(request: Request) {
  try {
    await connectToDatabase();
    const { id, answer } = await request.json();
    const updatedInquiry = await Inquiry.findByIdAndUpdate(
      id,
      { answer: answer, status: "답변 완료", answeredAt: new Date() },
      { new: true }
    );
    return NextResponse.json({ success: true, data: updatedInquiry });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// [삭제] 관리자 문의 삭제
export async function DELETE(request: Request) {
  try {
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