"use client";

import { useState, useEffect } from "react";
import { useSession, signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

const ADMIN_USERS = ["elahw.06"];

export default function CodeAdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const isAdmin = status === "authenticated" && session?.user?.name && ADMIN_USERS.includes(session.user.name);

  const [codes, setCodes] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [form, setForm] = useState({ code: "", reward: "", roleId: "", requiredRoleId: "", maxUses: "1", expiresAt: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [popup, setPopup] = useState({ isOpen: false, message: "", isError: false });
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ reward: "", roleId: "", requiredRoleId: "", maxUses: "1", expiresAt: "" });
  const [guildRoles, setGuildRoles] = useState<any[]>([]);

  useEffect(() => {
    fetch("/api/discord-roles", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setGuildRoles(Array.isArray(d?.data) ? d.data : []))
      .catch(() => {});
  }, []);

  const roleNameOf = (id: string) => guildRoles.find((r) => r.id === id)?.name || "";

  const fetchCodes = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/code", { cache: "no-store" });
      const json = await res.json();
      if (json.success) setCodes(json.data);
    } catch { /* noop */ } finally { setIsLoading(false); }
  };

  useEffect(() => { if (isAdmin) fetchCodes(); }, [isAdmin]);

  const randomCode = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let out = "";
    for (let i = 0; i < 10; i++) out += chars[Math.floor(Math.random() * chars.length)];
    setForm(prev => ({ ...prev, code: out }));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.code.trim() || !form.reward.trim() || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/code", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, requiredRoleName: roleNameOf(form.requiredRoleId), maxUses: Number(form.maxUses) }),
      });
      const json = await res.json();
      if (json.success) {
        setForm({ code: "", reward: "", roleId: "", requiredRoleId: "", maxUses: "1", expiresAt: "" });
        fetchCodes();
      } else {
        setPopup({ isOpen: true, message: json.error || "생성에 실패했습니다.", isError: true });
      }
    } catch {
      setPopup({ isOpen: true, message: "서버 통신 오류", isError: true });
    } finally { setIsSubmitting(false); }
  };

  const executeDelete = async () => {
    if (!deleteId) return;
    try {
      const res = await fetch(`/api/code?id=${deleteId}`, { method: "DELETE" });
      if (res.ok) fetchCodes();
    } catch { /* noop */ } finally { setDeleteId(null); }
  };

  const openEdit = (code: any) => {
    setEditId(code._id);
    setEditForm({
      reward: code.reward,
      roleId: code.roleId || "",
      requiredRoleId: code.requiredRoleId || "",
      maxUses: String(code.maxUses),
      expiresAt: code.expiresAt ? code.expiresAt.split('T')[0] : ""
    });
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editId || !editForm.reward.trim() || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editId, ...editForm, requiredRoleName: roleNameOf(editForm.requiredRoleId), maxUses: Number(editForm.maxUses) }),
      });
      const json = await res.json();
      if (json.success) {
        setEditId(null);
        fetchCodes();
        setPopup({ isOpen: true, message: "코드가 수정되었습니다.", isError: false });
      } else {
        setPopup({ isOpen: true, message: json.error || "수정에 실패했습니다.", isError: true });
      }
    } catch {
      setPopup({ isOpen: true, message: "서버 통신 오류", isError: true });
    } finally { setIsSubmitting(false); }
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

  const inputClass = "w-full px-4 py-3 bg-[#1a1a1a] border border-white/10 rounded-xl text-white text-sm outline-none focus:border-[#e91e3f] transition-colors";

  return (
    <main className="w-full max-w-4xl mx-auto px-6 py-16 flex-1 flex flex-col">
      <div className="mb-10 border-b border-white/10 pb-6 flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-black text-white mb-3 tracking-tight">코드 관리</h1>
          <p className="text-gray-400 text-sm">리워드 코드를 발급하고 사용 현황을 관리합니다.</p>
        </div>
        <button onClick={() => router.push("/")} className="px-5 py-2.5 bg-[#2a2a2a] hover:bg-[#333] text-white text-sm font-bold rounded-xl transition-colors">← 홈으로</button>
      </div>

      <form onSubmit={handleCreate} className="bg-[#121212] border border-white/5 rounded-2xl p-6 mb-12 flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <label className="text-xs font-bold text-gray-400">코드 <span className="text-[#e91e3f]">*</span></label>
          <div className="flex gap-2">
            <input value={form.code} onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="예: WELCOME2026" className={`${inputClass} uppercase flex-1`} />
            <button type="button" onClick={randomCode} className="shrink-0 px-3 bg-[#2a2a2a] hover:bg-[#333] text-white text-xs font-bold rounded-xl transition-colors">랜덤</button>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <label className="text-xs font-bold text-gray-400">보상 설명 <span className="text-[#e91e3f]">*</span></label>
          <textarea value={form.reward} onChange={e => setForm({ ...form, reward: e.target.value })} placeholder="예: 50,000 XP 지급 완료!" className={`${inputClass} resize-none`} rows={3} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold text-gray-400">지급 디스코드 역할 ID (선택)</label>
            <input value={form.roleId} onChange={e => setForm({ ...form, roleId: e.target.value })} placeholder="역할 ID (비우면 미지급)" className={inputClass} />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold text-gray-400">최대 사용 횟수</label>
            <input type="number" min="0" value={form.maxUses} onChange={e => setForm({ ...form, maxUses: e.target.value })} className={inputClass} />
            <span className="text-[10px] text-gray-600">0 입력 시 무제한</span>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold text-gray-400">만료일 (선택)</label>
            <input type="date" value={form.expiresAt} onChange={e => setForm({ ...form, expiresAt: e.target.value })} className={`${inputClass} [color-scheme:dark]`} />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold text-gray-400">사용 가능 역할 제한 (선택)</label>
            <select value={form.requiredRoleId} onChange={e => setForm({ ...form, requiredRoleId: e.target.value })} className={`${inputClass} [color-scheme:dark]`}>
              <option value="">제한 없음 — 모두 사용 가능</option>
              {guildRoles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            <span className="text-[10px] text-gray-600">선택 시 해당 역할 소지자만 코드 사용 가능</span>
          </div>
        </div>
        <button type="submit" disabled={isSubmitting} className="w-full py-3.5 bg-[#e91e3f] hover:bg-[#d01634] disabled:opacity-50 text-white font-bold rounded-xl transition-all shadow-lg shadow-[#e91e3f]/20">{isSubmitting ? "생성 중..." : "코드 발급하기"}</button>
      </form>

      <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-4">발급된 코드 ({codes.length})</h2>
      {isLoading ? <div className="text-center py-16 text-gray-500">불러오는 중...</div> : codes.length === 0 ? (
        <div className="text-center py-16 text-gray-600 bg-white/[0.02] rounded-2xl border border-white/5">발급된 코드가 없습니다.</div>
      ) : (
        <div className="flex flex-col gap-3">
          {codes.map(c => {
            const expired = c.expiresAt && new Date(c.expiresAt) < new Date();
            const exhausted = c.maxUses !== 0 && c.usedBy.length >= c.maxUses;
            return (
              <div key={c._id} className="bg-[#121212] border border-white/5 rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <span className="font-mono font-black text-white text-base tracking-wider">{c.code}</span>
                    {expired ? <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-gray-500/10 text-gray-400">만료</span>
                      : exhausted ? <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-gray-500/10 text-gray-400">소진</span>
                      : <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400">사용 가능</span>}
                    {c.roleId && <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-500/10 text-blue-400">역할 지급</span>}
                    {c.requiredRoleId && <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#e91e3f]/10 text-[#e91e3f]">{c.requiredRoleName || "특정 역할"} 전용</span>}
                  </div>
                  <p className="text-sm text-gray-400 truncate">{c.reward}</p>
                  <p className="text-xs text-gray-600 mt-1">사용 {c.usedBy.length} / {c.maxUses === 0 ? "무제한" : c.maxUses}{c.expiresAt ? ` · ~${new Date(c.expiresAt).toLocaleDateString()}` : ""}</p>
                </div>
                <div className="flex gap-2 shrink-0 self-start md:self-center">
                  <button onClick={() => openEdit(c)} className="text-xs font-bold text-blue-500/70 hover:text-blue-500 bg-white/5 hover:bg-blue-500/10 px-4 py-2 rounded-lg transition-colors">수정</button>
                  <button onClick={() => setDeleteId(c._id)} className="text-xs font-bold text-red-500/70 hover:text-red-500 bg-white/5 hover:bg-red-500/10 px-4 py-2 rounded-lg transition-colors">삭제</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editId && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-[#121212] border border-white/10 rounded-3xl w-full max-w-md p-8 shadow-2xl">
            <h2 className="text-xl font-bold text-white mb-6">코드 수정</h2>
            <form onSubmit={handleEdit} className="space-y-4">
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-gray-400">보상 설명 <span className="text-[#e91e3f]">*</span></label>
                <textarea value={editForm.reward} onChange={e => setEditForm({ ...editForm, reward: e.target.value })} placeholder="예: 50,000 XP 지급 완료!" className={`${inputClass} resize-none`} rows={3} />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-gray-400">지급 디스코드 역할 ID (선택)</label>
                <input value={editForm.roleId} onChange={e => setEditForm({ ...editForm, roleId: e.target.value })} placeholder="역할 ID (비우면 미지급)" className={inputClass} />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-gray-400">사용 가능 역할 제한 (선택)</label>
                <select value={editForm.requiredRoleId} onChange={e => setEditForm({ ...editForm, requiredRoleId: e.target.value })} className={`${inputClass} [color-scheme:dark]`}>
                  <option value="">제한 없음 — 모두 사용 가능</option>
                  {guildRoles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold text-gray-400">최대 사용 횟수</label>
                  <input type="number" min="0" value={editForm.maxUses} onChange={e => setEditForm({ ...editForm, maxUses: e.target.value })} className={inputClass} />
                  <span className="text-[10px] text-gray-600">0 입력 시 무제한</span>
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold text-gray-400">만료일 (선택)</label>
                  <input type="date" value={editForm.expiresAt} onChange={e => setEditForm({ ...editForm, expiresAt: e.target.value })} className={`${inputClass} [color-scheme:dark]`} />
                </div>
              </div>
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setEditId(null)} className="flex-1 py-3 bg-[#2a2a2a] hover:bg-[#333] text-white font-bold rounded-xl transition-colors">취소</button>
                <button type="submit" disabled={isSubmitting} className="flex-1 py-3 bg-[#e91e3f] hover:bg-[#d01634] disabled:opacity-50 text-white font-bold rounded-xl transition-colors shadow-lg shadow-[#e91e3f]/20">{isSubmitting ? "수정 중..." : "수정하기"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteId && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-[#1e1e1e] border border-white/10 rounded-3xl w-full max-w-sm p-8 text-center shadow-2xl">
            <h2 className="text-xl font-bold text-white mb-3">코드 삭제</h2>
            <p className="text-sm text-gray-400 mb-8 leading-relaxed">해당 코드를 삭제하시겠습니까?<br/>이 작업은 되돌릴 수 없습니다.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteId(null)} className="flex-1 py-3 bg-[#2a2a2a] hover:bg-[#333] text-white font-bold rounded-xl transition-colors">취소</button>
              <button onClick={executeDelete} className="flex-1 py-3 bg-[#e91e3f] hover:bg-[#d01634] text-white font-bold rounded-xl transition-colors shadow-lg shadow-[#e91e3f]/20">삭제</button>
            </div>
          </div>
        </div>
      )}

      {popup.isOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-[#121212] border border-white/10 rounded-3xl w-full max-w-sm p-8 text-center shadow-2xl">
            <h2 className="text-xl font-bold text-white mb-3">{popup.isError ? "오류" : "완료"}</h2>
            <p className="text-sm text-gray-400 mb-8 leading-relaxed">{popup.message}</p>
            <button onClick={() => setPopup({ ...popup, isOpen: false })} className="w-full py-3 bg-[#2a2a2a] hover:bg-[#333] text-white font-bold rounded-xl transition-colors">확인</button>
          </div>
        </div>
      )}
    </main>
  );
}
