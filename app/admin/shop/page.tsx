"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useSession, signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Reveal, LuxStyles } from "../../components/Lux";

const ADMIN_USERS = ["elahw.06"];

const TAB_META: Record<string, { title: string; desc: string }> = {
  items: { title: "상품 관리", desc: "IGLOO SHOP에 노출할 상품을 등록·수정합니다. 역할 상품은 구매 시 봇이 자동 지급합니다." },
  orders: { title: "구매 내역", desc: "구매 건을 확인하고 실물 상품 발송·취소를 처리합니다." },
};

const STATUS_LABEL: Record<string, string> = { pending: "처리 대기", completed: "완료", cancelled: "취소" };

const fmtDateTime = (v: string | Date) => {
  const d = new Date(v);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

export default function AdminShopPage() {
  const { data: session, status } = useSession();
  const isAdmin = status === "authenticated" && session?.user?.name && ADMIN_USERS.includes(session.user.name);

  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab") || "items";
  const tab = TAB_META[tabParam] ? tabParam : "items";

  const [items, setItems] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [guildRoles, setGuildRoles] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [popup, setPopup] = useState({ isOpen: false, message: "", isError: false });
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [orderFilter, setOrderFilter] = useState("");
  const [noteTarget, setNoteTarget] = useState<any>(null);
  const [noteText, setNoteText] = useState("");
  const [showPreview, setShowPreview] = useState(false);

  const emptyForm = { id: "", name: "", description: "", imageUrl: "", type: "role", roleId: "", price: "", stock: "", sortOrder: "", active: true };
  const [form, setForm] = useState(emptyForm);
  const [isRoleOpen, setIsRoleOpen] = useState(false);
  const selectedRole = guildRoles.find((r) => r.id === form.roleId);

  const notify = (message: string, isError = false) => setPopup({ isOpen: true, message, isError });

  const fetchAll = useCallback(() => {
    Promise.all([
      fetch("/api/shop/items?all=1", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ data: [] })),
      fetch("/api/discord-roles", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ data: [] })),
      fetch("/api/shop/orders", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ data: [] })),
    ]).then(([it, roles, ord]) => {
      setItems(Array.isArray(it?.data) ? it.data : []);
      setGuildRoles(Array.isArray(roles?.data) ? roles.data : []);
      setOrders(Array.isArray(ord?.data) ? ord.data : []);
    }).finally(() => setIsLoading(false));
  }, []);

  useEffect(() => { if (isAdmin) fetchAll(); }, [isAdmin, fetchAll]);

  // 📌 상점 카드의 '수정' 링크(?edit=<id>)로 들어오면 해당 상품을 폼에 채워 둔다
  const editId = searchParams.get("edit");
  useEffect(() => {
    if (!editId || items.length === 0) return;
    const it = items.find((x) => x._id === editId);
    if (!it) return;
    setForm({
      id: it._id, name: it.name, description: it.description || "", imageUrl: it.imageUrl || "",
      type: it.type, roleId: it.roleId || "", price: String(it.price),
      stock: it.stock < 0 ? "" : String(it.stock), sortOrder: String(it.sortOrder || 0), active: it.active,
    });
  }, [editId, items]);

  const saveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch("/api/shop/items", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, roleName: selectedRole?.name || "" }),
    }).catch(() => null);
    const d = await res?.json().catch(() => null);
    if (res?.ok && d?.success) { setForm(emptyForm); fetchAll(); notify("저장되었습니다."); }
    else notify(d?.message || "저장에 실패했습니다.", true);
  };

  const executeDelete = async () => {
    if (!deleteId) return;
    const res = await fetch(`/api/shop/items?id=${deleteId}`, { method: "DELETE" }).catch(() => null);
    if (res?.ok) fetchAll();
    setDeleteId(null);
  };

  const processOrder = async (id: string, newStatus: "completed" | "cancelled", note = "") => {
    const res = await fetch("/api/shop/orders", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: newStatus, adminNote: note }),
    }).catch(() => null);
    const d = await res?.json().catch(() => null);
    if (res?.ok && d?.success) { fetchAll(); notify(newStatus === "completed" ? "발송 처리했습니다." : "취소하고 XP를 환불했습니다."); }
    else notify(d?.message || "처리에 실패했습니다.", true);
    setNoteTarget(null); setNoteText("");
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

  const inputClass = "w-full bg-transparent border border-white/10 rounded-lg px-4 py-3 text-sm text-white outline-none focus:border-[#e91e3f] transition-colors placeholder:text-gray-500";
  const labelClass = "block text-xs font-bold text-gray-400 mb-2";
  const fieldNote = "text-[10px] text-gray-400 mt-1.5";
  const primaryBtn = "w-full md:w-auto md:px-10 py-3.5 bg-[#e91e3f] hover:bg-[#d01634] disabled:opacity-50 text-white text-sm font-bold rounded-lg transition-all";

  const SectionHead = ({ no, title, right }: { no: string; title: string; right?: React.ReactNode }) => (
    <div className="mb-6">
      <div className="flex items-baseline gap-4 mb-2">
        <span className="text-xs font-black tracking-[0.3em] text-[#e91e3f]">{no}</span>
        <div className="h-px flex-1 bg-gradient-to-r from-white/15 to-transparent"></div>
      </div>
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg md:text-xl font-black text-white tracking-tight">{title}</h2>
        {right}
      </div>
    </div>
  );

  const meta = TAB_META[tab];
  const shownOrders = orderFilter ? orders.filter((o) => o.status === orderFilter) : orders;
  const pendingCount = orders.filter((o) => o.status === "pending").length;

  return (
    <main className="w-full flex-1 flex flex-col relative">
      <LuxStyles />

      <section className="relative w-full pt-16 pb-10 md:pt-20 md:pb-12 px-6">
        <div className="absolute inset-0 lux-grid-bg pointer-events-none"></div>
        <div className="max-w-4xl mx-auto relative z-10">
          <Reveal>
            <div className="flex items-center gap-3 mb-5">
              <span className="w-8 h-px bg-[#e91e3f]"></span>
              <span className="text-[10px] font-black tracking-[0.4em] text-gray-400 uppercase">Admin · XP Shop</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-black tracking-tighter leading-none mb-4">
              <span className="text-white">{meta.title.split(" ")[0]} </span>
              <span className="text-[#e91e3f]">{meta.title.split(" ").slice(1).join(" ")}</span>
            </h1>
            <p className="text-gray-400 text-sm md:text-base leading-relaxed">{meta.desc}</p>
          </Reveal>
        </div>
      </section>

      <div className="w-full max-w-4xl mx-auto px-6 pb-16 flex-1 flex flex-col space-y-14">

        {/* ═══ 상품 관리 ═══ */}
        {tab === "items" && (
          <>
            <Reveal>
            <section>
              <SectionHead no="01" title={form.id ? "상품 수정" : "상품 등록"} right={
                <button type="button" onClick={() => setShowPreview(true)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-full text-[11px] font-bold text-gray-200 border border-white/20 hover:border-white/40 hover:text-white transition-colors">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  카드 미리보기
                </button>
              } />
              <form onSubmit={saveItem}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className={labelClass}>상품명 <span className="text-[#e91e3f]">*</span></label>
                    <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="예: [XP] Boost+" className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>상품 유형 <span className="text-[#e91e3f]">*</span></label>
                    <div className="flex gap-2">
                      {[{ v: "role", l: "역할 · 자동 지급" }, { v: "physical", l: "기프트카드" }].map((o) => (
                        <button key={o.v} type="button" onClick={() => setForm({ ...form, type: o.v })}
                          className={`flex-1 py-3 rounded-lg text-xs font-bold border transition-colors ${form.type === o.v ? "bg-[#e91e3f]/15 text-[#e91e3f] border-[#e91e3f]/40" : "text-gray-300 border-white/10 hover:text-white"}`}>
                          {o.l}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mb-4">
                  <label className={labelClass}>상품 설명</label>
                  <textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="상점 카드에 표시될 설명" className={`${inputClass} resize-none`} />
                </div>

                <div className="mb-4">
                  <label className={labelClass}>상품 이미지 URL</label>
                  <input type="text" value={form.imageUrl} onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
                    placeholder="https://... (비우면 기본 아이콘 표시)" className={inputClass} />
                  <p className={fieldNote}>디스코드에 이미지를 올린 뒤 &lsquo;링크 복사&rsquo;한 주소를 붙여넣어도 됩니다</p>
                </div>

                {/* 역할 상품일 때만 역할 선택 — 드롭다운이 아래 요소를 덮도록 열릴 때 z를 올린다 */}
                {form.type === "role" && (
                  <div className={`mb-4 relative ${isRoleOpen ? "z-50" : ""}`}>
                    <label className={labelClass}>지급할 역할 <span className="text-[#e91e3f]">*</span></label>
                    <button type="button" onClick={() => setIsRoleOpen(!isRoleOpen)} className={`${inputClass} flex items-center justify-between text-left`}>
                      {selectedRole ? (
                        <span className="flex items-center gap-2.5">
                          <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: selectedRole.color }}></span>
                          <span className="font-bold">{selectedRole.name}</span>
                        </span>
                      ) : <span className="text-gray-500">역할을 선택하세요</span>}
                      <span className="text-[10px] text-gray-400">▼</span>
                    </button>
                    {isRoleOpen && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setIsRoleOpen(false)}></div>
                        <div className="absolute top-full left-0 w-full mt-1.5 bg-[#161616] border border-white/10 rounded-xl overflow-hidden shadow-2xl z-50 max-h-64 overflow-y-auto [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-[#2a2a2a]">
                          {guildRoles.map((r) => (
                            <button key={r.id} type="button" onClick={() => { setForm({ ...form, roleId: r.id }); setIsRoleOpen(false); }}
                              className={`w-full text-left px-4 py-3 text-sm flex items-center gap-2.5 transition-colors ${form.roleId === r.id ? "bg-[#e91e3f]/15 text-[#e91e3f] font-bold" : "text-gray-300 hover:bg-white/5"}`}>
                              <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: r.color }}></span>
                              {r.name}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                  <div>
                    <label className={labelClass}>가격 (XP) <span className="text-[#e91e3f]">*</span></label>
                    <input type="number" min={1} value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="예: 500000" className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>재고</label>
                    <input type="number" min={-1} value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} placeholder="비우면 무제한" className={inputClass} />
                    <p className={fieldNote}>숫자를 넣으면 한정 수량</p>
                  </div>
                  <div>
                    <label className={labelClass}>추천 순서</label>
                    <input type="number" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} placeholder="0" className={inputClass} />
                    <p className={fieldNote}>작을수록 상점 앞쪽 (추천순 기준)</p>
                  </div>
                </div>

                <div className="mb-6">
                  <label className={labelClass}>판매 상태</label>
                  <button type="button" onClick={() => setForm({ ...form, active: !form.active })} className={`${inputClass} md:max-w-xs flex items-center justify-between text-left ${form.active ? "border-[#e91e3f]/40" : ""}`}>
                    <span className={form.active ? "text-[#e91e3f] font-bold" : "text-gray-400"}>{form.active ? "판매 중" : "숨김"}</span>
                    <span className={`w-9 h-5 rounded-full relative transition-colors shrink-0 ${form.active ? "bg-[#e91e3f]" : "bg-[#2a2a2a]"}`}>
                      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${form.active ? "left-[18px]" : "left-0.5"}`}></span>
                    </span>
                  </button>
                </div>

                <div className="flex gap-3">
                  <button type="submit" className={primaryBtn}>{form.id ? "수정 저장" : "상품 등록"}</button>
                  {form.id && <button type="button" onClick={() => setForm(emptyForm)} className="px-6 py-3.5 text-sm font-bold text-gray-300 hover:text-white transition-colors">취소</button>}
                </div>
              </form>
            </section>
            </Reveal>

            <Reveal>
            <section>
              <SectionHead no="02" title={`등록된 상품 (${items.length})`} />
              {isLoading ? <div className="py-10 text-center text-gray-400 text-sm">불러오는 중...</div>
                : items.length === 0 ? <div className="py-10 text-gray-400 text-sm border-y border-white/[0.06]">등록된 상품이 없습니다.</div>
                : (
                <div className="divide-y divide-white/[0.06] border-y border-white/[0.06]">
                  {items.map((it) => (
                    <div key={it._id} className="py-4 flex flex-col md:flex-row md:items-center gap-3 md:gap-4">
                      <div className="w-12 h-12 rounded-lg bg-white/5 overflow-hidden shrink-0">
                        {it.imageUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={it.imageUrl} alt="" className="w-full h-full object-cover" />
                        )}
                      </div>
                      <div className="min-w-0 md:w-48 shrink-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-white truncate">{it.name}</span>
                          {!it.active && <span className="text-[10px] font-bold text-gray-400 border border-white/15 px-1.5 rounded shrink-0">숨김</span>}
                        </div>
                        <span className="text-[10px] font-bold text-gray-400">{it.type === "role" ? `역할 · ${it.roleName || it.roleId}` : "기프트카드"}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 flex-1">
                        <span className="text-[11px] font-bold text-[#e91e3f] tabular-nums">{it.price.toLocaleString()} XP</span>
                        <span className="text-[11px] font-bold text-gray-400">{it.stock < 0 ? "재고 무제한" : `재고 ${it.stock}`}</span>
                        <span className="text-[11px] text-gray-400">{it.soldCount || 0}개 판매</span>
                        <span className="text-[11px] text-gray-400">추천 {it.sortOrder || 0}</span>
                      </div>
                      <div className="flex gap-4 shrink-0">
                        <button onClick={() => { setForm({ id: it._id, name: it.name, description: it.description || "", imageUrl: it.imageUrl || "", type: it.type, roleId: it.roleId || "", price: String(it.price), stock: it.stock < 0 ? "" : String(it.stock), sortOrder: String(it.sortOrder || 0), active: it.active }); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="text-xs font-bold text-gray-400 hover:text-white transition-colors">수정</button>
                        <button onClick={() => setDeleteId(it._id)} className="text-xs font-bold text-red-500/70 hover:text-red-500 transition-colors">삭제</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
            </Reveal>
          </>
        )}

        {/* ═══ 구매 내역 ═══ */}
        {tab === "orders" && (
          <Reveal>
          <section>
            <SectionHead no="01" title={`구매 내역 (${orders.length})`} right={
              <div className="flex gap-2">
                {[{ v: "", l: "전체" }, { v: "pending", l: `대기 ${pendingCount}` }, { v: "completed", l: "완료" }, { v: "cancelled", l: "취소" }].map((o) => (
                  <button key={o.v} onClick={() => setOrderFilter(o.v)}
                    className={`px-3.5 py-1.5 rounded-full text-[11px] font-bold border transition-colors ${orderFilter === o.v ? "bg-[#e91e3f]/15 text-[#e91e3f] border-[#e91e3f]/40" : "text-gray-300 border-white/10 hover:text-white"}`}>
                    {o.l}
                  </button>
                ))}
              </div>
            } />
            {isLoading ? <div className="py-10 text-center text-gray-400 text-sm">불러오는 중...</div>
              : shownOrders.length === 0 ? <div className="py-10 text-gray-400 text-sm border-y border-white/[0.06]">구매 내역이 없습니다.</div>
              : (
              <div className="divide-y divide-white/[0.06] border-y border-white/[0.06]">
                {shownOrders.map((o) => (
                  <div key={o._id} className="py-4">
                    <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-4">
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded shrink-0 w-fit ${
                        o.status === "completed" ? "bg-emerald-500/15 text-emerald-400"
                        : o.status === "cancelled" ? "bg-red-500/15 text-red-400"
                        : "bg-[#e91e3f] text-white"}`}>
                        {STATUS_LABEL[o.status]}
                      </span>
                      <div className="min-w-0 md:w-44 shrink-0">
                        <div className="text-sm font-bold text-white truncate">{o.itemName}</div>
                        <div className="text-[10px] font-bold text-gray-400">{o.itemType === "role" ? "역할" : "실물"} · {o.userName}</div>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 flex-1">
                        <span className="text-[11px] font-bold text-[#e91e3f] tabular-nums">{o.price.toLocaleString()} XP</span>
                        <span className="text-[11px] text-gray-400">{fmtDateTime(o.createdAt)}</span>
                        {o.error && <span className="text-[11px] font-bold text-red-400">지급 실패: {o.error}</span>}
                      </div>
                      {o.status === "pending" && (
                        <div className="flex gap-4 shrink-0">
                          {o.itemType === "physical" && (
                            <button onClick={() => { setNoteTarget(o); setNoteText(""); }} className="text-xs font-bold text-emerald-400/80 hover:text-emerald-400 transition-colors">발송 처리</button>
                          )}
                          <button onClick={() => processOrder(o._id, "cancelled")} className="text-xs font-bold text-red-500/70 hover:text-red-500 transition-colors">취소·환불</button>
                        </div>
                      )}
                    </div>
                    {o.contact && (
                      <div className="mt-2 md:ml-[4.5rem] text-[11px] text-gray-300 bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2 whitespace-pre-wrap break-words">
                        <span className="font-bold text-gray-400">수령 정보 · </span>{o.contact}
                      </div>
                    )}
                    {o.adminNote && <div className="mt-1.5 md:ml-[4.5rem] text-[11px] text-gray-400">메모: {o.adminNote}</div>}
                  </div>
                ))}
              </div>
            )}
            <p className="mt-6 text-xs text-gray-400 leading-relaxed">
              💡 역할 상품은 봇이 30초 주기로 자동 지급하며 완료 시 상태가 바뀝니다. 실물 상품만 여기서 발송 처리하세요. 취소하면 XP가 환불되고 재고가 복구됩니다.
            </p>
          </section>
          </Reveal>
        )}
      </div>

      {deleteId && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 p-4">
          <div className="bg-[#121212] border border-red-500/30 rounded-3xl w-full max-w-sm p-8 text-center">
            <h2 className="text-xl font-bold text-white mb-3">상품 삭제</h2>
            <p className="text-sm text-gray-400 mb-8">이 상품을 삭제하시겠습니까?<br/>기존 구매 내역은 그대로 유지됩니다.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteId(null)} className="flex-1 py-3 bg-[#2a2a2a] text-white rounded-xl">취소</button>
              <button onClick={executeDelete} className="flex-1 py-3 bg-red-500/80 text-white rounded-xl">삭제</button>
            </div>
          </div>
        </div>
      )}

      {noteTarget && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 p-4">
          <div className="bg-[#121212] border border-white/10 rounded-3xl w-full max-w-sm p-8">
            <h2 className="text-lg font-bold text-white mb-2">발송 처리</h2>
            <p className="text-xs text-gray-400 mb-5">{noteTarget.userName} · {noteTarget.itemName}</p>
            {noteTarget.contact && (
              <div className="text-[11px] text-gray-300 bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2 mb-4 whitespace-pre-wrap">{noteTarget.contact}</div>
            )}
            <input type="text" value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="운송장 번호 등 메모 (선택)"
              className="w-full bg-transparent border border-white/10 rounded-lg px-4 py-3 text-sm text-white outline-none focus:border-[#e91e3f] mb-6 placeholder:text-gray-500" />
            <div className="flex gap-3">
              <button onClick={() => setNoteTarget(null)} className="flex-1 py-3 bg-[#2a2a2a] text-white rounded-xl">닫기</button>
              <button onClick={() => processOrder(noteTarget._id, "completed", noteText)} className="flex-1 py-3 bg-[#e91e3f] text-white rounded-xl font-bold">완료 처리</button>
            </div>
          </div>
        </div>
      )}

      {/* 📌 카드 미리보기 — 상점(라이트 톤)에서 실제로 어떻게 보이는지 그대로 렌더 */}
      {showPreview && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={() => setShowPreview(false)}>
          <div className="w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-black tracking-[0.3em] text-gray-300 uppercase">Shop Preview</span>
              <button onClick={() => setShowPreview(false)} className="p-1.5 text-gray-300 hover:text-white transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {/* 상점 배경 위에 실제 카드 마크업 그대로 */}
            <div className="bg-[#f5f3f0] rounded-2xl p-5">
              <div className="bg-white rounded-2xl border border-[#e2e0dc] overflow-hidden shadow-[0_2px_12px_rgba(0,0,0,0.04)] flex flex-col">
                <div className="relative aspect-[4/3] bg-[#eceae6] overflow-hidden">
                  {form.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={form.imageUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[#c4c4c4]">
                      <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" strokeWidth={1.2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12A1.125 1.125 0 0119.75 22H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007z" />
                      </svg>
                    </div>
                  )}
                  <span className={`absolute top-3 left-3 px-2.5 py-1 rounded-full text-[10px] font-black tracking-wide ${form.type === "role" ? "bg-[#e91e3f] text-white" : "bg-[#131313] text-white"}`}>
                    {form.type === "role" ? "역할 · 자동 지급" : "기프트카드"}
                  </span>
                  {form.stock === "0" && (
                    <div className="absolute inset-0 bg-black/55 flex items-center justify-center">
                      <span className="text-sm font-black text-white tracking-wider">SOLD OUT</span>
                    </div>
                  )}
                </div>

                <div className="p-5 flex flex-col flex-1">
                  <h3 className="text-base font-black text-[#131313] tracking-tight mb-1.5 break-keep">{form.name || "상품명을 입력하세요"}</h3>
                  {form.description && <p className="text-[12px] text-[#5a5a5a] leading-relaxed mb-3 line-clamp-2 break-keep">{form.description}</p>}

                  <div className="flex items-center gap-2 mb-4 text-[11px] font-bold text-[#8a8a8a]">
                    <span>{form.stock === "" ? "재고 무제한" : `남은 수량 ${form.stock}개`}</span>
                  </div>

                  <div className="mt-auto flex items-end justify-between gap-3">
                    <div>
                      <div className="text-xl font-black text-[#131313] tracking-tight tabular-nums">{(Number(form.price) || 0).toLocaleString()}</div>
                      <div className="text-[10px] font-bold text-[#8a8a8a] tracking-wider">XP</div>
                    </div>
                    <span className="px-5 py-2.5 rounded-full text-[12px] font-bold bg-[#e91e3f] text-white shadow-[0_4px_12px_rgba(233,30,63,0.25)]">구매하기</span>
                  </div>
                </div>
              </div>
            </div>

            <p className="mt-3 text-center text-[11px] text-gray-300">
              {form.active ? "판매 중 — 상점에 노출됩니다" : "숨김 — 상점에 노출되지 않습니다"}
              {form.type === "role" && !form.roleId && <span className="block mt-1 text-[#e91e3f]">지급할 역할을 선택해야 저장할 수 있습니다</span>}
            </p>
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
