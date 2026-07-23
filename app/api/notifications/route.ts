export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { connectToDatabase } from "@/lib/mongodb";
import { authOptions } from "@/lib/authOptions";
import { isAdminName } from "@/lib/admins";
import Notification from "@/models/Notification";

// ── 디스코드 닉네임 → 유저 ID 조회 (길드 멤버 검색) ─────────────
// 봇에 GUILD_MEMBERS 권한이 없으면 실패할 수 있으므로 null 반환을 우아하게 처리
async function resolveDiscordId(username: string): Promise<string | null> {
  try {
    const guild = process.env.DISCORD_GUILD_ID;
    const token = process.env.DISCORD_BOT_TOKEN;
    if (!guild || !token) return null;
    const res = await fetch(
      `https://discord.com/api/v10/guilds/${guild}/members/search?query=${encodeURIComponent(username)}&limit=100`,
      { headers: { Authorization: `Bot ${token}` } }
    );
    if (!res.ok) return null;
    const members = await res.json();
    if (!Array.isArray(members) || members.length === 0) return null;
    const q = username.toLowerCase();
    const exact = members.find(
      (m: any) =>
        m.user?.username?.toLowerCase() === q ||
        m.user?.global_name?.toLowerCase() === q ||
        m.nick?.toLowerCase() === q
    );
    return (exact || members[0])?.user?.id || null;
  } catch {
    return null;
  }
}

// ── 실제 배포 도메인 판별 ─────────────────────────────────
// NEXTAUTH_URL이 localhost로 잡혀 있어도, 관리자가 실제로 접속한 도메인(요청 헤더)을 사용
function getBaseUrl(request: Request): string {
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") || "https";
  if (host && !host.startsWith("localhost") && !host.startsWith("127.0.0.1")) {
    return `${proto}://${host}`;
  }
  const origin = request.headers.get("origin");
  if (origin) return origin;
  if (host) return `${proto}://${host}`;
  return process.env.NEXTAUTH_URL || "https://premium-igloo.vercel.app";
}

// ── 디스코드 DM 발송 (가벼운 "새 알림 도착" 핑) ────────────────
async function sendDiscordDM(userId: string, type: string, title: string, siteUrl: string): Promise<boolean> {
  try {
    const token = process.env.DISCORD_BOT_TOKEN;
    if (!token) return false;

    // 1) DM 채널 생성
    const dmRes = await fetch("https://discord.com/api/v10/users/@me/channels", {
      method: "POST",
      headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ recipient_id: userId }),
    });
    if (!dmRes.ok) return false;
    const dm = await dmRes.json();

    // 2) 메시지 전송 — 본문은 사이트 알림함에서 확인하도록 유도
    const msgRes = await fetch(`https://discord.com/api/v10/channels/${dm.id}/messages`, {
      method: "POST",
      headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        embeds: [
          {
            title: "📬 고급 이글루 · 새 알림이 도착했어요",
            description: `**[${type}] ${title}**\n\n자세한 내용은 아래 버튼(또는 사이트 프로필 → 알림함)에서 확인해 주세요.`,
            color: 15286591, // #e91e3f
            url: `${siteUrl}/profile?tab=notice`,
            footer: { text: "고급 이글루 운영팀" },
            timestamp: new Date().toISOString(),
          },
        ],
        components: [
          {
            type: 1,
            components: [
              { type: 2, style: 5, label: "사이트에서 확인하기", url: `${siteUrl}/profile?tab=notice` },
            ],
          },
        ],
      }),
    });
    return msgRes.ok;
  } catch {
    return false;
  }
}

// ── [조회] 내 알림 목록 (또는 관리자 발송 이력) ──────────────
export async function GET(request: Request) {
  try {
    await connectToDatabase();
    const { searchParams } = new URL(request.url);
    const user = searchParams.get("user");
    const discordId = searchParams.get("id");
    const sent = searchParams.get("sent"); // 관리자 발송 이력

    // 관리자 발송 이력
    if (sent) {
      const session: any = await getServerSession(authOptions);
      if (!isAdminName(session?.user?.name)) {
        return NextResponse.json({ success: false, error: "권한이 없습니다." }, { status: 403 });
      }
      const list = await Notification.find().sort({ createdAt: -1 }).limit(100);
      return NextResponse.json({ success: true, data: list });
    }

    // 내 알림 목록 (닉네임 또는 디스코드 ID로 매칭 — 닉네임 변경에도 안전)
    if (!user && !discordId) {
      return NextResponse.json({ success: false, error: "대상이 지정되지 않았습니다." }, { status: 400 });
    }
    const or: any[] = [];
    if (user) or.push({ recipientName: user });
    if (discordId) or.push({ recipientId: discordId });
    const list = await Notification.find({ $or: or }).sort({ createdAt: -1 });
    return NextResponse.json({ success: true, data: list });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// ── [발송] 관리자 → 특정 유저 알림 발송 ──────────────────────
export async function POST(request: Request) {
  try {
    const session: any = await getServerSession(authOptions);
    if (!isAdminName(session?.user?.name)) {
      return NextResponse.json({ success: false, error: "관리자만 발송할 수 있습니다." }, { status: 403 });
    }

    await connectToDatabase();
    const { recipient, type, title, content } = await request.json();

    if (!recipient?.trim() || !title?.trim() || !content?.trim()) {
      return NextResponse.json({ success: false, error: "수신자·제목·내용을 모두 입력해 주세요." }, { status: 400 });
    }

    const recipientName = recipient.trim();
    const recipientId = await resolveDiscordId(recipientName);

    // 디스코드 ID를 찾은 경우에만 DM 핑 발송 (본문은 사이트에 저장)
    let dmSent = false;
    if (recipientId) {
      dmSent = await sendDiscordDM(recipientId, type || "안내", title.trim(), getBaseUrl(request));
    }

    const doc = await Notification.create({
      recipientName,
      recipientId: recipientId || undefined,
      type: type || "안내",
      title: title.trim(),
      content: content.trim(),
      dmSent,
      sentBy: session.user.name,
    });

    return NextResponse.json({
      success: true,
      data: doc,
      userFound: !!recipientId, // 디스코드 유저 매칭 성공 여부
      dmSent,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// ── [읽음] 유저가 알림 확인 처리 ────────────────────────────
export async function PATCH(request: Request) {
  try {
    await connectToDatabase();
    const body = await request.json();

    // 전체 읽음
    if (body.markAll && (body.user || body.id)) {
      const or: any[] = [];
      if (body.user) or.push({ recipientName: body.user });
      if (body.id) or.push({ recipientId: body.id });
      await Notification.updateMany(
        { $or: or, read: false },
        { read: true, readAt: new Date() }
      );
      return NextResponse.json({ success: true });
    }

    // 단건 읽음
    if (body.id) {
      const updated = await Notification.findByIdAndUpdate(
        body.id,
        { read: true, readAt: new Date() },
        { new: true }
      );
      return NextResponse.json({ success: true, data: updated });
    }

    return NextResponse.json({ success: false, error: "잘못된 요청입니다." }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// ── [삭제] 관리자 발송 취소/삭제 ────────────────────────────
export async function DELETE(request: Request) {
  try {
    const session: any = await getServerSession(authOptions);
    if (!isAdminName(session?.user?.name)) {
      return NextResponse.json({ success: false, error: "관리자만 삭제할 수 있습니다." }, { status: 403 });
    }
    await connectToDatabase();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ success: false, error: "ID가 없습니다." }, { status: 400 });
    await Notification.findByIdAndDelete(id);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
