"use client";

import React, { useState, useEffect } from "react";
import BackLink from "../../components/BackLink";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Reveal, LuxStyles } from "../../components/Lux";
import { RenderFormattedText } from "../../components/FormattedText";
import { ADMIN_USERS } from "@/lib/admins";

/* 📌 이벤트 한 건 = 한 페이지 (규칙 1: 읽는 것은 페이지).
   예전엔 목록 위 모달이라 링크로 공유하거나 새로고침하면 사라졌다. 소식 상세와 같은 껍데기. */

export default function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: session } = useSession();
  const isAdmin = !!session?.user?.name && ADMIN_USERS.includes(session.user.name);

  const [post, setPost] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch(`/api/posts/${id}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { if (d?.success) setPost(d.data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="min-h-[60vh] flex items-center justify-center text-gray-500 text-sm">로딩 중...</div>;

  if (!post) {
    return (
      <main className="w-full max-w-lg mx-auto px-6 py-40 text-center">
        <h2 className="text-xl font-black text-white mb-2">이벤트를 찾을 수 없습니다</h2>
        <p className="text-gray-500 text-sm mb-6">삭제되었거나 잘못된 주소입니다.</p>
        <button onClick={() => router.push("/event")} className="rounded-full bg-white/[0.06] text-gray-300 text-xs font-bold px-5 py-3">이벤트로</button>
      </main>
    );
  }

  const tag = post.eventTag && post.eventTag !== "NONE" ? post.eventTag : "";

  return (
    <main className="flex-1 w-full flex flex-col">
      <LuxStyles />

      <article className="w-full px-5 md:px-8 pt-10 pb-16">
        <div className="max-w-[820px] mx-auto">
          <Reveal>
            <div className="flex items-center gap-3 mb-6">
              <BackLink href="/event" label="이벤트" tone="dark" inline />
              <span className="h-px flex-1 bg-white/10" />
              {isAdmin && (
                <button onClick={() => router.push(`/write?id=${post._id}`)}
                  className="text-[11px] font-bold text-gray-500 hover:text-white transition-colors">수정</button>
              )}
            </div>

            <div className="w-full aspect-[16/7] bg-[#1a1a1a] rounded-2xl mb-6 flex items-center justify-center border border-white/5 relative overflow-hidden">
              {post.bannerUrl
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={post.bannerUrl} alt="" className="w-full h-full object-cover" />
                : <span className="text-gray-600 text-sm">이벤트</span>}
            </div>

            <div className="flex items-center gap-3 mb-4 flex-wrap">
              {tag && (
                <span className={`px-2.5 py-1 text-[11px] font-black rounded-md ${tag === "NEW" ? "bg-emerald-500/10 text-emerald-400" : "bg-[#e91e3f] text-white"}`}>{tag}</span>
              )}
              <span className="text-[12px] font-bold text-gray-400 tabular-nums">{post.eventPeriod || "날짜 미정"}</span>
            </div>

            <h1 className="text-[24px] md:text-[32px] font-black tracking-tight leading-snug break-keep text-white">{post.title}</h1>

            <div className="flex items-center gap-3 mt-5 pb-5 border-b border-white/10">
              {post.author && <span className="text-[11px] font-bold text-gray-600">{post.author}</span>}
              <button
                onClick={() => { navigator.clipboard.writeText(window.location.href); setCopied(true); setTimeout(() => setCopied(false), 1600); }}
                className="ml-auto rounded-full px-3.5 py-1.5 text-[10px] font-bold bg-white/[0.05] text-gray-400 hover:text-white transition-colors">
                {copied ? "복사됨" : "링크 복사"}
              </button>
            </div>

            <div className="mt-7 text-[14px] md:text-[15px] leading-[1.9] text-gray-300 break-keep whitespace-pre-wrap">
              <RenderFormattedText text={post.content || ""} />
            </div>
          </Reveal>
        </div>
      </article>
    </main>
  );
}
