"use client";

import React, { useState, useEffect, ChangeEvent, FormEvent } from "react";
import BackLink from "../../components/BackLink";
import { useParams, useRouter } from "next/navigation";
import { useSession, signIn } from "next-auth/react";
import { Reveal } from "../../components/Lux";
import { RenderFormattedText } from "../../components/FormattedText";
import { ADMIN_USERS } from "@/lib/admins";

/* 📌 구인 한 건 = 한 페이지 (이동 규칙 1). 화이트 & 블랙.
   지원도 모달이 아니라 이 페이지 안 '지원서' 시트에서 받는다. */

const WD = ["일", "월", "화", "수", "목", "금", "토"];
const pad = (n: number) => String(n).padStart(2, "0");
const fmt = (v: string) => {
  const d = new Date(v);
  if (isNaN(d.getTime())) return "";
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}(${WD[d.getDay()]})`;
};

const getRecruitStatus = (post: any) => {
  if (!post?.recruitPeriod) return "ongoing";
  const parts = String(post.recruitPeriod).split("~");
  if (parts.length === 2) {
    const endDateStr = parts[1].trim();
    if (endDateStr === "상시") return "ongoing";
    const now = new Date();
    const kstDate = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const todayStr = kstDate.toISOString().split("T")[0].replace(/-/g, ".");
    if (endDateStr < todayStr) return "ended";
  }
  return "ongoing";
};

const FIELD = "w-full h-11 bg-transparent border-b border-[#131313] text-[15px] font-bold text-[#131313] outline-none focus:border-[#e91e3f] transition-colors placeholder:font-medium placeholder:text-[#a3a3a3]";
const FIELD_LOCK = "w-full h-11 bg-transparent border-b border-[#ededed] text-[15px] font-bold text-[#5a5a5a] outline-none cursor-not-allowed";
const AREA = "w-full bg-transparent border-b border-[#131313] py-3 text-[14.5px] leading-[1.7] text-[#131313] outline-none focus:border-[#e91e3f] transition-colors resize-none placeholder:text-[#a3a3a3]";
const LABEL = "block text-[11px] font-black text-[#8a8a8a] mb-1";

export default function RecruitDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: session, status } = useSession() as any;
  const isLoggedIn = status === "authenticated";
  const isAdmin = !!session?.user?.name && ADMIN_USERS.includes(session.user.name);

  const [post, setPost] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [formData, setFormData] = useState({ discordTag: "", age: "", intro: "", experience: "" });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (session?.user?.name) setFormData((prev) => ({ ...prev, discordTag: String(session.user.name) }));
  }, [session]);

  useEffect(() => {
    fetch(`/api/posts/${id}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { if (d?.success) setPost(d.data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name as keyof typeof formData]: value }));
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setConfirmOpen(true);
  };

  const executeSubmit = async () => {
    setConfirmOpen(false);
    try {
      const res = await fetch("/api/recruit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...formData, position: post?.title || "" }),
      });
      const result = await res.json();
      if (result?.success) {
        setSubmitted(true);
        setFormData({ discordTag: session?.user?.name || "", age: "", intro: "", experience: "" });
        setToast("지원서를 접수했습니다");
        setTimeout(() => setToast(""), 1800);
      } else {
        setErrorMsg("지원서를 접수하지 못했습니다. 잠시 후 다시 시도해 주세요.");
      }
    } catch {
      setErrorMsg("지원서를 접수하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    }
  };

  if (loading) return <div className="min-h-[60vh] flex items-center justify-center text-[#8a8a8a] text-sm">불러오는 중...</div>;

  if (!post) {
    return (
      <main className="w-full max-w-lg mx-auto px-6 py-40 text-center text-[#131313]">
        <h2 className="text-xl font-black mb-2">글을 찾을 수 없습니다</h2>
        <p className="text-[#8a8a8a] text-sm mb-6">삭제되었거나 잘못된 주소입니다.</p>
        <button onClick={() => router.push("/recruit")} className="rounded-full bg-[#f2f2f2] hover:bg-[#e0e0e0] text-[#5a5a5a] text-xs font-bold px-5 py-3 transition-colors">구인으로</button>
      </main>
    );
  }

  const isEnded = getRecruitStatus(post) === "ended";
  const role = (post.recruitRole || "").toUpperCase();
  const period = post.recruitPeriod || "미지정";

  const sections = [
    { label: "지원 자격", body: post.recruitQual },
    { label: "주요 업무", body: post.recruitTasks },
    { label: "우대 사항", body: post.recruitExtra },
  ].filter((s) => s.body && String(s.body).trim() !== "");

  return (
    <main className="flex-1 w-full flex flex-col text-[#131313]">
      <article className="w-full px-5 md:px-8 pt-10 pb-24 md:pb-16">
        <div className="max-w-[820px] mx-auto">
          <Reveal>
            <div className="flex items-center gap-3 mb-6">
              <BackLink href="/recruit" label="구인" inline />
              <span className="h-px flex-1 bg-[#ededed]" />
              {isAdmin && (
                <button onClick={() => router.push(`/write?id=${post._id}`)}
                  className="text-[11px] font-bold text-[#8a8a8a] hover:text-[#131313] transition-colors">수정</button>
              )}
            </div>

            <div className="flex items-center gap-3 md:gap-4 mb-3 flex-wrap">
              {role && <span className="text-[12px] font-bold tracking-[0.04em] text-[#131313]">{role}</span>}
              <span className="text-[12px] font-bold text-[#8a8a8a] tabular-nums">{period}</span>
              <span className={`text-[11px] font-black ${isEnded ? "text-[#8a8a8a]" : "text-[#e91e3f]"}`}>{isEnded ? "마감" : "모집 중"}</span>
            </div>

            <h1 className="text-[24px] md:text-[32px] font-black tracking-tight leading-snug break-keep">{post.title}</h1>

            <div className="flex items-center gap-3 mt-5 pb-5 border-b border-[#ededed]">
              {post.author && <span className="text-[11px] font-bold text-[#a3a3a3]">{post.author}</span>}
              <span className="text-[11px] font-bold text-[#8a8a8a] tabular-nums">{fmt(post.publishAt || post.createdAt)}</span>
            </div>

            {/* 본문 */}
            <div className="py-7 space-y-7">
              {sections.map((s) => (
                <section key={s.label}>
                  <h2 className="text-[11px] font-black text-[#8a8a8a] pb-2.5 mb-3.5 border-b border-[#ededed]">{s.label}</h2>
                  <div className="text-[14px] md:text-[15px] leading-[1.9] text-[#5a5a5a] break-keep">
                    <RenderFormattedText text={String(s.body)} />
                  </div>
                </section>
              ))}
            </div>

            {/* 지원서 */}
            <div className="border-t border-[#131313] pt-7">
              {isEnded ? (
                <p className="text-[14px] font-bold text-[#8a8a8a]">마감된 모집입니다.</p>
              ) : submitted ? (
                <p className="text-[14px] font-bold text-[#131313]">지원이 접수되었습니다.</p>
              ) : !isLoggedIn ? (
                <div>
                  <h2 className="text-[20px] font-black tracking-tight mb-5">지원서</h2>
                  <button onClick={() => signIn("discord")}
                    className="h-11 px-6 rounded-full border-[1.5px] border-[#131313] text-[13px] font-extrabold text-[#131313] hover:bg-[#131313] hover:text-white transition-colors">Discord 로그인</button>
                </div>
              ) : (
                <form onSubmit={handleSubmit}>
                  <h2 className="text-[20px] font-black tracking-tight mb-6">지원서</h2>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-7">
                    <div>
                      <label className={LABEL}>디스코드 태그</label>
                      <input type="text" name="discordTag" required readOnly value={formData.discordTag} className={FIELD_LOCK} />
                    </div>
                    <div>
                      <label className={LABEL}>나이<span className="ml-1.5 font-bold text-[#a3a3a3]">만 19세 이상</span></label>
                      <input type="number" min="19" name="age" required value={formData.age} onChange={handleChange} placeholder="숫자만"
                        className={`${FIELD} [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`} />
                    </div>
                  </div>

                  <div className="mt-7">
                    <label className={LABEL}>포지션</label>
                    <div className={`${FIELD_LOCK} flex items-center truncate`}>{post.title}</div>
                  </div>

                  <div className="mt-7">
                    <label className={LABEL}>자기소개 및 지원 포부</label>
                    <textarea name="intro" required rows={5} value={formData.intro} onChange={handleChange} placeholder="자세히 적을수록 좋습니다." className={AREA} />
                  </div>

                  <div className="mt-7">
                    <label className={LABEL}>관련 경험<span className="ml-1.5 font-bold text-[#a3a3a3]">선택</span></label>
                    <textarea name="experience" rows={4} value={formData.experience} onChange={handleChange} placeholder="스태프 경험이 있다면 적어 주세요." className={AREA} />
                  </div>

                  {errorMsg && <p className="mt-6 text-[13px] font-bold text-[#e91e3f]">{errorMsg}</p>}

                  <div className="mt-8 flex flex-col md:flex-row md:items-center gap-3 md:gap-4">
                    <button type="submit"
                      className="w-full md:w-auto h-11 px-8 rounded-full bg-[#e91e3f] hover:bg-[#d01634] text-white text-[13px] font-extrabold transition-colors order-2 md:order-1">제출하기</button>
                    <span className="text-[12px] font-bold text-[#8a8a8a] order-1 md:order-2">제출 후 수정 불가</span>
                  </div>
                </form>
              )}
            </div>
          </Reveal>
        </div>
      </article>

      {confirmOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setConfirmOpen(false)}>
          <div className="bg-white rounded-3xl w-full max-w-sm p-7 text-center border border-[#ededed] shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-base font-black text-[#131313] mb-2">지원서를 제출할까요?</h2>
            <p className="text-[12px] text-[#8a8a8a] mb-6">제출 후에는 수정할 수 없습니다.</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmOpen(false)} className="flex-1 py-3 rounded-xl bg-[#f2f2f2] hover:bg-[#e0e0e0] text-[#5a5a5a] text-[13px] font-bold transition-colors">취소</button>
              <button onClick={executeSubmit} className="flex-1 py-3 rounded-xl bg-[#e91e3f] hover:bg-[#d01634] text-white text-[13px] font-bold transition-colors">제출</button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-24 md:bottom-8 right-4 md:right-6 z-[200] pointer-events-none">
          <div className="px-5 py-3 rounded-2xl bg-[#131313] text-white text-xs font-bold shadow-2xl">{toast}</div>
        </div>
      )}
    </main>
  );
}
