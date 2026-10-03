import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { connectToDatabase } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/apiAuth";
import { authOptions } from "@/lib/authOptions";
import { isAdminName } from "@/lib/admins";
import { isSupporterSession } from "@/lib/supporters";
import { bracketVisible } from "@/lib/tournamentPhase";
import Post from "@/models/Post";
import { readDiscordInput, syncNotice, dropNotice, announceView } from "@/lib/noticeAnnounce";
import SurveyResponse from "@/models/SurveyResponse";
import SupporterComment from "@/models/SupporterComment";
import SupporterAck from "@/models/SupporterAck";
import SupporterReaction from "@/models/SupporterReaction";

// 📌 1. 수정할 때 기존 데이터를 입력창에 불러오는 기능
export async function GET(request, { params }) {
  try {
    await connectToDatabase();
    // Next.js 14/15 버전을 둘 다 안전하게 지원하기 위해 await를 적용합니다.
    const resolvedParams = await params;
    const { id } = resolvedParams;

    const post = await Post.findById(id);
    if (!post) return NextResponse.json({ error: "존재하지 않는 글입니다." }, { status: 404 });

    // 세션은 필요한 요청에서만, 한 번만 읽는다
    let session;
    const getSession = async () => (session === undefined ? (session = await getServerSession(authOptions)) : session);

    // 📌 가린 글·공개 시각 전 예약 글은 링크를 알아도 열리지 않는다 — 관리자만 통과.
    //    서포터즈 글도 마찬가지 — 목록만 막고 상세를 열어 두면 ID 공유로 새어 나간다.
    const scheduled = !!post.publishAt && new Date(post.publishAt) > new Date();
    if (post.hidden || scheduled || post.category === "서포터즈") {
      const s = await getSession();
      const ok = (post.hidden || scheduled) ? isAdminName(s?.user?.name) : isSupporterSession(s);
      if (!ok) {
        return NextResponse.json({ error: "존재하지 않는 글입니다." }, { status: 404 });
      }
    }
    // 📌 비공개 대진표는 관리자에게만 — 목록 API 와 같은 기준
    if (post.tournamentBracket && !bracketVisible(post) && !isAdminName((await getSession())?.user?.name)) {
      const o = post.toObject();
      o.tournamentBracket = "";
      return NextResponse.json({ success: true, data: o }, { status: 200 });
    }
    return NextResponse.json({ success: true, data: post }, { status: 200 });
  } catch (error) {
    console.error("수정 데이터 로드 에러:", error);
    return NextResponse.json({ error: "데이터 로드 실패" }, { status: 500 });
  }
}

// 📌 글 쓰기·수정·삭제는 관리자만 — 대회 설문에 개인정보(실명·계좌번호)가 붙으므로
//    화면 단 차단만으로는 부족하다. 서버에서 반드시 다시 확인한다.

// 📌 2. 글 수정 완료 버튼을 눌렀을 때 실행되는 기능 (PUT)
export async function PUT(request, { params }) {
  try {
    const auth = await requireAdmin();
    if (auth.deny) return auth.deny;
    await connectToDatabase();
    const resolvedParams = await params;
    const { id } = resolvedParams;
    
    const body = await request.json();
    delete body.noticeWebhookAt; // 옛 웹훅 표시 — 쓰지 않는다
    // 📌 디스코드 공지 칸(글쓰기)은 글에 저장하지 않고 대기열로 — 잘못된 값이면 글도 고치지 않는다
    const dc = readDiscordInput(body.discord);
    delete body.discord;
    if (dc.error) return NextResponse.json({ error: dc.error, message: dc.error }, { status: 400 });
    const updatedPost = await Post.findByIdAndUpdate(id, body, { new: true });

    // 대기열을 글에 맞춘다 — 다른 화면의 수정(고정 · 우승자 등)은 dc.input 이 없다(lib/noticeAnnounce.js syncNotice)
    let discord = null;
    if (updatedPost) {
      try {
        discord = announceView(await syncNotice(updatedPost, dc.input, auth.name || ""));
      } catch (e) {
        console.error("디스코드 공지 대기열 오류:", e);
        discord = { error: "디스코드 공지를 맞추지 못했습니다." };
      }
    }
    
    return NextResponse.json({ success: true, data: updatedPost, discord }, { status: 200 });
  } catch (error) {
    console.error("게시글 수정 에러:", error);
    return NextResponse.json({ error: "게시글 수정 중 오류가 발생했습니다." }, { status: 500 });
  }
}

// 📌 3. 삭제 팝업에서 '삭제하기'를 눌렀을 때 실행되는 기능 (DELETE)
export async function DELETE(request, { params }) {
  try {
    const auth = await requireAdmin();
    if (auth.deny) return auth.deny;
    await connectToDatabase();
    const resolvedParams = await params;
    const { id } = resolvedParams;

    const removed = await Post.findByIdAndDelete(id);
    // 📌 글에 딸린 기록도 함께 지운다 — 글이 없으면 어떤 화면에서도 찾거나 지울 수 없다 (설문 응답엔 실명·계좌번호)
    if (removed) {
      const postId = String(removed._id);
      await Promise.all([
        SurveyResponse.deleteMany({ postId }),
        SupporterComment.deleteMany({ postId }),
        SupporterAck.deleteMany({ postId }),
        SupporterReaction.deleteMany({ postId }),
      ]);
      // 📌 디스코드 공지 — ?discord=delete 면 봇이 보낸 글도 지운다, 아니면 대기열 문서만 지운다(안 보낸 예약 공지는 취소)
      const removeMessage = new URL(request.url).searchParams.get("discord") === "delete";
      await dropNotice(postId, removeMessage, auth.name || "").catch((e) => console.error("디스코드 공지 대기열 정리 오류:", e));
    }
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("게시글 삭제 에러:", error);
    return NextResponse.json({ error: "게시글 삭제 중 오류가 발생했습니다." }, { status: 500 });
  }
}