import type { Metadata } from "next";
import { connectToDatabase } from "@/lib/mongodb";
import Post from "@/models/Post";

/* 📌 공지 상세(/notice/[id]) 링크 프리뷰 — 페이지는 클라이언트라 제목·배너는 여기서 넣는다.
   ⚠️ 가린 글·서포터즈 글·공개 시각 전 예약 글은 제목도 흘리지 않는다 (/notice?id= 와 같은 기준). */

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const fallback: Metadata = { title: "공지사항 | 고급 이글루", description: "고급 이글루의 최신 소식과 주요 안내를 확인하세요." };
  try {
    const { id } = await params;
    if (!/^[0-9a-fA-F]{24}$/.test(id)) return fallback;
    await connectToDatabase();
    const post: any = await Post.findById(id).lean();
    if (!post || post.hidden || post.category === "서포터즈") return fallback;
    if (post.publishAt && new Date(post.publishAt) > new Date()) return fallback;

    const desc = (post.content || "").replace(/[*_~=#>\[\]{}|]/g, "").slice(0, 90) || "나의 활동이 곧 나의 자산이 되는 곳";
    return {
      title: `${post.title} | 고급 이글루`,
      description: desc,
      openGraph: {
        title: post.title,
        description: desc,
        // siteName 은 넣지 않는다 — 프리뷰 맨 위에 사이트 이름 줄이 하나 더 붙는다
        type: "article",
        images: post.bannerUrl ? [{ url: post.bannerUrl }] : [{ url: "/logo.png", width: 500, height: 500 }],
      },
    };
  } catch {
    return fallback;
  }
}

export default function NoticeDetailLayout({ children }: { children: React.ReactNode }) {
  return children;
}
