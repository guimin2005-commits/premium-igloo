"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn, useSession } from "next-auth/react";
import { Reveal } from "../components/Lux";
import { RenderFormattedText } from "../components/FormattedText";
import { isAdminName } from "@/lib/admins";

// 📌 서포터즈 공지 한 건 = 한 페이지 (/supporters/notice/[id]).
//    창(overlay)으로 띄우면 새로고침·링크 공유·뒤로 가기가 어긋나서 제 주소를 갖는 페이지로 뺐다.
//    목록(/supporters)과 같은 피드백 관용구(효과음·토스트)·아이콘·날짜 형식은 여기서 내보내 두 화면이 나눠 쓴다 —
//    같은 코드를 두 벌 두지 않기 위해서다.

// ── 두 화면이 같이 쓰는 것 ──
export type Post = { _id: string; title: string; content?: string; bannerUrl?: string; createdAt: string; publishAt?: string | null; hidden?: boolean };
export type AckUser = { userId: string; userName: string; at?: string };
export type AckStats = { total: number; byPost: Record<string, { count: number; users: AckUser[] }> };
export type Toast = { id: number; msg: string; accent?: boolean };

export const BLUE = "#3f83b8"; // 서포터즈 식별색 — 태그·확인 표시에만 쓴다
export const fieldClass =
  "w-full rounded-xl bg-white border border-black/[0.08] focus:border-[#131313] text-[14px] text-[#131313] outline-none transition-colors placeholder:text-[#a3a3a3]";

