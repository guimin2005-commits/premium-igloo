"use client";

import React, { useState, useEffect } from "react";
import { useSession, signIn } from "next-auth/react";
import { Reveal, LuxStyles } from "../../components/Lux";

const ADMIN_USERS = ["elahw.06"];

export default function AdminBotPage() {
  const { data: session, status } = useSession();
  const isAdmin = status === "authenticated" && session?.user?.name && ADMIN_USERS.includes(session.user.name);

  const [configs, setConfigs] = useState<any[]>([]);
  const [guildRoles, setGuildRoles] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [popup, setPopup] = useState({ isOpen: false, message: "", isError: false });

  // 폼 상태
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [rewardLevel, setRewardLevel] = useState("");
  const [buffXp, setBuffXp] = useState("");
  const [attendBuffXp, setAttendBuffXp] = useState("");
  const [isRoleDropdownOpen, setIsRoleDropdownOpen] = useState(false);

  const fetchAll = () => {
    Promise.all([
      fetch("/api/role-config", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ data: [] })),
      fetch("/api/discord-roles", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ data: [] })),
    ]).then(([cfg, roles]) => {
      setConfigs(Array.isArray(cfg?.data) ? cfg.data : []);
      setGuildRoles(Array.isArray(roles?.data) ? roles.data : []);
    }).finally(() => setIsLoading(false));
  };

  useEffect(() => { fetchAll(); }, []);

  const selectedRole = guildRoles.find((r) => r.id === selectedRoleId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRoleId) {
      setPopup({ isOpen: true, message: "역할을 선택해주세요.", isError: true });
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/role-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roleId: selectedRoleId,
          roleName: selectedRole?.name || "",
          rewardLevel: rewardLevel === "" ? null : Number(rewardLevel),
          buffXp: Number(buffXp) || 0,
          attendBuffXp: Number(attendBuffXp) || 0,
        }),
      });
      if (res.ok) {
        setSelectedRoleId(""); setRewardLevel(""); setBuffXp(""); setAttendBuffXp("");
        fetchAll();
        setPopup({ isOpen: true, message: "저장되었습니다. 봇에는 1분 이내 자동 반영됩니다.", isError: false });
      } else {
        setPopup({ isOpen: true, message: "저장에 실패했습니다.", isError: true });
      }
    } catch {
      setPopup({ isOpen: true, message: "서버 통신 오류가 발생했습니다.", isError: true });
    } finally {
      setIsSubmitting(false);
    }
  };

  const startEdit = (c: any) => {
    setSelectedRoleId(c.roleId);
    setRewardLevel(c.rewardLevel == null ? "" : String(c.rewardLevel));
    setBuffXp(c.buffXp ? String(c.buffXp) : "");
    setAttendBuffXp(c.attendBuffXp ? String(c.attendBuffXp) : "");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const executeDelete = async () => {
    if (!deleteConfirmId) return;
    try {
      const res = await fetch(`/api/role-config?id=${deleteConfirmId}`, { method: "DELETE" });
      if (res.ok) setConfigs((prev) => prev.filter((c) => c._id !== deleteConfirmId));
    } catch {}
    setDeleteConfirmId(null);
  };

  if (status === "loading") return <div className="min-h-[60vh] flex items-center justify-center text-gray-500">로딩 중...</div>;
  if (!isAdmin) {
    return (
      <main className="w-full max-w-sm mx-auto px-6 py-40 text-center flex-1 flex flex-col justify-center">
        <h2 className="text-xl font-black text-white mb-2">권한 없음</h2>
        <p className="text-gray-400 text-sm mb-4">관리자 권한이 필요합니다.</p>
        <button onClick={() => signIn("discord")} className="w-full py-3.5 bg-[#5865F2] text-white font-bold rounded-xl mt-4">디스코드 로그인</button>
      </main>
    );
  }

  const inputClass = "w-full bg-[#121212] border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-[#e91e3f] transition-colors placeholder:text-gray-600";

  return (
    <main className="w-full flex-1 flex flex-col relative">
      <LuxStyles />

      {/* ── HERO ── */}
      <section className="relative w-full pt-16 pb-10 md:pt-24 md:pb-14 px-6">
        <div className="absolute inset-0 lux-grid-bg pointer-events-none"></div>
        <div className="absolute top-[-120px] left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-[#e91e3f]/[0.07] blur-[120px] rounded-full pointer-events-none"></div>
        <div className="max-w-4xl mx-auto relative z-10">
          <Reveal>
            <div className="flex items-center gap-3 mb-5">
              <span className="w-8 h-px bg-[#e91e3f]"></span>
              <span className="text-[10px] font-black tracking-[0.4em] text-gray-500 uppercase">Admin · Level Bot</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-black tracking-tighter leading-none mb-4">
              <span className="text-white">레벨 봇 </span><span className="lux-shimmer">설정</span>
            </h1>
            <p className="text-gray-400 text-sm md:text-base leading-relaxed">레벨 도달 시 자동 지급할 역할과, 역할별 Boost 효과를 관리합니다. 저장하면 봇에 1분 이내 자동 반영됩니다.</p>
          </Reveal>
        </div>
      </section>

      <div className="w-full max-w-4xl mx-auto px-6 pb-16 flex-1 flex flex-col space-y-12">

        {/* 설정 폼 */}
        <Reveal>
        <form onSubmit={handleSubmit} className="relative rounded-2xl bg-gradient-to-b from-white/[0.08] to-white/[0.02] p-px">
          <div className="rounded-2xl bg-[#111111]/95 p-6 md:p-8">
            <h3 className="text-base font-black text-white mb-6 flex items-center gap-3"><span className="w-1 h-5 bg-[#e91e3f] rounded-full"></span>역할 설정 추가 / 수정</h3>

            {/* 역할 선택 드롭다운 */}
            <div className="mb-4 relative">
              <label className="block text-xs font-bold text-gray-500 mb-2">디스코드 역할 <span className="text-[#e91e3f]">*</span></label>
              <button type="button" onClick={() => setIsRoleDropdownOpen(!isRoleDropdownOpen)} className={`${inputClass} flex items-center justify-between text-left`}>
                {selectedRole ? (
                  <span className="flex items-center gap-2.5">
                    <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: selectedRole.color }}></span>
                    <span className="font-bold">{selectedRole.name}</span>
                  </span>
                ) : (
                  <span className="text-gray-600">역할을 선택하세요</span>
                )}
                <span className="text-[10px] text-gray-500">▼</span>
              </button>
              {isRoleDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setIsRoleDropdownOpen(false)}></div>
                  <div className="absolute top-full left-0 w-full mt-1.5 bg-[#161616] border border-white/10 rounded-xl overflow-hidden shadow-2xl z-50 max-h-64 overflow-y-auto [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-[#2a2a2a]">
                    {guildRoles.map((r) => (
                      <button key={r.id} type="button" onClick={() => { setSelectedRoleId(r.id); setIsRoleDropdownOpen(false); }} className={`w-full text-left px-4 py-3 text-sm flex items-center gap-2.5 transition-colors ${selectedRoleId === r.id ? "bg-[#e91e3f]/15 text-[#e91e3f] font-bold" : "text-gray-300 hover:bg-white/5"}`}>
                        <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: r.color }}></span>
                        {r.name}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-2">지급 레벨 (선택)</label>
                <input type="number" min={1} max={1000} placeholder="예: 100 (도달 시 지급)" value={rewardLevel} onChange={(e) => setRewardLevel(e.target.value)} className={inputClass} />
                <p className="text-[10px] text-gray-600 mt-1.5">비우면 자동 지급 없이 Boost 효과만 적용</p>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-2">채팅/음성 Boost XP</label>
                <input type="number" min={0} placeholder="예: 300 (1회 지급당)" value={buffXp} onChange={(e) => setBuffXp(e.target.value)} className={inputClass} />
                <p className="text-[10px] text-gray-600 mt-1.5">이 역할 보유자의 XP 지급마다 추가</p>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-2">출석 Boost XP</label>
                <input type="number" min={0} placeholder="예: 7000 (출석 1회당)" value={attendBuffXp} onChange={(e) => setAttendBuffXp(e.target.value)} className={inputClass} />
                <p className="text-[10px] text-gray-600 mt-1.5">출석체크 시 추가 지급</p>
              </div>
            </div>

            <button type="submit" disabled={isSubmitting} className="w-full py-3.5 bg-[#e91e3f] hover:bg-[#d01634] disabled:opacity-50 text-white font-bold rounded-xl transition-all shadow-lg shadow-[#e91e3f]/20">
              {isSubmitting ? "저장 중..." : "저장 (봇에 1분 내 자동 반영)"}
            </button>
          </div>
        </form>
        </Reveal>

        {/* 설정 목록 */}
        <Reveal>
        <div>
          <div className="flex items-baseline gap-4 mb-2">
            <span className="text-xs font-black tracking-[0.3em] text-[#e91e3f]">LIST</span>
            <div className="h-px flex-1 bg-gradient-to-r from-white/15 to-transparent"></div>
          </div>
          <h3 className="text-lg font-black text-white tracking-tight mb-4">설정된 역할 ({configs.length})</h3>

          {isLoading ? (
            <div className="text-center py-10 text-gray-500 text-sm">불러오는 중...</div>
          ) : configs.length === 0 ? (
            <div className="text-center py-10 text-gray-600 text-sm bg-white/[0.02] rounded-2xl border border-white/5">설정된 역할이 없습니다. 위에서 추가해주세요.</div>
          ) : (
            <div className="divide-y divide-white/[0.06]">
              {configs.map((c) => {
                const role = guildRoles.find((r) => r.id === c.roleId);
                return (
                  <div key={c._id} className="py-4 flex flex-col md:flex-row md:items-center gap-3 md:gap-4 group">
                    <div className="flex items-center gap-2.5 md:w-48 shrink-0 min-w-0">
                      <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: role?.color || "#99aab5" }}></span>
                      <span className="text-sm font-bold text-white truncate">{c.roleName || role?.name || c.roleId}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 flex-1">
                      {c.rewardLevel != null && (
                        <span className="text-[10px] font-bold bg-[#e91e3f]/10 text-[#e91e3f] border border-[#e91e3f]/20 px-2.5 py-1 rounded-full">Lv.{c.rewardLevel} 도달 시 지급</span>
                      )}
                      {c.buffXp > 0 && (
                        <span className="text-[10px] font-bold bg-white/5 text-gray-300 border border-white/10 px-2.5 py-1 rounded-full">채팅/음성 +{c.buffXp.toLocaleString()} XP</span>
                      )}
                      {c.attendBuffXp > 0 && (
                        <span className="text-[10px] font-bold bg-white/5 text-gray-300 border border-white/10 px-2.5 py-1 rounded-full">출석 +{c.attendBuffXp.toLocaleString()} XP</span>
                      )}
                      {c.rewardLevel == null && !c.buffXp && !c.attendBuffXp && (
                        <span className="text-[10px] text-gray-600">효과 없음</span>
                      )}
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button onClick={() => startEdit(c)} className="text-xs font-bold text-gray-500 hover:text-white bg-white/5 px-3 py-1.5 rounded-lg transition-colors">수정</button>
                      <button onClick={() => setDeleteConfirmId(c._id)} className="text-xs font-bold text-red-500/60 hover:text-red-500 bg-white/5 px-3 py-1.5 rounded-lg transition-colors">삭제</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        </Reveal>

        <Reveal>
        <div className="rounded-2xl border border-white/5 bg-white/[0.02] px-6 py-5 text-xs text-gray-500 leading-relaxed">
          💡 <strong className="text-gray-300">작동 방식:</strong> 봇이 1분마다 이 설정을 다시 읽습니다. 유저가 설정된 레벨에 도달하면 역할을 자동 지급하고, Boost XP는 역할 보유자에게 즉시 합산됩니다.<br/>
          ⚠️ 역할 자동 지급이 작동하려면 봇에게 <strong className="text-gray-300">역할 관리 권한</strong>이 있고, 봇의 역할이 지급 대상 역할보다 <strong className="text-gray-300">위에</strong> 있어야 합니다.
        </div>
        </Reveal>
      </div>

      {deleteConfirmId && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 p-4">
          <div className="bg-[#121212] border border-red-500/30 rounded-3xl w-full max-w-sm p-8 text-center">
            <h2 className="text-xl font-bold text-white mb-3">삭제 확인</h2>
            <p className="text-sm text-gray-400 mb-8">해당 역할 설정을 삭제하시겠습니까?<br/>이미 지급된 역할은 회수되지 않습니다.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirmId(null)} className="flex-1 py-3 bg-[#2a2a2a] text-white rounded-xl">취소</button>
              <button onClick={executeDelete} className="flex-1 py-3 bg-red-500/80 text-white rounded-xl">삭제</button>
            </div>
          </div>
        </div>
      )}

      {popup.isOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-[#121212] border border-white/10 rounded-3xl w-full max-w-sm p-8 text-center shadow-2xl">
            <h2 className="text-xl font-bold text-white mb-3">{popup.isError ? "오류" : "완료"}</h2>
            <p className="text-sm text-gray-400 mb-8">{popup.message}</p>
            <button onClick={() => setPopup({ ...popup, isOpen: false })} className="w-full py-3 bg-[#2a2a2a] hover:bg-[#333] text-white font-bold rounded-xl transition-colors">확인</button>
          </div>
        </div>
      )}
    </main>
  );
}
