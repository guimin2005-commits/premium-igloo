export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { connectToDatabase } from "@/lib/mongodb";
import { authOptions } from "@/lib/authOptions";
import { isAdminName } from "@/lib/admins";
import Notification from "@/models/Notification";

// ── 디스코드 사용자명(핸들) 또는 ID → 유저 조회 (길드 멤버 검색) ─────────────
// ⚠️ 사용자명이 정확히 같은 사람(또는 입력한 ID 의 멤버)만 인정한다 — 검색은 앞글자 일치라,
//    오타 · 서버를 나간 사람이면 앞글자만 같은 다른 회원에게 경고 · 제재 통지가 갔다.
// 반환: { id, name } 찾음 · "missing" 서버에 그런 사람 없음 · null 조회 실패(봇 권한 · 네트워크)
async function resolveRecipient(input: string): Promise<{ id: string; name: string } | "missing" | null> {
  try {
    const guild = process.env.DISCORD_GUILD_ID;
    const token = process.env.DISCORD_BOT_TOKEN;
    if (!guild || !token) return null;
    // 숫자 ID 로 넣었으면 그 멤버를 바로 본다
    if (/^\d{17,20}$/.test(input)) {
      const res = await fetch(`https://discord.com/api/v10/guilds/${guild}/members/${input}`, {
        headers: { Authorization: `Bot ${token}` },
      });
      if (res.status === 404) return "missing";
      if (!res.ok) return null;
      const m = await res.json();
      return m?.user?.id ? { id: m.user.id, name: m.user.username || input } : null;
    }
    const res = await fetch(
      `https://discord.com/api/v10/guilds/${guild}/members/search?query=${encodeURIComponent(input)}&limit=100`,
      { headers: { Authorization: `Bot ${token}` } }
    );
    if (!res.ok) return null;
    const members = await res.json();
    if (!Array.isArray(members)) return null;
    const q = input.toLowerCase();
    const exact = members.find((m: any) => m.user?.username?.toLowerCase() === q);
    return exact?.user?.id ? { id: exact.user.id, name: exact.user.username } : "missing";
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

// 📌 본인 알림 조건 — 요청이 보낸 닉네임 · ID 가 아니라 서버 세션으로 정한다.
//    예전엔 쿼리의 user · id 를 그대로 믿어서, 닉네임만 알면 남의 알림을 읽고 읽음 처리할 수 있었다.
function mineFilter(session: any) {
  const or: any[] = [];
  if (session?.user?.name) or.push({ recipientName: session.user.name });
  if (session?.user?.id) or.push({ recipientId: session.user.id });
  return or.length ? { $or: or } : null;
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

    // 내 알림 목록 (닉네임 또는 디스코드 ID로 매칭 — 닉네임 변경에도 안전). 대상은 세션으로만 정한다
    void user; void discordId; // 옛 호출이 붙여 보내는 값 — 더는 쓰지 않는다
    const me: any = await getServerSession(authOptions);
    const mine = mineFilter(me);
    if (!mine) {
      return NextResponse.json({ success: false, error: "로그인이 필요합니다.", data: [] }, { status: 401 });
    }
    // 유저가 전체 삭제로 숨긴 것은 빼고 (hiddenAt 이 없거나 null)
    const list = await Notification.find({ ...mine, hiddenAt: null }).sort({ createdAt: -1 });
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

    const input = recipient.trim();
    const found = await resolveRecipient(input);
    if (found === "missing") {
      return NextResponse.json({ success: false, error: "디스코드 서버에서 해당 사용자명(핸들)을 찾지 못했습니다." }, { status: 404 });
    }
    // 조회 자체가 실패하면(봇 권한 · 네트워크) 입력값 그대로 저장한다 — 알림함은 로그인 이름(또는 ID)이 정확히 같은 사람에게만 보인다
    const recipientName = found ? found.name : input;
    const recipientId = found ? found.id : /^\d{17,20}$/.test(input) ? input : null;

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

// ── [읽음] 유저가 알림 확인 처리 — 본인 알림만 (세션 기준) ──────────
export async function PATCH(request: Request) {
  try {
    const session: any = await getServerSession(authOptions);
    const mine = mineFilter(session);
    if (!mine) return NextResponse.json({ success: false, error: "로그인이 필요합니다." }, { status: 401 });
    await connectToDatabase();
    const body = await request.json();

    // 전체 읽음
    if (body.markAll) {
      await Notification.updateMany(
        { ...mine, read: false },
        { read: true, readAt: new Date() }
      );
      return NextResponse.json({ success: true });
    }

    // 단건 읽음
    if (body.id) {
      const updated = await Notification.findOneAndUpdate(
        { _id: body.id, ...mine },
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

// ── [삭제] 내 알림 전체 삭제(?mine=all) · 관리자 발송 취소/삭제(?id=) ─────────
export async function DELETE(request: Request) {
  try {
    const session: any = await getServerSession(authOptions);
    // 📌 내 알림 전체 삭제 — 본인 것만(세션 기준). 문서를 지우지 않고 hiddenAt 으로 숨긴다 —
    //    경고 · 제재 같은 발송 기록은 운영 근거라 유저가 지워도 관리자 쪽에는 남아야 한다.
    if (new URL(request.url).searchParams.get("mine") === "all") {
      const mine = mineFilter(session);
      if (!mine) return NextResponse.json({ success: false, error: "로그인이 필요합니다." }, { status: 401 });
      await connectToDatabase();
      const now = new Date();
      // 안 읽은 채로 지운 것은 읽음으로 — 읽은 시각이 이미 있는 것은 건드리지 않는다
      await Notification.updateMany({ ...mine, hiddenAt: null, read: false }, { read: true, readAt: now });
      const r = await Notification.updateMany({ ...mine, hiddenAt: null }, { hiddenAt: now });
      return NextResponse.json({ success: true, deleted: r.modifiedCount || 0 });
    }
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
