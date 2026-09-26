import { NextResponse, after } from "next/server";
import { getServerSession } from "next-auth";
import { connectToDatabase } from "@/lib/mongodb";
import { authOptions } from "@/lib/authOptions";
import { isAdminName } from "@/lib/admins";
import { isSupporterSession } from "@/lib/supporters";
import { bracketVisible } from "@/lib/tournamentPhase";
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

    // 📌 예약 공지는 공개 시각이 지난 뒤 첫 목록 조회 때 한 번만 디스코드로 보낸다 (따로 도는 스케줄러가 없다)
    if (!category || category === "공지사항") {
      after(() => announceNoticeOnce({ $or: [{ publishAt: null }, { publishAt: { $lte: new Date() } }] }).catch(() => {}));
    }

    return NextResponse.json({ success: true, data }, { status: 200 });
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
    description: `${desc}${desc.length >= 180 ? "…" : ""}\n\n[사이트에서 전체 보기](https://www.premiumigloo.com/notice/${post._id})`,
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

// 📌 공지 웹훅은 글마다 한 번만 — noticeWebhookAt 을 조건부로 세운 요청만 보낸다 (동시 요청에도 중복 없음).
//    noticeWebhookAt 이 null 로 '저장된' 글만 잡는다($type) — 필드가 없는 옛 공지가 한꺼번에 나가지 않게.
async function announceNoticeOnce(filter) {
  // 웹훅 주소가 없는 서버(로컬 등)가 발송 표시만 먼저 차지하지 않게 한다
  if (!process.env.DISCORD_NOTICE_WEBHOOK_URL) return;
  const due = await Post.findOneAndUpdate(
    { ...filter, category: "공지사항", hidden: { $ne: true }, noticeWebhookAt: { $type: "null" } },
    { $set: { noticeWebhookAt: new Date() } },
    { new: true, sort: { createdAt: 1 } }
  );
  if (due) await sendNoticeWebhook(due);
}

// 📌 글 쓰기·수정·삭제는 관리자만 — 대회 설문에 개인정보(실명·계좌번호)가 붙으므로
//    화면 단 차단만으로는 부족하다. 서버에서 반드시 다시 확인한다.
async function requireAdmin() {
  const session = await getServerSession(authOptions);
  return isAdminName(session?.user?.name);
}
const denied = () => NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });

// 📌 2. 창고에 글 밀어넣기 (작성용)
export async function POST(request) {
  try {
    if (!(await requireAdmin())) return denied();
    await connectToDatabase();
    const body = await request.json();
    delete body.noticeWebhookAt; // 발송 표시는 서버만 쓴다

    // 💡 화면에서 보낸 모든 데이터(eventPeriod, recruitSubCategory 포함)를
    // 하나도 누락 없이 통째로 몽고DB에 생성합니다!
    const newPost = await Post.create(body);

    // 공지사항이고 즉시 공개(예약 발행 아님)·가리지 않은 글일 때만 디스코드로 전송.
    // 예약 글·가린 글은 공개된 뒤 목록 조회(GET)에서 한 번 보낸다.
    if (newPost.category === "공지사항" && !newPost.hidden && (!newPost.publishAt || new Date(newPost.publishAt) <= new Date())) {
      after(() => announceNoticeOnce({ _id: newPost._id }).catch(() => {}));
    }

    return NextResponse.json({ success: true, data: newPost }, { status: 200 });
  } catch (error) {
    console.error("업로드 에러:", error);
    return NextResponse.json({ error: "서버 저장 중 오류가 발생했습니다." }, { status: 500 });
  }
}