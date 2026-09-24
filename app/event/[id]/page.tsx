"use client";

import React, { useState, useEffect } from "react";
import BackLink from "../../components/BackLink";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Reveal } from "../../components/Lux";
import { RenderFormattedText } from "../../components/FormattedText";
import { ADMIN_USERS } from "@/lib/admins";

/* 📌 이벤트 한 건 = 한 페이지 (규칙 1: 읽는 것은 페이지). 화이트 & 블랙 — 소식 상세와 같은 껍데기. */

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

  if (loading) return <div className="min-h-[60vh] flex items-center justify-center text-[#8a8a8a] text-sm">로딩 중...</div>;

  if (!post) {
    return (
      <main className="w-full max-w-lg mx-auto px-6 py-40 text-center text-[#131313]">
        <h2 className="text-xl font-black mb-2">이벤트를 찾을 수 없습니다</h2>
        <p className="text-[#8a8a8a] text-sm mb-6">삭제되었거나 잘못된 주소입니다.</p>
        <button onClick={() => router.push("/event")} className="rounded-full bg-[#f2f2f2] hover:bg-[#e0e0e0] text-[#5a5a5a] text-xs font-bold px-5 py-3 transition-colors">이벤트로</button>
      </main>
    );
  }

  const tag = post.eventTag && post.eventTag !== "NONE" ? post.eventTag : "";

  return (
    <main className="flex-1 w-full flex flex-col text-[#131313]">
      <article className="w-full px-5 md:px-8 pt-10 pb-24 md:pb-20">
        <div className="max-w-[820px] mx-auto">
          <Reveal>
            <div className="flex items-center gap-3 mb-6">
              <BackLink href="/event" label="이벤트" inline />
              <span className="h-px flex-1 bg-[#ededed]" />
              {isAdmin && (
                <button onClick={() => router.push(`/write?id=${post._id}`)}
                  className="text-[11px] font-bold text-[#8a8a8a] hover:text-[#131313] transition-colors">수정</button>
              )}
            </div>

            <div className="flex items-center gap-3 mb-4 flex-wrap">
              {tag && <span className="text-[11px] font-black text-[#e91e3f]">{tag}</span>}
              <span className="text-[12px] font-bold text-[#5a5a5a] tabular-nums">{post.eventPeriod || "날짜 미정"}</span>
            </div>

            <h1 className="text-[24px] md:text-[32px] font-black tracking-tight leading-snug break-keep">{post.title}</h1>

            <div className="flex items-center gap-3 mt-5 pb-5 border-b border-[#ededed]">
              {post.author && <span className="text-[11px] font-bold text-[#a3a3a3]">{post.author}</span>}
              <button
                onClick={() => { navigator.clipboard.writeText(window.location.href); setCopied(true); setTimeout(() => setCopied(false), 1600); }}
                className="ml-auto rounded-full px-3.5 py-1.5 text-[10px] font-bold bg-[#f2f2f2] hover:bg-[#e0e0e0] text-[#5a5a5a] transition-colors">
                {copied ? "복사됨" : "링크 복사"}
              </button>
            </div>

            <div className="mt-7 w-full aspect-[16/7] bg-[#f2f2f2] overflow-hidden flex items-center justify-center">
              {post.bannerUrl
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={post.bannerUrl} alt="" className="w-full h-full object-cover" />
                : <span className="text-[12px] font-bold text-[#a3a3a3]">이벤트</span>}
            </div>

            <div className="mt-7 text-[14px] md:text-[15px] leading-[1.9] text-[#5a5a5a] break-keep">
              <RenderFormattedText text={post.content || ""} />
            </div>
          </Reveal>
        </div>
      </article>
    </main>
  );
}
