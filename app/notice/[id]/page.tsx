"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Reveal, LuxStyles } from "../../components/Lux";
import { RenderFormattedText } from "../../components/FormattedText";
import { ADMIN_USERS } from "@/lib/admins";

/* 📌 소식 공지 한 건 = 한 페이지.
   기존 /notice 는 목록 안에서 펼쳐 보는 구조라 링크로 공유하거나 새로고침하면 유지되지 않았다.
   글마다 제 주소를 갖게 한다. */

const WD = ["일", "월", "화", "수", "목", "금", "토"];
const pad = (n: number) => String(n).padStart(2, "0");
const fmt = (v: string) => {
  const d = new Date(v);
  if (isNaN(d.getTime())) return "";
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}(${WD[d.getDay()]})`;
};

export default function NoticeDetailPage() {
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
        <h2 className="text-xl font-black text-white mb-2">글을 찾을 수 없습니다</h2>
        <p className="text-gray-500 text-sm mb-6">삭제되었거나 잘못된 주소입니다.</p>
        <button onClick={() => router.push("/notice")} className="rounded-full bg-white/[0.06] text-gray-300 text-xs font-bold px-5 py-3">소식으로</button>
      </main>
    );
  }

  const important = post.noticeType === "중요" || post.isImportant;
  // 공개 날짜를 따로 지정했으면 그것을, 없으면 작성일을 쓴다
  const shown = post.publishAt || post.createdAt;

  return (
    <main className="flex-1 w-full flex flex-col">
      <LuxStyles />

      <article className="w-full px-5 md:px-8 pt-10 pb-16">
        <div className="max-w-[820px] mx-auto">
          <Reveal>
            <div className="flex items-center gap-3 mb-6">
              <Link href="/notice" className="text-[11px] font-bold text-gray-500 hover:text-white transition-colors">← 소식</Link>
              <span className="h-px flex-1 bg-white/10" />
              {isAdmin && (
                <button onClick={() => router.push(`/write?id=${post._id}`)}
                  className="text-[11px] font-bold text-gray-500 hover:text-white transition-colors">수정</button>
              )}
            </div>

            <div className="flex items-center gap-2 mb-4 flex-wrap">
              <span className="rounded-full px-2.5 py-1 text-[10px] font-black"
                style={important ? { background: "rgba(233,30,63,.18)", color: "#ff5c77" } : { background: "rgba(255,255,255,.07)", color: "#9ca3af" }}>
                {post.noticeType || post.category || "공지사항"}
              </span>
              {important && <span className="text-[10px] font-black text-[#ff5c77]">중요</span>}
            </div>

            <h1 className="text-[24px] md:text-[32px] font-black tracking-tight leading-snug break-keep text-white">{post.title}</h1>

            <div className="flex items-center gap-3 mt-5 pb-5 border-b border-white/10">
              <span className="text-[11px] font-bold text-gray-500 tabular-nums">{fmt(shown)}</span>
              {post.author && <span className="text-[11px] font-bold text-gray-600">{post.author}</span>}
              <button
                onClick={() => { navigator.clipboard.writeText(window.location.href); setCopied(true); setTimeout(() => setCopied(false), 1600); }}
                className="ml-auto rounded-full px-3.5 py-1.5 text-[10px] font-bold bg-white/[0.05] text-gray-400 hover:text-white transition-colors">
                {copied ? "복사됨" : "링크 복사"}
              </button>
            </div>

            <div className="mt-7 text-[14px] md:text-[15px] leading-[1.9] text-gray-300 break-keep">
              <RenderFormattedText text={post.content || ""} />
            </div>
          </Reveal>
        </div>
      </article>
    </main>
  );
}
