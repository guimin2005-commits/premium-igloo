export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/apiAuth";
import { mergeTemplate } from "@/lib/botMessages";
import { NOTICE_KEY } from "@/lib/noticeDiscord";
import { announceView } from "@/lib/noticeAnnounce";
import BotMessage from "@/models/BotMessage";
import BotSetting from "@/models/BotSetting";
import BotStatus from "@/models/BotStatus";
import NoticeAnnounce from "@/models/NoticeAnnounce";

// 📌 디스코드 공지 상태 — 글쓰기(디스코드 공지 줄 · 편집 팝업)와 공지 목록(관리자 칩 · 삭제 창)이 읽는다. 쓰기는 글 저장(app/api/posts)이 한다
//    GET ?postId=<id> → { template(봇 메시지 › 공지 디자인), enabled, channel(공지 채널 있음), botOnline, item(그 글의 대기열 | null) }
//    GET ?list=1      → { items: [{ postId, status, action, hasMessage, error }] } — 최근 300건
const ONLINE_MS = 90_000; // 대시보드 봇 칸(app/api/admin/bot-status)과 같은 기준

const fail = (message, status = 400) => NextResponse.json({ success: false, message, error: message }, { status });

export async function GET(request) {
  const auth = await requireAdmin();
  if (auth.deny) return auth.deny;
  try {
    await connectToDatabase();
    const sp = request.nextUrl.searchParams;

    if (sp.get("list") === "1") {
      const rows = await NoticeAnnounce.find({}, { postId: 1, status: 1, action: 1, messageId: 1, error: 1 })
        .sort({ updatedAt: -1 })
        .limit(300)
        .lean();
      const items = rows.map((d) => ({ postId: d.postId, status: d.status, action: d.action, hasMessage: !!d.messageId, error: d.error || "" }));
      return NextResponse.json({ success: true, data: { items } });
    }

    const postId = String(sp.get("postId") || "");
    if (postId && !mongoose.isObjectIdOrHexString(postId)) return fail("잘못된 요청입니다.");
    const [doc, setting, status, item] = await Promise.all([
      BotMessage.findOne({ key: NOTICE_KEY }).lean(),
      BotSetting.findOne({ key: "main" }, { noticeChannelId: 1 }).lean(),
      BotStatus.findOne({ key: "main" }, { lastSeen: 1 }).lean(),
      postId ? NoticeAnnounce.findOne({ postId }).lean() : null,
    ]);
    const template = mergeTemplate(NOTICE_KEY, doc || null);
    const lastSeen = status?.lastSeen ? new Date(status.lastSeen).getTime() : 0;
    return NextResponse.json({
      success: true,
      data: {
        template,
        enabled: template.enabled !== false,
        channel: !!setting?.noticeChannelId,
        botOnline: !!lastSeen && Date.now() - lastSeen <= ONLINE_MS,
        item: announceView(item),
      },
    });
  } catch (e) {
    console.error("디스코드 공지 상태 조회 오류:", e);
    return fail("디스코드 공지 상태를 불러오지 못했습니다.", 500);
  }
}