const pad = (n: number) => String(n).padStart(2, "0");
export const fmtDate = (v?: string | null) => {
  if (!v) return "";
  const d = new Date(v);
  return isNaN(d.getTime()) ? "" : `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
};

// 클릭 피드백 — 레벨 페이지와 같은 짧은 톤
export const tone = (freq = 620, dur = 0.04) => {
  try {
    const w = window as any;
    const Ctx = w.AudioContext || w.webkitAudioContext;
    if (!tone.ctx) tone.ctx = new Ctx();
    const ctx = tone.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.025, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + dur);
  } catch {}
};
tone.ctx = null as any;

// 토스트 — 액션 결과 피드백. 상태는 훅이, 그리기는 ToastStack 이 맡는다
export const useToasts = () => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);
  const pushToast = useCallback((msg: string, accent = false) => {
    const id = ++idRef.current;
    setToasts((p) => [...p.slice(-3), { id, msg, accent }]);
    setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 3200);
  }, []);
  return { toasts, pushToast };
};

// 모바일 하단바 위로 띄운다. 키프레임은 쓰는 화면마다 따로 정의하지 않도록 여기 붙여 둔다
export const ToastStack = ({ toasts }: { toasts: Toast[] }) => (
  <>
    <style
      dangerouslySetInnerHTML={{
        __html: `
        @keyframes spToastIn {
          from { opacity: 0; transform: translateY(12px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `,
      }}
    />
    <div className="fixed bottom-24 md:bottom-8 right-4 md:right-6 z-[200] pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          style={{ animation: "spToastIn 0.35s cubic-bezier(0.16,1,0.3,1)" }}
          className={`mt-2 px-5 py-3 rounded-2xl border text-xs font-bold text-right ${
            t.accent
              ? "bg-[#e91e3f] border-[#e91e3f] text-white shadow-[0_10px_30px_rgba(233,30,63,0.45)]"
              : "bg-white/95 border-black/10 text-[#131313] shadow-xl"
          }`}
        >
          {t.msg}
        </div>
      ))}
    </div>
  </>
);

export const CheckMark = ({ className = "w-3 h-3" }: { className?: string }) => (
  <svg aria-hidden viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="3.2">
    <path d="m5 12.5 4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const CommentIcon = ({ className = "w-3.5 h-3.5" }: { className?: string }) => (
  <svg aria-hidden viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.2">
    <path d="M21 12a8 8 0 0 1-8 8H9l-5 3 1.2-4.2A8 8 0 1 1 21 12Z" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const ArrowRight = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg aria-hidden viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.2">
    <path d="m9 6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const CloseIcon = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg aria-hidden viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.2">
    <path d="M6 18 18 6M6 6l12 12" strokeLinecap="round" />
  </svg>
);

const LinkIcon = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg aria-hidden viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// ── 상세 전용 ──
type Comment = {
  _id: string;
  userId: string;
  userName: string;
  userImage?: string;
  content: string;
  createdAt: string;
  mine?: boolean;
  pending?: boolean; // 서버 응답 전 낙관적 항목 — 삭제 x 를 감춘다
};
type ReactionMap = Record<string, { count: number; mine: boolean }>;
type Reactions = { emojis: string[]; reactions: ReactionMap };
type LoadState = "loading" | "ok" | "missing" | "failed";

const COMMENT_MAX = 1000;
const DEFAULT_EMOJIS = ["👍", "✅", "🔥", "👀", "🙏", "❤️"];
const LIST_HREF = "/supporters?tab=notice";
const OBJECT_ID = /^[a-f\d]{24}$/i;

// 댓글 시각 — 일주일 안은 상대 시간, 그 뒤는 날짜
const fmtAgo = (v: string) => {
  const t = new Date(v).getTime();
  if (isNaN(t)) return "";
  const d = Date.now() - t;
  if (d < 60e3) return "방금";
  if (d < 3600e3) return `${Math.floor(d / 60e3)}분 전`;
  if (d < 86400e3) return `${Math.floor(d / 3600e3)}시간 전`;
  if (d < 7 * 86400e3) return `${Math.floor(d / 86400e3)}일 전`;
  return fmtDate(v);
};

const ListLink = () => (
  <Link href={LIST_HREF} className="inline-flex text-[12px] font-bold text-[#8a8a8a] hover:text-[#131313] underline underline-offset-4 transition-colors">
    공지 목록
  </Link>
);

// 글이 없거나 못 여는 경우 — 한 줄과 목록 링크만
const Notice = ({ msg, children }: { msg: string; children?: React.ReactNode }) => (
  <div className="py-24 md:py-32 text-center">
    <p className="text-sm font-bold text-[#131313]">{msg}</p>
    <div className="mt-6 flex flex-wrap items-center justify-center gap-4">
      {children}
      <ListLink />
    </div>
  </div>
);

const iconBtn =
  "shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-full text-[#8a8a8a] hover:text-[#131313] hover:bg-black/[0.05] transition-colors outline-none focus:outline-none";
const navBtn =
  "inline-flex items-center gap-1.5 h-9 px-2 -mx-2 rounded-full text-[12px] font-bold text-[#5a5a5a] enabled:hover:text-[#131313] transition-colors outline-none focus:outline-none disabled:opacity-30 disabled:cursor-default";

export default function NoticeDetail({ postId }: { postId: string }) {
  const { data: session, status: authStatus } = useSession();
  const user = session?.user as any;
  const router = useRouter();

  // 하이드레이션 불일치 방지 — 첫 페인트는 항상 스켈레톤, 마운트 후에만 세션으로 가른다
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const authReady = mounted && authStatus !== "loading";

  const isAdmin = isAdminName(user?.name);
  const allowed = !!user && (!!user.isSupporter || isAdmin);
  const ready = authReady && allowed;

  const { toasts, pushToast } = useToasts();

  const [post, setPost] = useState<Post | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [posts, setPosts] = useState<Post[]>([]); // 이전·다음 계산용 — 목록과 같은 순서(최신순)

  const loadPost = useCallback(async () => {
    setState("loading");
    setPost(null);
    // 형식이 아닌 id 는 서버가 500 을 내므로 먼저 거른다
    if (!OBJECT_ID.test(postId)) {
      setState("missing");
      return;
    }
    try {
      const r = await fetch(`/api/posts/${encodeURIComponent(postId)}`, { cache: "no-store" });
      const body = await r.json().catch(() => null);
      if (body?.success && body.data) {
        setPost(body.data as Post);
        setState("ok");
      } else {
        // 서버는 가린 글·서포터즈 밖도 404 로 답한다 — 여기서는 구분하지 않는다
        setState(r.status === 404 ? "missing" : "failed");
      }
    } catch {
      setState("failed");
    }
  }, [postId]);

  const loadList = useCallback(async () => {
    try {
      // 관리자는 예약·가림 글까지 받아 그 사이도 오간다 (서버가 관리자 아니면 all 을 무시한다)
      const r = await fetch(`/api/posts?category=${encodeURIComponent("서포터즈")}${isAdmin ? "&all=1" : ""}`, { cache: "no-store" });
      const body = await r.json().catch(() => null);
      if (body?.success && Array.isArray(body.data)) setPosts(body.data);
    } catch {}
  }, [isAdmin]);

  useEffect(() => {
    if (!ready) return;
    loadPost();
    loadList();
  }, [ready, loadPost, loadList]);

  // ── 확인 — 서포터즈는 내 체크, 관리자는 전체 현황 ──
  const [acked, setAcked] = useState(false);
  const [ackAt, setAckAt] = useState<string | null>(null);
  const ackBusyRef = useRef(false);
  const [ackStats, setAckStats] = useState<AckStats | null>(null);

  const loadAck = useCallback(async () => {
    try {
      const r = await fetch("/api/supporters/acks", { cache: "no-store" });
      const body = await r.json().catch(() => null);
      if (!body?.success) return;
      const ids: string[] = Array.isArray(body.postIds) ? body.postIds.map(String) : [];
      setAcked(ids.includes(postId));
      const hit = Array.isArray(body.acks) ? body.acks.find((a: any) => a && String(a.postId) === postId) : null;
      setAckAt(hit?.at ? String(hit.at) : null);
    } catch {}
  }, [postId]);

  const loadAckStats = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/supporters/acks", { cache: "no-store" });
      const body = await r.json().catch(() => null);
      if (body?.success) {
        setAckStats({ total: Number(body.total) || 0, byPost: body.byPost && typeof body.byPost === "object" ? body.byPost : {} });
      }
    } catch {}
  }, []);

  // 공지 삭제 — 관리자만. 지우면 목록으로 돌아간다 (댓글·확인·반응 문서는 남지만 글이 없으니 닿을 수 없다)
  const [delConfirm, setDelConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const deletePost = async () => {
    if (deleting) return;
    setDeleting(true);
    try {
      const r = await fetch(`/api/posts/${encodeURIComponent(postId)}`, { method: "DELETE" });
      const body = await r.json().catch(() => null);
      if (r.ok && body?.success) {
        tone(520, 0.06);
        router.push("/supporters?tab=notice");
        return;
      }
      pushToast(body?.error || "삭제하지 못했습니다");
    } catch {
      pushToast("삭제하지 못했습니다");
    }
    setDelConfirm(false);
    setDeleting(false);
  };

  // 낙관적 갱신 — 먼저 뒤집고, 서버가 거절하면 되돌린다. 응답 전까지 다시 누르지 못한다
  const toggleAck = async () => {
    if (ackBusyRef.current) return;
    const on = !acked;
    const prevAt = ackAt;
    ackBusyRef.current = true;
    setAcked(on);
    setAckAt(on ? new Date().toISOString() : null);
    tone(on ? 820 : 520, 0.05);
    try {
      const r = await fetch("/api/supporters/acks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId, on }),
      });
      const body = await r.json().catch(() => null);
      if (body?.success) {
        pushToast(on ? "확인했습니다" : "확인을 취소했습니다", on);
      } else {
        setAcked(!on);
        setAckAt(prevAt);
        pushToast(body?.error || "저장하지 못했습니다");
      }
    } catch {
      setAcked(!on);
      setAckAt(prevAt);
      pushToast("저장하지 못했습니다");
    }
    ackBusyRef.current = false;
  };

  // ── 이모지 반응 — 디스코드 메시지 반응처럼 가볍게. { emoji: { count, mine } } ──
  const [rx, setRx] = useState<Reactions | null>(null);
  const reactionBusyRef = useRef<Set<string>>(new Set());

  const loadReactions = useCallback(async () => {
    try {
      const r = await fetch(`/api/supporters/reactions?postId=${encodeURIComponent(postId)}`, { cache: "no-store" });
      const body = await r.json().catch(() => null);
      if (body?.success) setRx({ emojis: body.emojis || [], reactions: body.reactions || {} });
    } catch {}
  }, [postId]);

  const toggleReaction = async (emoji: string) => {
    if (reactionBusyRef.current.has(emoji)) return;
    reactionBusyRef.current.add(emoji);
    const was = rx?.reactions?.[emoji] || { count: 0, mine: false };
    const revert = () => setRx((prev) => ({ emojis: prev?.emojis || [], reactions: { ...(prev?.reactions || {}), [emoji]: was } }));
    // 낙관적 갱신 — 누른 즉시 바뀌고, 서버가 준 집계로 다시 맞춘다
    setRx((prev) => ({
      emojis: prev?.emojis || [],
      reactions: { ...(prev?.reactions || {}), [emoji]: { count: Math.max(0, was.count + (was.mine ? -1 : 1)), mine: !was.mine } },
    }));
    tone(was.mine ? 520 : 880, 0.05);
    try {
      const r = await fetch("/api/supporters/reactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId, emoji }),
      });
      const body = await r.json().catch(() => null);
      if (body?.success) setRx((prev) => ({ emojis: prev?.emojis || [], reactions: body.reactions || {} }));
      else {
        revert();
        pushToast(body?.error || "반응을 남기지 못했습니다");
      }
    } catch {
      revert();
      pushToast("반응을 남기지 못했습니다");
    }
    reactionBusyRef.current.delete(emoji);
  };

  // ── 댓글 — 오래된 순. 본인·관리자만 삭제 ──
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [commentCount, setCommentCount] = useState(0);
  const [cText, setCText] = useState("");
  const [cSending, setCSending] = useState(false);
  const [cDelId, setCDelId] = useState<string | null>(null);

  const loadComments = useCallback(async () => {
    try {
      const r = await fetch(`/api/supporters/comments?postId=${encodeURIComponent(postId)}`, { cache: "no-store" });
      const body = await r.json().catch(() => null);
      if (body?.success && Array.isArray(body.comments)) {
        const list: Comment[] = body.comments;
        setComments(list);
        if (list.length < 200) {
          setCommentCount(list.length);
        } else {
          // 목록은 200건까지만 오므로 그 위는 집계 API 로 수를 맞춘다
          const c = await fetch("/api/supporters/comments?counts=1", { cache: "no-store" }).then((x) => x.json()).catch(() => null);
          setCommentCount(Number(c?.counts?.[postId]) || list.length);
        }
      } else {
        setComments([]);
        pushToast(body?.error || "댓글을 불러오지 못했습니다");
      }
    } catch {
      setComments([]);
      pushToast("댓글을 불러오지 못했습니다");
    }
  }, [postId, pushToast]);

  // 글이 열린 뒤에만 — 없는 글에 확인·반응·댓글 요청을 보내 오류 토스트를 겹치지 않도록
  useEffect(() => {
    if (!ready || state !== "ok") return;
    if (isAdmin) loadAckStats();
    else loadAck();
    loadReactions();
    loadComments();
  }, [ready, state, isAdmin, loadAck, loadAckStats, loadReactions, loadComments]);

  // 낙관적 등록 — 먼저 붙이고, 서버가 준 문서로 바꿔 끼운다. 실패하면 떼어 내고 입력을 돌려준다
  const cTrim = cText.trim();
  const canSendComment = state === "ok" && !cSending && cTrim.length > 0 && cTrim.length <= COMMENT_MAX;
  const submitComment = async () => {
    if (!canSendComment) return;
    const content = cTrim;
    const tmpId = `tmp-${Date.now()}`;
    const optimistic: Comment = {
      _id: tmpId,
      userId: String(user?.id || ""),
      userName: String(user?.name || ""),
      userImage: user?.image || undefined,
      content,
      createdAt: new Date().toISOString(),
      mine: true,
      pending: true,
    };
    setCSending(true);
    setComments((prev) => [...(prev || []), optimistic]);
    setCommentCount((n) => n + 1);
    setCText("");
    tone(820, 0.06);
    try {
      const r = await fetch("/api/supporters/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId, content }),
      });
      const body = await r.json().catch(() => null);
      if (body?.success && body.comment && typeof body.comment === "object") {
        const saved: Comment = { ...body.comment, _id: String(body.comment._id || tmpId), mine: true };
        setComments((prev) => (prev || []).map((c) => (c._id === tmpId ? saved : c)));
        pushToast("댓글을 남겼습니다", true);
      } else {
        throw new Error(body?.error || "");
      }
    } catch (e: any) {
      setComments((prev) => (prev || []).filter((c) => c._id !== tmpId));
      setCommentCount((n) => Math.max(0, n - 1));
      setCText((cur) => cur || content);
      pushToast(e?.message || "댓글을 보내지 못했습니다");
    }
    setCSending(false);
  };

  // 낙관적 삭제 — 먼저 지우고, 서버가 거절하면 시간순 제자리에 되돌린다. 404 는 이미 없는 것이니 그대로 둔다
  const deleteComment = async (id: string) => {
    const target = (comments || []).find((c) => c._id === id);
    setComments((prev) => (prev || []).filter((c) => c._id !== id));
    setCommentCount((n) => Math.max(0, n - 1));
    setCDelId(null);
    tone(520, 0.06);
    try {
      const r = await fetch(`/api/supporters/comments?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const body = await r.json().catch(() => null);
      if (body?.success) {
        pushToast("댓글을 삭제했습니다", true);
      } else if (r.status === 404) {
        pushToast("이미 삭제된 댓글입니다");
      } else {
        throw new Error(body?.error || "");
      }
    } catch (e: any) {
      if (target) {
        setComments((prev) => [...(prev || []), target].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()));
        setCommentCount((n) => n + 1);
      }
      pushToast(e?.message || "댓글을 삭제하지 못했습니다");
    }
  };

  const copyLink = async () => {
    tone();
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/supporters/notice/${encodeURIComponent(postId)}`);
      pushToast("링크를 복사했습니다", true);
    } catch {
      pushToast("복사하지 못했습니다");
    }
  };

  const goPost = (id: string) => {
    tone();
    router.push(`/supporters/notice/${id}`);
  };

  const skeleton = (
    <div className="space-y-6">
      <div className="h-4 w-24 rounded bg-black/[0.05] animate-pulse"></div>
      <div className="h-9 w-2/3 rounded-lg bg-black/[0.05] animate-pulse"></div>
      <div className="h-64 rounded-2xl bg-black/[0.03] animate-pulse"></div>
      <div className="h-14 rounded-2xl bg-black/[0.025] animate-pulse"></div>
    </div>
  );

  let body: React.ReactNode;
  if (!authReady) {
    body = skeleton;
  } else if (!user) {
    body = (
      <Notice msg="로그인이 필요합니다">
        <button
          type="button"
          onClick={() => signIn("discord", { callbackUrl: `/supporters/notice/${postId}` })}
          className="inline-flex items-center h-9 px-4 rounded-full bg-[#e91e3f] hover:bg-[#d01634] text-white text-[12px] font-bold transition-colors outline-none focus:outline-none"
        >
          Discord로 로그인
        </button>
      </Notice>
    );
  } else if (!allowed) {
    body = <Notice msg="서포터즈 전용 페이지입니다" />;
  } else if (state === "loading") {
    body = skeleton;
  } else if (state === "failed") {
    body = (
      <Notice msg="불러오지 못했습니다">
        <button
          type="button"
          onClick={() => { tone(); loadPost(); }}
          className="inline-flex items-center h-9 px-4 rounded-full bg-black/[0.04] hover:bg-black/[0.08] text-[12px] font-bold text-[#5a5a5a] hover:text-[#131313] transition-colors outline-none focus:outline-none"
        >
          다시 시도
        </button>
      </Notice>
    );
  } else if (state === "missing" || !post) {
    body = <Notice msg="공지를 찾을 수 없습니다" />;
  } else {
    const p = post;
    const idx = posts.findIndex((x) => x._id === p._id);
    // 목록은 최신순 — 아래쪽이 이전(더 오래된) 글
    const olderPost = idx >= 0 && idx < posts.length - 1 ? posts[idx + 1] : null;
    const newerPost = idx > 0 ? posts[idx - 1] : null;
    const scheduled = !!p.publishAt && new Date(p.publishAt).getTime() > Date.now();
    const stat = ackStats?.byPost?.[p._id];
    const ackUsers: AckUser[] = Array.isArray(stat?.users) ? stat!.users : [];
    const emojis = rx?.emojis?.length ? rx.emojis : DEFAULT_EMOJIS;

    body = (
      <Reveal>
        <article>
          {/* 머리 — 목록으로 왼쪽, 도구(수정·링크) 오른쪽, 그 아래 날짜·상태와 제목 */}
          <div className="flex items-center gap-2 mb-6 md:mb-8">
            <Link
              href={LIST_HREF}
              className="inline-flex items-center gap-1.5 h-9 px-2 -ml-2 rounded-full text-[12px] font-bold text-[#5a5a5a] hover:text-[#131313] hover:bg-black/[0.05] transition-colors"
            >
              <ArrowRight className="w-4 h-4 rotate-180" />
              공지 목록
            </Link>
            <span className="ml-auto flex items-center gap-1">
              {isAdmin && (
                <Link
                  href={`/write?id=${p._id}`}
                  className="shrink-0 inline-flex items-center h-8 px-3 rounded-full bg-black/[0.04] hover:bg-black/[0.08] text-[11px] font-bold text-[#5a5a5a] hover:text-[#131313] transition-colors"
                >
                  수정
                </Link>
              )}
              {isAdmin && (
                delConfirm ? (
                  <span className="shrink-0 inline-flex items-center gap-2 text-[11px] font-bold text-[#5a5a5a]">
                    정말 삭제할까요?
                    <button type="button" onClick={deletePost} disabled={deleting} className="text-[#e91e3f] hover:text-[#c8172f] disabled:opacity-40 outline-none focus:outline-none">삭제</button>
                    <button type="button" onClick={() => setDelConfirm(false)} disabled={deleting} className="hover:text-[#131313] outline-none focus:outline-none">취소</button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setDelConfirm(true)}
                    className="shrink-0 inline-flex items-center h-8 px-3 rounded-full bg-black/[0.04] hover:bg-[#e91e3f]/10 text-[11px] font-bold text-[#5a5a5a] hover:text-[#e91e3f] transition-colors outline-none focus:outline-none"
                  >
                    삭제
                  </button>
                )
              )}
              <button type="button" onClick={copyLink} aria-label="링크 복사" title="링크 복사" className={`${iconBtn} -mr-2`}>
                <LinkIcon />
              </button>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-[#8a8a8a] tabular-nums">{fmtDate(p.publishAt || p.createdAt)}</span>
            {scheduled && (
              <span className="inline-flex items-center h-4 px-1.5 rounded-full text-[9px] font-black text-white" style={{ background: BLUE }}>예약</span>
            )}
            {p.hidden && (
              <span className="inline-flex items-center h-4 px-1.5 rounded-full bg-black/[0.08] text-[9px] font-black text-[#5a5a5a]">가림</span>
            )}
          </div>
          <h1 className="mt-3 text-2xl md:text-3xl font-black text-[#131313] tracking-tight leading-snug break-keep">{p.title}</h1>

          {/* 본문 */}
          <div className="mt-6 pt-6 border-t border-black/[0.08] sp-body text-[15px] text-[#3a3a3a] leading-[1.9] whitespace-pre-wrap break-keep select-text">
            <RenderFormattedText text={p.content || ""} onCopy={() => pushToast("복사됨")} />
          </div>
          {p.bannerUrl && (
            <div className="mt-6 rounded-2xl overflow-hidden border border-black/[0.08]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.bannerUrl} alt="" className="block w-full h-auto" />
            </div>
          )}

          {/* 확인 + 반응 — 한 줄. 서포터즈는 [확인 버튼 | 이모지], 관리자는 확인 현황 아래에 이모지 */}
          <div className="mt-8">
            {isAdmin && (
                <div className="border-y border-black/[0.08] py-4">
                  <div className="flex items-baseline justify-between gap-4">
                    <p className="text-[11px] font-bold text-[#8a8a8a]">확인 현황</p>
                    <p className="text-[15px] font-black tabular-nums leading-none" style={{ color: BLUE }}>
                      {ackStats ? stat?.count ?? 0 : "—"} <span className="text-[12px] font-bold text-[#a3a3a3]">/ {ackStats ? ackStats.total : "—"}</span>
                    </p>
                  </div>
                  {!ackStats ? (
                    <div className="mt-3 h-4 w-40 rounded bg-black/[0.05] animate-pulse"></div>
                  ) : ackUsers.length === 0 ? (
                    <p className="mt-2.5 text-[12px] text-[#a3a3a3]">아직 확인한 사람이 없습니다</p>
                  ) : (
                    <ul className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1.5">
                      {ackUsers.map((u) => (
                        <li key={u.userId} className="text-[12px] font-bold text-[#131313] whitespace-nowrap">
                          {u.userName}
                          {u.at && <span className="text-[#a3a3a3] tabular-nums"> {fmtDate(u.at)}</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
            )}
            <div className={`flex flex-wrap items-center gap-2 ${isAdmin ? "mt-4" : ""}`}>
              {!isAdmin && (
                <>
                  <button
                    type="button"
                    onClick={toggleAck}
                    aria-pressed={acked}
                    className={`inline-flex items-center gap-2 h-9 px-4 rounded-full text-[13px] font-black transition-all outline-none focus:outline-none active:scale-[0.98] ${
                      acked ? "bg-white text-[#131313] hover:bg-black/[0.03]" : "text-white hover:brightness-110"
                    }`}
                    style={acked ? { boxShadow: `inset 0 0 0 1.5px ${BLUE}` } : { background: BLUE }}
                  >
                    {acked ? (
                      <>
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-white" style={{ background: BLUE }}>
                          <CheckMark className="w-3 h-3" />
                        </span>
                        확인함
                        {ackAt && <span className="text-[12px] font-bold text-[#8a8a8a] tabular-nums">· {fmtDate(ackAt)}</span>}
                      </>
                    ) : (
                      "확인했습니다"
                    )}
                  </button>
                  <span aria-hidden className="w-px h-5 mx-1 bg-black/[0.1]"></span>
                </>
              )}
            {emojis.map((em) => {
              const v = rx?.reactions?.[em] || { count: 0, mine: false };
              return (
                <button
                  key={em}
                  type="button"
                  onClick={() => toggleReaction(em)}
                  aria-pressed={v.mine}
                  className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-[13px] font-black transition-all outline-none focus:outline-none active:scale-95 ${
                    v.mine ? "text-[#131313]" : "bg-black/[0.04] text-[#5a5a5a] hover:bg-black/[0.08]"
                  }`}
                  style={v.mine ? { background: "rgba(63,131,184,0.12)", boxShadow: `inset 0 0 0 1.5px ${BLUE}` } : undefined}
                >
                  <span aria-hidden className="text-[15px] leading-none">{em}</span>
                  {v.count > 0 && <span className="tabular-nums">{v.count}</span>}
                </button>
              );
            })}
            </div>
          </div>

          {/* 댓글 */}
          <div className="mt-8 pt-6 border-t border-black/[0.08]">
            <div className="flex items-baseline justify-between gap-4 mb-2">
              <h2 className="text-[14px] font-black text-[#131313]">댓글</h2>
              <span className="text-[11px] font-bold text-[#a3a3a3] tabular-nums">{commentCount.toLocaleString()}개</span>
            </div>
            {!comments ? (
              <div className="space-y-3 py-3">
                <div className="h-10 rounded-lg bg-black/[0.04] animate-pulse"></div>
                <div className="h-10 rounded-lg bg-black/[0.03] animate-pulse"></div>
              </div>
            ) : comments.length === 0 ? (
              <p className="py-4 text-[12px] text-[#a3a3a3]">아직 댓글이 없습니다</p>
            ) : (
              <ul className="divide-y divide-black/[0.06]">
                {comments.map((c) => {
                  const canDel = (c.mine || isAdmin) && !c.pending;
                  const confirming = cDelId === c._id;
                  return (
                    <li key={c._id} className={`py-3.5 flex items-start gap-3 ${c.pending ? "opacity-60" : ""}`}>
                      <span className="shrink-0 w-8 h-8 rounded-full overflow-hidden bg-black/[0.06] flex items-center justify-center">
                        {c.userImage ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={c.userImage} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-[12px] font-black text-[#8a8a8a]">{String(c.userName || "?").slice(0, 1)}</span>
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="min-w-0 text-[12px] font-black text-[#131313] truncate">{c.userName}</span>
                          <span className="shrink-0 text-[10px] font-bold text-[#a3a3a3] tabular-nums whitespace-nowrap">
                            {c.pending ? "보내는 중…" : fmtAgo(c.createdAt)}
                          </span>
                          {canDel && (
                            <span className="ml-auto shrink-0 flex items-center gap-2 text-[11px] font-bold">
                              {confirming ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => deleteComment(c._id)}
                                    className="text-[#e91e3f] hover:underline underline-offset-4 outline-none focus:outline-none"
                                  >
                                    삭제
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => { setCDelId(null); tone(); }}
                                    className="text-[#8a8a8a] hover:text-[#131313] transition-colors outline-none focus:outline-none"
                                  >
                                    취소
                                  </button>
                                </>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => { setCDelId(c._id); tone(); }}
                                  aria-label="댓글 삭제"
                                  className="inline-flex items-center justify-center w-6 h-6 -mr-1.5 rounded-full text-[#c4c4c4] hover:text-[#e91e3f] hover:bg-black/[0.04] transition-colors outline-none focus:outline-none"
                                >
                                  <CloseIcon className="w-3 h-3" />
                                </button>
                              )}
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-[13px] text-[#3a3a3a] leading-[1.75] whitespace-pre-wrap break-words">{c.content}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="mt-4">
              <textarea
                value={cText}
                onChange={(e) => setCText(e.target.value.slice(0, COMMENT_MAX))}
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                    e.preventDefault();
                    submitComment();
                  }
                }}
                rows={3}
                maxLength={COMMENT_MAX}
                placeholder="댓글을 남겨 주세요"
                className={`${fieldClass} px-4 py-3 leading-relaxed resize-none`}
              />
              <div className="flex items-center justify-between gap-4 mt-2.5">
                <span className={`text-[11px] font-bold tabular-nums ${cText.length >= COMMENT_MAX ? "text-[#e91e3f]" : "text-[#a3a3a3]"}`}>
                  {cText.length.toLocaleString()} / {COMMENT_MAX.toLocaleString()}
                </span>
                <button
                  type="button"
                  onClick={submitComment}
                  disabled={!canSendComment}
                  className="h-9 px-4 rounded-full bg-[#131313] enabled:hover:bg-[#2a2a2a] text-white text-[12px] font-bold transition-colors outline-none focus:outline-none disabled:opacity-35 disabled:cursor-default"
                >
                  {cSending ? "보내는 중…" : "보내기"}
                </button>
              </div>
            </div>
          </div>

          {/* 꼬리 — 이전·다음. 목록을 아직 못 받았으면 둘 다 잠긴다 */}
          <div className="mt-8 pt-4 border-t border-black/[0.08] flex items-center justify-between gap-4">
            <button type="button" onClick={() => olderPost && goPost(olderPost._id)} disabled={!olderPost} className={navBtn}>
              <ArrowRight className="w-4 h-4 rotate-180" />
              이전 공지
            </button>
            <button type="button" onClick={() => newerPost && goPost(newerPost._id)} disabled={!newerPost} className={navBtn}>
              다음 공지
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </article>
      </Reveal>
    );
  }

  return (
    <main className="w-full flex-1 flex flex-col relative bg-[#f4f3f2] text-[#131313]">
      {/* 본문 렌더러는 다크 페이지 기준 색을 내보낸다 — 라이트 면에서 표·이미지 선이 보이도록 덮는다 */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
        .sp-body table, .sp-body th, .sp-body td { border-color: rgba(0,0,0,0.12); }
        .sp-body th { background: rgba(0,0,0,0.03); }
        .sp-body img { border-color: rgba(0,0,0,0.08); }
      `,
        }}
      />
      <div className="w-full max-w-5xl mx-auto px-5 md:px-8 pt-12 md:pt-16 pb-20 flex-1">{body}</div>
      <ToastStack toasts={toasts} />
    </main>
  );
}
