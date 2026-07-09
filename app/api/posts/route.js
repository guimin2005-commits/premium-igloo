import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import Post from "@/models/Post";

// 📌 1. 창고에서 글 불러오기 (진열대용)
export async function GET(request) {
  try {
    await connectToDatabase();
    
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category");

    let query = {};
    if (category) {
      query.category = category;
    }

    // 📌 예약 발행: 공개 시각이 미래인 글은 목록에서 제외 (?all=1 은 관리자용 전체 조회)
    if (searchParams.get("all") !== "1") {
      query.$or = [{ publishAt: null }, { publishAt: { $lte: new Date() } }];
    }

    const posts = await Post.find(query).sort({ createdAt: -1 });

    return NextResponse.json({ success: true, data: posts }, { status: 200 });
  } catch (error) {
    console.error("조회 에러:", error);
    return NextResponse.json({ error: "게시글을 불러오지 못했습니다." }, { status: 500 });
  }
}

// 📌 공지 발행 시 디스코드 채널에 웹훅 임베드 자동 전송
async function sendNoticeWebhook(post) {
  const webhookUrl = process.env.DISCORD_NOTICE_WEBHOOK_URL;
  if (!webhookUrl) return;

  const desc = (post.content || "").replace(/[*_~=#>\[\]{}|]/g, "").slice(0, 180);
  const embed = {
    title: `📢 ${post.title}`,
    description: `${desc}${desc.length >= 180 ? "…" : ""}\n\n[사이트에서 전체 보기](https://www.premiumigloo.com/notice?id=${post._id})`,
    color: 0xe91e3f,
    footer: { text: "고급 이글루 공식 사이트" },
    timestamp: new Date().toISOString(),
    ...(post.bannerUrl ? { image: { url: post.bannerUrl } } : {}),
  };

  await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ embeds: [embed] }),
  }).catch(() => {});
}

// 📌 2. 창고에 글 밀어넣기 (작성용)
export async function POST(request) {
  try {
    await connectToDatabase();
    const body = await request.json();

    // 💡 화면에서 보낸 모든 데이터(eventPeriod, recruitSubCategory 포함)를
    // 하나도 누락 없이 통째로 몽고DB에 생성합니다!
    const newPost = await Post.create(body);

    // 공지사항이고 즉시 공개(예약 발행 아님)일 때만 디스코드로 전송
    if (newPost.category === "공지사항" && (!newPost.publishAt || new Date(newPost.publishAt) <= new Date())) {
      sendNoticeWebhook(newPost).catch(() => {});
    }

    return NextResponse.json({ success: true, data: newPost }, { status: 200 });
  } catch (error) {
    console.error("업로드 에러:", error);
    return NextResponse.json({ error: "서버 저장 중 오류가 발생했습니다." }, { status: 500 });
  }
}