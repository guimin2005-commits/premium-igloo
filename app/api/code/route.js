export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import Code from "@/models/Code";

// [조회] 관리자용 전체 코드 목록
export async function GET() {
  try {
    await connectToDatabase();
    const codes = await Code.find().sort({ createdAt: -1 });
    return NextResponse.json({ success: true, data: codes });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// [수정] 관리자용 코드 수정 또는 [사용] 유저가 코드를 입력하여 보상 수령
export async function POST(request) {
  try {
    await connectToDatabase();
    const body = await request.json();
    const { id, reward, roleId, maxUses, expiresAt, code, userId, userName } = body;

    // 관리자: 코드 수정
    if (id) {
      if (!reward || !reward.trim()) {
        return NextResponse.json({ success: false, error: "보상 설명은 필수입니다." }, { status: 400 });
      }

      const updated = await Code.findByIdAndUpdate(id, {
        reward: reward.trim(),
        roleId: roleId || "",
        maxUses: maxUses === undefined || maxUses === null ? 1 : Number(maxUses),
        expiresAt: expiresAt || undefined,
      }, { new: true });

      if (!updated) {
        return NextResponse.json({ success: false, error: "코드를 찾을 수 없습니다." }, { status: 404 });
      }

      return NextResponse.json({ success: true, data: updated });
    }

    // 유저: 코드 사용
    if (!code || !code.trim()) {
      return NextResponse.json({ success: false, message: "코드를 입력해 주세요." }, { status: 400 });
    }

    const normalized = code.trim().toUpperCase();
    const found = await Code.findOne({ code: normalized });

    if (!found || !found.isActive) {
      return NextResponse.json({ success: false, message: "유효하지 않은 코드입니다." }, { status: 404 });
    }
    if (found.expiresAt && new Date(found.expiresAt) < new Date()) {
      return NextResponse.json({ success: false, message: "이미 만료된 코드입니다." }, { status: 410 });
    }
    if (userName && found.usedBy.includes(userName)) {
      return NextResponse.json({ success: false, message: "이미 사용한 코드입니다." }, { status: 409 });
    }
    if (found.maxUses !== 0 && found.usedBy.length >= found.maxUses) {
      return NextResponse.json({ success: false, message: "사용 한도가 초과된 코드입니다." }, { status: 409 });
    }

    // (선택) 디스코드 역할 지급
    if (found.roleId && userId) {
      const GUILD_ID = process.env.DISCORD_GUILD_ID;
      const TOKEN = process.env.DISCORD_BOT_TOKEN;
      if (GUILD_ID && TOKEN) {
        await fetch(`https://discord.com/api/v10/guilds/${GUILD_ID}/members/${userId}/roles/${found.roleId}`, {
          method: "PUT",
          headers: { "Authorization": `Bot ${TOKEN}`, "Content-Length": "0" },
        }).catch(() => {});
      }
    }

    found.usedBy.push(userName || "익명");
    await found.save();

    return NextResponse.json({ success: true, message: found.reward });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

// [발급] 관리자용 코드 생성
export async function PUT(request) {
  try {
    await connectToDatabase();
    const { code, reward, roleId, maxUses, expiresAt } = await request.json();

    if (!code || !code.trim() || !reward || !reward.trim()) {
      return NextResponse.json({ success: false, error: "코드와 보상 설명은 필수입니다." }, { status: 400 });
    }

    const newCode = await Code.create({
      code: code.trim().toUpperCase(),
      reward: reward.trim(),
      roleId: roleId || "",
      maxUses: maxUses === undefined || maxUses === null ? 1 : Number(maxUses),
      expiresAt: expiresAt || undefined,
    });

    return NextResponse.json({ success: true, data: newCode });
  } catch (error) {
    if (error.code === 11000) {
      return NextResponse.json({ success: false, error: "이미 존재하는 코드입니다." }, { status: 409 });
    }
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// [삭제] 관리자용 코드 삭제
export async function DELETE(request) {
  try {
    await connectToDatabase();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ success: false, error: "ID가 없습니다." }, { status: 400 });
    await Code.findByIdAndDelete(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
