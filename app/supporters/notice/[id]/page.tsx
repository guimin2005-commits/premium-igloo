import NoticeDetail from "../../NoticeDetail";

// 📌 서포터즈 공지 한 건 = 한 주소. 창이 아니라 페이지라서 새로고침·공유·뒤로 가기가 그대로 통한다.
//    입장 판정·데이터는 클라이언트(NoticeDetail)가 세션으로 가르고, 서버(/api/posts/[id])가 다시 막는다.
export default async function SupporterNoticePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // key — 이전·다음으로 글을 옮길 때 지난 글의 댓글·입력이 남지 않도록 통째로 새로 그린다
  return <NoticeDetail key={id} postId={id} />;
}
