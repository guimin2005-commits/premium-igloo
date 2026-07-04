import { connectToDatabase } from "@/lib/mongodb";
import Post from "@/models/Post";
import NoticeClient from "./NoticeClient";

// 📌 공지 URL(/notice?id=...) 공유 시 디스코드/카톡 카드에 해당 공지 제목이 뜨도록 동적 OG 태그 생성
export async function generateMetadata({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const params = await searchParams;
  const id = params?.id;

  if (id && /^[0-9a-fA-F]{24}$/.test(id)) {
    try {
      await connectToDatabase();
      const post: any = await Post.findById(id).lean();
      if (post) {
        const desc = (post.content || "").replace(/[*_~=#>\[\]{}|]/g, "").slice(0, 90) || "고급 이글루 공식 사이트";
        return {
          title: `${post.title} | 고급 이글루`,
          description: desc,
          openGraph: {
            title: post.title,
            description: desc,
            siteName: "고급 이글루",
            type: "article",
            images: post.bannerUrl ? [{ url: post.bannerUrl }] : [{ url: "/logo.png", width: 500, height: 500 }],
          },
        };
      }
    } catch {}
  }

  return {
    title: "공지사항 | 고급 이글루",
    description: "고급 이글루의 최신 소식과 주요 안내를 확인하세요.",
  };
}

export default function NoticePage() {
  return <NoticeClient />;
}
