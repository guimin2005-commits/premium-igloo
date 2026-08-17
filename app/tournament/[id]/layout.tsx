import type { Metadata } from "next";
import { connectToDatabase } from "@/lib/mongodb";
import Post from "@/models/Post";
import { phaseOf, phaseMeta } from "@/lib/tournamentPhase";

/* 📌 대회 상세 링크 프리뷰
   대회 링크는 밖으로 가장 많이 나가는 링크다. 배너가 있으면 큰 그림 카드로 띄운다.
   ⚠️ 가린 글(hidden)은 제목도 흘리지 않는다. */

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const fallback: Metadata = { title: "대회 · 고급 이글루", description: "고급 이글루 대회" };
  try {
    const { id } = await params;
    await connectToDatabase();
    const p: any = await Post.findById(id).lean();
    if (!p || p.hidden) return fallback;

    const phase = phaseMeta(phaseOf(p));
    const bits = [
      p.tournamentGame,
      phase?.label,
      p.tournamentPrize ? `보상 ${p.tournamentPrize}` : "",
    ].filter(Boolean);

    const title = `${p.title} · 고급 이글루`;
    const description = bits.join(" · ") || "고급 이글루 대회";
    const image = p.bannerUrl || "";

    return {
      title,
      description,
      openGraph: {
        title, description, siteName: "고급 이글루", type: "article",
        ...(image ? { images: [{ url: image, alt: p.title }] } : {}),
      },
      twitter: image
        ? { card: "summary_large_image", title, description, images: [image] }
        : { card: "summary", title, description },
    };
  } catch {
    return fallback;
  }
}

export default function TournamentDetailLayout({ children }: { children: React.ReactNode }) {
  return children;
}
