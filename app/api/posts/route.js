import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { connectToDatabase } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/apiAuth";
import { authOptions } from "@/lib/authOptions";
import { isAdminName } from "@/lib/admins";
import { isSupporterSession } from "@/lib/supporters";
import { bracketVisible } from "@/lib/tournamentPhase";
import Post from "@/models/Post";
import { readDiscordInput, queueNotice, announceView } from "@/lib/noticeAnnounce";

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

    // 세션은 필요한 요청에서만, 한 번만 읽는다
    let session;
    const getSession = async () => (session === undefined ? (session = await getServerSession(authOptions)) : session);

    // 📌 서포터즈 글은 역할 보유자(와 관리자)만 — 화면에서 메뉴를 감추는 것만으로는 막은 게 아니다
    if (category === "서포터즈" && !isSupporterSession(await getSession())) {
      return NextResponse.json({ error: "서포터즈 전용입니다." }, { status: 403 });
    }
    // 카테고리 없이 전부 볼 때도 서포터즈 글은 같은 기준으로 가린다
    if (!category && !isSupporterSession(await getSession())) {
      query.category = { $ne: "서포터즈" };
    }

    /* 📌 예약 발행분·가린 글은 목록에서 제외한다.
       ?all=1 로 전부 보는 건 관리자만 — 화면에서 안 부르는 것만으로는 막은 게 아니다. */
    let wantAll = searchParams.get("all") === "1";
    if (wantAll) {
      if (!isAdminName((await getSession())?.user?.name)) wantAll = false;
    }
    if (!wantAll) {
      query.$or = [{ publishAt: null }, { publishAt: { $lte: new Date() } }];
      query.hidden = { $ne: true }; // 가린 글은 목록에서 뺀다
    }

    const posts = await Post.find(query).sort({ createdAt: -1 });

    // 📌 비공개 대진표는 API 에서도 뺀다 — 화면에서 안 그리는 것만으로는 막은 게 아니다. 관리자는 원문을 받는다.
    let data = posts;
    if (posts.some((p) => p.tournamentBracket && !bracketVisible(p)) && !isAdminName((await getSession())?.user?.name)) {
      data = posts.map((p) => {
        if (!p.tournamentBracket || bracketVisible(p)) return p;
        const o = p.toObject();
        o.tournamentBracket = "";
        return o;
      });
    }

    return NextResponse.json({ success: true, data }, { status: 200 });
  } catch (error) {
    console.error("조회 에러:", error);
    return NextResponse.json({ error: "게시글을 불러오지 못했습니다." }, { status: 500 });
  }
}

// 📌 디스코드 공지는 대기열(lib/noticeAnnounce.js)에 넣고 봇이 보낸다 — 예전 웹훅(DISCORD_NOTICE_WEBHOOK_URL) · 목록 조회 때 보내기는 없앴다

// 📌 글 쓰기·수정·삭제는 관리자만 — 대회 설문에 개인정보(실명·계좌번호)가 붙으므로
//    화면 단 차단만으로는 부족하다. 서버에서 반드시 다시 확인한다.

// 📌 2. 창고에 글 밀어넣기 (작성용)
export async function POST(request) {
  try {
    const auth = await requireAdmin();
    if (auth.deny) return auth.deny;
    await connectToDatabase();
    const body = await request.json();
    delete body.noticeWebhookAt; // 옛 웹훅 표시 — 쓰지 않는다
    // 📌 디스코드 공지 칸(글쓰기)은 글에 저장하지 않고 대기열로 — 잘못된 값이면 글도 만들지 않는다
    const dc = readDiscordInput(body.discord);
    delete body.discord;
    if (dc.error) return NextResponse.json({ error: dc.error, message: dc.error }, { status: 400 });

    // 💡 화면에서 보낸 모든 데이터(eventPeriod, recruitSubCategory 포함)를
    // 하나도 누락 없이 통째로 몽고DB에 생성합니다!
    const newPost = await Post.create(body);

    // 공지사항 · 스위치 켬이면 대기열에 — 예약 글은 공개 시각에, 가린 글은 off 로 둔다. 넣기에 실패해도 글은 그대로 둔다
    let discord = null;
    try {
      discord = announceView(await queueNotice(newPost, dc.input, auth.name || ""));
    } catch (e) {
      console.error("디스코드 공지 대기열 오류:", e);
      discord = { error: "디스코드 공지를 넣지 못했습니다." };
    }

    return NextResponse.json({ success: true, data: newPost, discord }, { status: 200 });
  } catch (error) {
    console.error("업로드 에러:", error);
    return NextResponse.json({ error: "서버 저장 중 오류가 발생했습니다." }, { status: 500 });
  }
}