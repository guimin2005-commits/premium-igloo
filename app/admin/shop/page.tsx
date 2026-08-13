"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useSession, signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Reveal, LuxStyles } from "../../components/Lux";

const ADMIN_USERS = ["elahw.06"];

const TAB_META: Record<string, { title: string; desc: string }> = {
  items: { title: "상품 관리", desc: "ARCTIC에 노출할 상품을 등록·수정합니다. 역할 상품은 구매 시 봇이 자동 지급합니다." },
  banners: { title: "이미지 배너", desc: "상점 최상단에 노출할 프로모션 배너를 등록합니다. 여러 개면 5초마다 자동 전환됩니다." },
  coupons: { title: "쿠폰 관리", desc: "보상형(역할·XP 지급)과 할인형(결제 할인) 쿠폰을 한 곳에서 발급합니다." },
  orders: { title: "구매 내역", desc: "구매 건을 확인하고 기프트카드 발송·취소를 처리합니다." },
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
  const [deleteTarget, setDeleteTarget] = useState<{ kind: "item" | "banner" | "coupon"; id: string } | null>(null);
  const [orderFilter, setOrderFilter] = useState("");
  const [noteTarget, setNoteTarget] = useState<any>(null);
  const [noteText, setNoteText] = useState("");
  const [showPreview, setShowPreview] = useState(false);

  const emptyForm = { id: "", name: "", description: "", imageUrl: "", type: "role", roleId: "", price: "", discountPct: "", stock: "", sortOrder: "", active: true };
  const [form, setForm] = useState(emptyForm);
  const [isRoleOpen, setIsRoleOpen] = useState(false);
  const selectedRole = guildRoles.find((r) => r.id === form.roleId);

  const notify = (message: string, isError = false) => setPopup({ isOpen: true, message, isError });

  const fetchAll = useCallback(() => {
    Promise.all([
      fetch("/api/shop/items?all=1", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ data: [] })),
      fetch("/api/discord-roles", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ data: [] })),
      fetch("/api/shop/orders", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ data: [] })),
      fetch("/api/shop/banners?all=1", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ data: [] })),
      fetch("/api/shop/coupons", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ data: [] })),
    ]).then(([it, roles, ord, ban, cou]) => {
      setItems(Array.isArray(it?.data) ? it.data : []);
      setGuildRoles(Array.isArray(roles?.data) ? roles.data : []);
      setOrders(Array.isArray(ord?.data) ? ord.data : []);
      setBanners(Array.isArray(ban?.data) ? ban.data : []);
      setCoupons(Array.isArray(cou?.data) ? cou.data : []);
    }).finally(() => setIsLoading(false));
  }, []);

  // ── 이미지 배너 ──────────────────────────────
  const EMPTY_BANNER = { id: "", imageUrl: "", title: "", subtitle: "", link: "", sortOrder: "", active: true };
  const [banners, setBanners] = useState<any[]>([]);
  const [bannerForm, setBannerForm] = useState<any>(EMPTY_BANNER);
  // 📌 넣은 이미지의 실제 크기를 읽어 권장 크기와 견줘 준다 (등록하고 나서야 잘린 걸 아는 일을 막는다)
  const [bannerSize, setBannerSize] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    const url = (bannerForm.imageUrl || "").trim();
    if (!url) { setBannerSize(null); return; }
    let alive = true;
    const img = new Image();
    img.onload = () => { if (alive) setBannerSize({ w: img.naturalWidth, h: img.naturalHeight }); };
    img.onerror = () => { if (alive) setBannerSize(null); };
    img.src = url;
    return () => { alive = false; };
  }, [bannerForm.imageUrl]);

  const saveBanner = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch("/api/shop/banners", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(bannerForm),
    }).catch(() => null);
    const d = await res?.json().catch(() => null);
    if (res?.ok && d?.success) { setBannerForm(EMPTY_BANNER); fetchAll(); notify("저장되었습니다."); }
    else notify(d?.message || "저장에 실패했습니다.", true);
  };

  // ── 쿠폰 ────────────────────────────────────
  const EMPTY_COUPON = { id: "", code: "", name: "", kind: "discount", reward: "", rewardRoleId: "", rewardRoleName: "", rewardXp: "", requiredRoleId: "", requiredRoleName: "", type: "percent", value: "", maxDiscount: "", minTotal: "", maxUses: "", perUserLimit: "1", active: true, expiresAt: "" };
  const [coupons, setCoupons] = useState<any[]>([]);
  const [couponForm, setCouponForm] = useState<any>(EMPTY_COUPON);

  // 쿠폰을 유저 지갑에 지급
  const [issueTarget, setIssueTarget] = useState<any>(null);
  const [issueInput, setIssueInput] = useState("");
  const [isIssuing, setIsIssuing] = useState(false);

  const issueCoupon = async (target: string) => {
    if (!issueTarget || isIssuing) return;
    setIsIssuing(true);
    const res = await fetch("/api/shop/coupons/issue", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ couponId: issueTarget._id, target }),
    }).catch(() => null);
    const d = await res?.json().catch(() => null);
    if (res?.ok && d?.success) { notify(d.message || "지급했습니다."); setIssueTarget(null); setIssueInput(""); }
    else notify(d?.message || "지급에 실패했습니다.", true);
    setIsIssuing(false);
  };

  // 예전 '코드'를 보상형 쿠폰으로 옮긴다 (여러 번 눌러도 중복되지 않는다)
  const [isMigrating, setIsMigrating] = useState(false);
  const migrateCodes = async () => {
    if (isMigrating) return;
    setIsMigrating(true);
    const res = await fetch("/api/shop/coupons/migrate", { method: "POST" }).catch(() => null);
    const d = await res?.json().catch(() => null);
    if (res?.ok && d?.success) { notify(d.message || "이전했습니다."); fetchAll(); }
    else notify(d?.message || "이전에 실패했습니다.", true);
    setIsMigrating(false);
  };

  const saveCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch("/api/shop/coupons", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(couponForm),
    }).catch(() => null);
    const d = await res?.json().catch(() => null);
    if (res?.ok && d?.success) { setCouponForm(EMPTY_COUPON); fetchAll(); notify("저장되었습니다."); }
    else notify(d?.message || "저장에 실패했습니다.", true);
  };

  useEffect(() => { if (isAdmin) fetchAll(); }, [isAdmin, fetchAll]);

  // 📌 상점 카드의 '수정' 링크(?edit=<id>)로 들어오면 해당 상품을 폼에 채워 둔다
  const editId = searchParams.get("edit");
  useEffect(() => {
    if (!editId || items.length === 0) return;
    const it = items.find((x) => x._id === editId);
    if (!it) return;
    setForm({
      id: it._id, name: it.name, description: it.description || "", imageUrl: it.imageUrl || "",
      type: it.type, roleId: it.roleId || "", price: String(it.price), discountPct: it.discountPct ? String(it.discountPct) : "",
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
    if (!deleteTarget) return;
    const api = { item: "/api/shop/items", banner: "/api/shop/banners", coupon: "/api/shop/coupons" }[deleteTarget.kind];
    const res = await fetch(`${api}?id=${deleteTarget.id}`, { method: "DELETE" }).catch(() => null);
    if (res?.ok) fetchAll();
    setDeleteTarget(null);
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
                      {[{ v: "role", l: "역할" }, { v: "perk", l: "권한" }, { v: "physical", l: "기프트카드" }].map((o) => (
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
                {(form.type === "role" || form.type === "perk") && (
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
                    <label className={labelClass}>정가 (XP) <span className="text-[#e91e3f]">*</span></label>
                    <input type="number" min={1} value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="예: 500000" className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>할인율 (%)</label>
                    <input type="number" min={0} max={100} value={form.discountPct} onChange={(e) => setForm({ ...form, discountPct: e.target.value })} placeholder="0" className={inputClass} />
                    {Number(form.discountPct) > 0 && Number(form.price) > 0 && (
                      <p className="text-[10px] font-bold text-[#e91e3f] mt-1.5">판매가 {Math.max(0, Math.floor((Number(form.price) * (100 - Math.min(100, Number(form.discountPct)))) / 100)).toLocaleString()} XP</p>
                    )}
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
                        <span className="text-[10px] font-bold text-gray-400">{it.type === "physical" ? "기프트카드" : `${it.type === "perk" ? "권한" : "역할"} · ${it.roleName || it.roleId}`}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 flex-1">
                        <span className="text-[11px] font-bold text-[#e91e3f] tabular-nums">{Math.max(0, Math.floor((it.price * (100 - (it.discountPct || 0))) / 100)).toLocaleString()} XP{it.discountPct > 0 ? ` (-${it.discountPct}%)` : ""}</span>
                        <span className="text-[11px] font-bold text-gray-400">{it.stock < 0 ? "재고 무제한" : `재고 ${it.stock}`}</span>
                        <span className="text-[11px] text-gray-400">{it.soldCount || 0}개 판매</span>
                        <span className="text-[11px] text-gray-400">추천 {it.sortOrder || 0}</span>
                      </div>
                      <div className="flex gap-4 shrink-0">
                        <button onClick={() => { setForm({ id: it._id, name: it.name, description: it.description || "", imageUrl: it.imageUrl || "", type: it.type, roleId: it.roleId || "", price: String(it.price), discountPct: it.discountPct ? String(it.discountPct) : "", stock: it.stock < 0 ? "" : String(it.stock), sortOrder: String(it.sortOrder || 0), active: it.active }); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="text-xs font-bold text-gray-400 hover:text-white transition-colors">수정</button>
                        <button onClick={() => setDeleteTarget({ kind: "item", id: it._id })} className="text-xs font-bold text-red-500/70 hover:text-red-500 transition-colors">삭제</button>
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
        {/* ═══ 이미지 배너 ═══ */}
        {tab === "banners" && (
          <>
            <Reveal>
            <section>
              <SectionHead no="01" title={bannerForm.id ? "배너 수정" : "배너 등록"} />
              <form onSubmit={saveBanner}>
                <div className="mb-4">
                  <label className={labelClass}>배너 이미지 URL <span className="text-[#e91e3f]">*</span></label>
                  <input type="text" value={bannerForm.imageUrl} onChange={(e) => setBannerForm({ ...bannerForm, imageUrl: e.target.value })}
                    placeholder="https://..." className={inputClass} />
                  <p className={fieldNote}>
                    권장 크기 <span className="text-gray-200 font-bold tabular-nums">2400 × 600 px</span> (4:1) · 최소 1200 × 300 px · JPG/PNG/WebP
                  </p>
                  <p className={fieldNote}>
                    모바일에서는 3:1로 잘려 보입니다 — 글자·로고는 가운데 <span className="text-gray-200 font-bold">가로 75%</span> 안에 두세요.
                  </p>
                  {bannerSize && (() => {
                    const ratio = bannerSize.w / bannerSize.h;
                    const tooSmall = bannerSize.w < 1200;
                    const offRatio = ratio < 3.4 || ratio > 4.6;
                    const ok = !tooSmall && !offRatio;
                    return (
                      <p className={`text-[10px] mt-1.5 font-bold ${ok ? "text-emerald-400" : "text-amber-400"}`}>
                        현재 이미지 <span className="tabular-nums">{bannerSize.w} × {bannerSize.h} px</span> ({ratio.toFixed(2)}:1)
                        {ok ? " · 적당합니다" : tooSmall ? " · 가로가 1200px보다 작아 흐리게 보일 수 있습니다" : " · 4:1에서 벗어나 위아래가 잘립니다"}
                      </p>
                    );
                  })()}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className={labelClass}>제목 (선택)</label>
                    <input type="text" value={bannerForm.title} onChange={(e) => setBannerForm({ ...bannerForm, title: e.target.value })}
                      placeholder="예: 시즌 한정 기프트카드" className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>부제 (선택)</label>
                    <input type="text" value={bannerForm.subtitle} onChange={(e) => setBannerForm({ ...bannerForm, subtitle: e.target.value })}
                      placeholder="예: 한정 수량 소진 시 조기 마감" className={inputClass} />
                  </div>
                </div>
                <p className={`${fieldNote} -mt-2 mb-4`}>제목·부제를 넣으면 이미지 위에 어두운 그라데이션과 함께 표시됩니다</p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                  <div>
                    <label className={labelClass}>클릭 시 이동 (선택)</label>
                    <input type="text" value={bannerForm.link} onChange={(e) => setBannerForm({ ...bannerForm, link: e.target.value })}
                      placeholder="/shop 또는 /event" className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>노출 순서</label>
                    <input type="number" value={bannerForm.sortOrder} onChange={(e) => setBannerForm({ ...bannerForm, sortOrder: e.target.value })}
                      placeholder="0" className={inputClass} />
                    <p className={fieldNote}>작을수록 먼저 노출</p>
                  </div>
                </div>

                <div className="mb-6">
                  <button type="button" onClick={() => setBannerForm({ ...bannerForm, active: !bannerForm.active })}
                    className={`${inputClass} md:max-w-xs flex items-center justify-between text-left ${bannerForm.active ? "border-[#e91e3f]/40" : ""}`}>
                    <span className={bannerForm.active ? "text-[#e91e3f] font-bold" : "text-gray-400"}>{bannerForm.active ? "노출 중" : "숨김"}</span>
                    <span className={`w-9 h-5 rounded-full relative transition-colors shrink-0 ${bannerForm.active ? "bg-[#e91e3f]" : "bg-[#2a2a2a]"}`}>
                      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${bannerForm.active ? "left-[18px]" : "left-0.5"}`}></span>
                    </span>
                  </button>
                </div>

                {/* 미리보기 */}
                {bannerForm.imageUrl && (
                  <div className="mb-6">
                    <div className="text-[10px] font-black tracking-[0.25em] text-gray-400 uppercase mb-2">Preview</div>
                    <div className="relative rounded-2xl overflow-hidden border border-white/10 aspect-[4/1] bg-[#161616]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={bannerForm.imageUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
                      {(bannerForm.title || bannerForm.subtitle) && (
                        <div className="absolute inset-0 bg-gradient-to-r from-black/55 via-black/20 to-transparent flex flex-col justify-center px-8">
                          {bannerForm.title && <h3 className="text-xl font-black tracking-tight text-white mb-1">{bannerForm.title}</h3>}
                          {bannerForm.subtitle && <p className="text-[12px] text-white/85">{bannerForm.subtitle}</p>}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex gap-3">
                  <button type="submit" className={primaryBtn}>{bannerForm.id ? "수정 저장" : "배너 등록"}</button>
                  {bannerForm.id && <button type="button" onClick={() => setBannerForm(EMPTY_BANNER)} className="px-6 py-3.5 text-sm font-bold text-gray-300 hover:text-white transition-colors">취소</button>}
                </div>
              </form>
            </section>
            </Reveal>

            <Reveal>
            <section>
              <SectionHead no="02" title={`등록된 배너 (${banners.length})`} />
              {isLoading ? <div className="py-10 text-center text-gray-400 text-sm">불러오는 중...</div>
                : banners.length === 0 ? <div className="py-10 text-gray-400 text-sm border-y border-white/[0.06]">등록된 배너가 없습니다.</div>
                : (
                <div className="divide-y divide-white/[0.06] border-y border-white/[0.06]">
                  {banners.map((b) => (
                    <div key={b._id} className="py-4 flex flex-col md:flex-row md:items-center gap-3 md:gap-4">
                      <div className="w-28 h-14 rounded-lg bg-white/5 overflow-hidden shrink-0">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={b.imageUrl} alt="" className="w-full h-full object-cover" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-white truncate">{b.title || "(제목 없음)"}</span>
                          {!b.active && <span className="text-[10px] font-bold text-gray-400 border border-white/15 px-1.5 rounded shrink-0">숨김</span>}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
                          {b.subtitle && <span className="text-[11px] text-gray-400 truncate">{b.subtitle}</span>}
                          {b.link && <span className="text-[11px] font-bold text-gray-400">→ {b.link}</span>}
                          <span className="text-[11px] text-gray-400">순서 {b.sortOrder || 0}</span>
                        </div>
                      </div>
                      <div className="flex gap-4 shrink-0">
                        <button onClick={() => { setBannerForm({ id: b._id, imageUrl: b.imageUrl, title: b.title || "", subtitle: b.subtitle || "", link: b.link || "", sortOrder: String(b.sortOrder || 0), active: b.active }); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="text-xs font-bold text-gray-400 hover:text-white transition-colors">수정</button>
                        <button onClick={() => setDeleteTarget({ kind: "banner", id: b._id })} className="text-xs font-bold text-red-500/70 hover:text-red-500 transition-colors">삭제</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
            </Reveal>
          </>
        )}

        {/* ═══ 쿠폰 관리 ═══ */}
        {tab === "coupons" && (
          <>
            <Reveal>
            <section>
              <SectionHead no="01" title={couponForm.id ? "쿠폰 수정" : "쿠폰 발급"} right={
                <button type="button" onClick={migrateCodes} disabled={isMigrating}
                  className="px-4 py-2 rounded-lg border border-white/15 text-gray-300 hover:text-white text-[12px] font-bold transition-colors disabled:opacity-40 whitespace-nowrap">
                  {isMigrating ? "이전 중..." : "예전 코드 가져오기"}
                </button>
              } />
              <form onSubmit={saveCoupon}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className={labelClass}>쿠폰 코드 <span className="text-[#e91e3f]">*</span></label>
                    <input type="text" value={couponForm.code} onChange={(e) => setCouponForm({ ...couponForm, code: e.target.value.toUpperCase() })}
                      placeholder="예: WELCOME10" className={`${inputClass} uppercase`} />
                    <p className={fieldNote}>유저가 주문서에서 입력하는 코드 (대문자로 저장)</p>
                  </div>
                  <div>
                    <label className={labelClass}>쿠폰 이름</label>
                    <input type="text" value={couponForm.name} onChange={(e) => setCouponForm({ ...couponForm, name: e.target.value })}
                      placeholder="예: 신규 가입 축하 쿠폰" className={inputClass} />
                    <p className={fieldNote}>주문서에 표시될 이름</p>
                  </div>
                </div>

                {/* 쿠폰 종류 — 보상형(역할·XP 지급) / 할인형(결제 할인) */}
                <div className="mb-4">
                  <label className={labelClass}>쿠폰 종류 <span className="text-[#e91e3f]">*</span></label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {[
                      { v: "discount", l: "할인형", d: "ARCTIC 결제 시 금액 할인" },
                      { v: "reward", l: "보상형", d: "입력 즉시 역할·XP 지급" },
                    ].map((o) => (
                      <button key={o.v} type="button" onClick={() => setCouponForm({ ...couponForm, kind: o.v })}
                        className={`py-3 px-4 rounded-lg text-left border transition-colors ${
                          (couponForm.kind || "discount") === o.v ? "bg-[#e91e3f]/15 text-[#e91e3f] border-[#e91e3f]/40" : "text-gray-300 border-white/10 hover:text-white"
                        }`}>
                        <span className="block text-xs font-bold">{o.l}</span>
                        <span className="block text-[10px] text-gray-400 mt-0.5">{o.d}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* ── 보상형 설정 ── */}
                {couponForm.kind === "reward" && (
                  <div className="mb-4 space-y-4 p-4 rounded-lg border border-white/10">
                    <div>
                      <label className={labelClass}>안내 문구</label>
                      <input type="text" value={couponForm.reward || ""} onChange={(e) => setCouponForm({ ...couponForm, reward: e.target.value })}
                        placeholder="예: 시즌 참가 보상이 지급되었습니다" className={inputClass} />
                      <p className={fieldNote}>유저가 쿠폰을 쓴 직후 보게 될 문구</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className={labelClass}>지급할 역할</label>
                        <select value={couponForm.rewardRoleId || ""}
                          onChange={(e) => setCouponForm({ ...couponForm, rewardRoleId: e.target.value, rewardRoleName: guildRoles.find((r) => r.id === e.target.value)?.name || "" })}
                          className={`${inputClass} [&>option]:bg-[#161616]`}>
                          <option value="">지급 안 함</option>
                          {guildRoles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className={labelClass}>지급할 XP</label>
                        <input type="number" min={0} value={couponForm.rewardXp || ""} onChange={(e) => setCouponForm({ ...couponForm, rewardXp: e.target.value })}
                          placeholder="0" className={inputClass} />
                        <p className={fieldNote}>역할·XP 중 하나는 지정해야 합니다</p>
                      </div>
                    </div>

                    <div>
                      <label className={labelClass}>사용 조건 역할</label>
                      <select value={couponForm.requiredRoleId || ""}
                        onChange={(e) => setCouponForm({ ...couponForm, requiredRoleId: e.target.value, requiredRoleName: guildRoles.find((r) => r.id === e.target.value)?.name || "" })}
                        className={`${inputClass} [&>option]:bg-[#161616]`}>
                        <option value="">제한 없음</option>
                        {guildRoles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                      </select>
                      <p className={fieldNote}>지정하면 해당 역할 보유자만 사용할 수 있습니다</p>
                    </div>
                  </div>
                )}

                {/* ── 할인형 설정 ── */}
                <div className={`grid grid-cols-1 md:grid-cols-3 gap-4 mb-4 ${couponForm.kind === "reward" ? "hidden" : ""}`}>
                  <div>
                    <label className={labelClass}>할인 방식 <span className="text-[#e91e3f]">*</span></label>
                    <div className="flex gap-2">
                      {[{ v: "percent", l: "정률 (%)" }, { v: "flat", l: "정액 (XP)" }].map((o) => (
                        <button key={o.v} type="button" onClick={() => setCouponForm({ ...couponForm, type: o.v })}
                          className={`flex-1 py-3 rounded-lg text-xs font-bold border transition-colors ${couponForm.type === o.v ? "bg-[#e91e3f]/15 text-[#e91e3f] border-[#e91e3f]/40" : "text-gray-300 border-white/10 hover:text-white"}`}>
                          {o.l}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className={labelClass}>할인 값 <span className="text-[#e91e3f]">*</span></label>
                    <input type="number" min={1} max={couponForm.type === "percent" ? 100 : undefined}
                      value={couponForm.value} onChange={(e) => setCouponForm({ ...couponForm, value: e.target.value })}
                      placeholder={couponForm.type === "percent" ? "10" : "50000"} className={inputClass} />
                    <p className={fieldNote}>{couponForm.type === "percent" ? "주문 금액의 %" : "차감할 XP"}</p>
                  </div>
                  <div>
                    <label className={labelClass}>최대 할인액</label>
                    <input type="number" min={0} value={couponForm.maxDiscount} disabled={couponForm.type !== "percent"}
                      onChange={(e) => setCouponForm({ ...couponForm, maxDiscount: e.target.value })}
                      placeholder="0 = 제한 없음" className={`${inputClass} disabled:opacity-40`} />
                    <p className={fieldNote}>정률일 때만 상한 적용</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                  <div className={couponForm.kind === "reward" ? "hidden" : ""}>
                    <label className={labelClass}>최소 주문 금액</label>
                    <input type="number" min={0} value={couponForm.minTotal} onChange={(e) => setCouponForm({ ...couponForm, minTotal: e.target.value })}
                      placeholder="0" className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>전체 사용 한도</label>
                    <input type="number" min={0} value={couponForm.maxUses} onChange={(e) => setCouponForm({ ...couponForm, maxUses: e.target.value })}
                      placeholder="0 = 무제한" className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>1인당 사용 횟수</label>
                    <input type="number" min={0} value={couponForm.perUserLimit} onChange={(e) => setCouponForm({ ...couponForm, perUserLimit: e.target.value })}
                      placeholder="1" className={inputClass} />
                    <p className={fieldNote}>0 = 무제한</p>
                  </div>
                  <div>
                    <label className={labelClass}>만료 일시</label>
                    <input type="datetime-local" value={couponForm.expiresAt} onChange={(e) => setCouponForm({ ...couponForm, expiresAt: e.target.value })}
                      className={`${inputClass} [color-scheme:dark]`} />
                    <p className={fieldNote}>비우면 무기한</p>
                  </div>
                </div>

                <div className="mb-6">
                  <button type="button" onClick={() => setCouponForm({ ...couponForm, active: !couponForm.active })}
                    className={`${inputClass} md:max-w-xs flex items-center justify-between text-left ${couponForm.active ? "border-[#e91e3f]/40" : ""}`}>
                    <span className={couponForm.active ? "text-[#e91e3f] font-bold" : "text-gray-400"}>{couponForm.active ? "사용 가능" : "사용 중지"}</span>
                    <span className={`w-9 h-5 rounded-full relative transition-colors shrink-0 ${couponForm.active ? "bg-[#e91e3f]" : "bg-[#2a2a2a]"}`}>
                      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${couponForm.active ? "left-[18px]" : "left-0.5"}`}></span>
                    </span>
                  </button>
                </div>

                <div className="flex gap-3">
                  <button type="submit" className={primaryBtn}>{couponForm.id ? "수정 저장" : "쿠폰 발급"}</button>
                  {couponForm.id && <button type="button" onClick={() => setCouponForm(EMPTY_COUPON)} className="px-6 py-3.5 text-sm font-bold text-gray-300 hover:text-white transition-colors">취소</button>}
                </div>
              </form>
            </section>
            </Reveal>

            <Reveal>
            <section>
              <SectionHead no="02" title={`발급된 쿠폰 (${coupons.length})`} />
              {isLoading ? <div className="py-10 text-center text-gray-400 text-sm">불러오는 중...</div>
                : coupons.length === 0 ? <div className="py-10 text-gray-400 text-sm border-y border-white/[0.06]">발급된 쿠폰이 없습니다.</div>
                : (
                <div className="divide-y divide-white/[0.06] border-y border-white/[0.06]">
                  {coupons.map((c) => {
                    const expired = c.expiresAt && new Date(c.expiresAt) < new Date();
                    const exhausted = c.maxUses > 0 && c.usedCount >= c.maxUses;
                    const state = !c.active ? "중지" : expired ? "만료" : exhausted ? "소진" : "사용 가능";
                    return (
                      <div key={c._id} className="py-4 flex flex-col md:flex-row md:items-center gap-3 md:gap-4">
                        <div className="flex items-center gap-2.5 md:w-56 shrink-0 min-w-0">
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded shrink-0 ${
                            state === "사용 가능" ? "bg-[#e91e3f] text-white" : "bg-white/10 text-gray-300"}`}>{state}</span>
                          <div className="min-w-0">
                            <div className="text-sm font-black text-white tracking-wide truncate">{c.code}</div>
                            {c.name && <div className="text-[10px] text-gray-400 truncate">{c.name}</div>}
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 flex-1 min-w-0">
                          <span className={`text-[10px] font-black px-1.5 py-0.5 rounded shrink-0 ${
                            c.kind === "reward" ? "bg-[#2f6fb0]/20 text-[#7fb2e5]" : "bg-white/10 text-gray-300"}`}>
                            {c.kind === "reward" ? "보상형" : "할인형"}
                          </span>

                          {c.kind === "reward" ? (
                            <span className="text-[11px] font-bold text-[#e91e3f]">
                              {[c.rewardRoleName && `역할 ${c.rewardRoleName}`, c.rewardXp > 0 && `${c.rewardXp.toLocaleString()} XP`]
                                .filter(Boolean).join(" · ") || "지급 없음"}
                            </span>
                          ) : (
                            <span className="text-[11px] font-bold text-[#e91e3f]">
                              {c.type === "percent" ? `${c.value}% 할인` : `${c.value.toLocaleString()} XP 할인`}
                              {c.type === "percent" && c.maxDiscount > 0 && ` (최대 ${c.maxDiscount.toLocaleString()})`}
                            </span>
                          )}

                          {c.kind === "reward" && c.requiredRoleName && (
                            <span className="text-[11px] text-gray-400">{c.requiredRoleName} 전용</span>
                          )}
                          {c.kind !== "reward" && c.minTotal > 0 && <span className="text-[11px] text-gray-400">{c.minTotal.toLocaleString()} XP 이상</span>}
                          <span className="text-[11px] text-gray-400">사용 {c.usedCount || 0}{c.maxUses > 0 ? ` / ${c.maxUses}` : ""}</span>
                          <span className="text-[11px] text-gray-400">1인 {c.perUserLimit === 0 ? "무제한" : `${c.perUserLimit}회`}</span>
                          {c.expiresAt && <span className="text-[11px] text-gray-400">~ {fmtDateTime(c.expiresAt)}</span>}
                        </div>
                        <div className="flex gap-4 shrink-0">
                          {c.kind !== "reward" && (
                            <button onClick={() => { setIssueTarget(c); setIssueInput(""); }} className="text-xs font-bold text-emerald-400/80 hover:text-emerald-400 transition-colors">지급</button>
                          )}
                          <button onClick={() => { setCouponForm({ id: c._id, code: c.code, name: c.name || "", kind: c.kind || "discount", reward: c.reward || "", rewardRoleId: c.rewardRoleId || "", rewardRoleName: c.rewardRoleName || "", rewardXp: c.rewardXp ? String(c.rewardXp) : "", requiredRoleId: c.requiredRoleId || "", requiredRoleName: c.requiredRoleName || "", type: c.type, value: String(c.value), maxDiscount: c.maxDiscount ? String(c.maxDiscount) : "", minTotal: c.minTotal ? String(c.minTotal) : "", maxUses: c.maxUses ? String(c.maxUses) : "", perUserLimit: String(c.perUserLimit ?? 1), active: c.active, expiresAt: c.expiresAt ? new Date(new Date(c.expiresAt).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "" }); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="text-xs font-bold text-gray-400 hover:text-white transition-colors">수정</button>
                          <button onClick={() => setDeleteTarget({ kind: "coupon", id: c._id })} className="text-xs font-bold text-red-500/70 hover:text-red-500 transition-colors">삭제</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
            </Reveal>
          </>
        )}

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
                        <div className="text-[10px] font-bold text-gray-400">{o.itemType === "physical" ? "기프트카드" : o.itemType === "perk" ? "권한" : "역할"} · {o.userName}</div>
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

      {deleteTarget && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 p-4">
          <div className="bg-[#121212] border border-red-500/30 rounded-3xl w-full max-w-sm p-8 text-center">
            <h2 className="text-xl font-bold text-white mb-3">삭제 확인</h2>
            <p className="text-sm text-gray-400 mb-8">{deleteTarget.kind === "item" ? <>이 상품을 삭제하시겠습니까?<br/>기존 구매 내역은 그대로 유지됩니다.</> : deleteTarget.kind === "banner" ? <>이 배너를 삭제하시겠습니까?</> : <>이 쿠폰을 삭제하시겠습니까?<br/>이미 사용된 내역에는 영향이 없습니다.</>}</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(null)} className="flex-1 py-3 bg-[#2a2a2a] text-white rounded-xl">취소</button>
              <button onClick={executeDelete} className="flex-1 py-3 bg-red-500/80 text-white rounded-xl">삭제</button>
            </div>
          </div>
        </div>
      )}

      {issueTarget && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 p-4">
          <div className="bg-[#121212] border border-white/10 rounded-3xl w-full max-w-sm p-8">
            <h2 className="text-lg font-bold text-white mb-2">쿠폰 지급</h2>
            <p className="text-xs text-gray-400 mb-5">
              <span className="font-black text-white tracking-wide">{issueTarget.code}</span>
              {issueTarget.name ? ` · ${issueTarget.name}` : ""}
            </p>

            <label className="block text-xs font-bold text-gray-400 mb-2">지급 대상</label>
            <input type="text" value={issueInput} onChange={(e) => setIssueInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && issueInput.trim()) issueCoupon(issueInput.trim()); }}
              placeholder="디스코드 닉네임 또는 유저 ID"
              className="w-full bg-transparent border border-white/10 rounded-lg px-4 py-3 text-sm text-white outline-none focus:border-[#e91e3f] mb-3 placeholder:text-gray-500" />
            <p className="text-[10px] text-gray-400 mb-6">XP 기록이 있는 유저만 검색됩니다. 이미 보유 중이면 건너뜁니다.</p>

            <div className="flex gap-3 mb-3">
              <button onClick={() => setIssueTarget(null)} className="flex-1 py-3 bg-[#2a2a2a] text-white rounded-xl">닫기</button>
              <button onClick={() => issueCoupon(issueInput.trim())} disabled={!issueInput.trim() || isIssuing}
                className="flex-1 py-3 bg-[#e91e3f] disabled:opacity-40 text-white rounded-xl font-bold">
                {isIssuing ? "지급 중..." : "지급"}
              </button>
            </div>
            <button onClick={() => issueCoupon("all")} disabled={isIssuing}
              className="w-full py-3 border border-white/15 text-gray-300 hover:text-white rounded-xl text-xs font-bold transition-colors disabled:opacity-40">
              전체 유저에게 지급
            </button>
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
                  <span className={`absolute top-3 left-3 px-2.5 py-1 rounded-full text-[10px] font-black tracking-wide ${form.type === "role" ? "bg-[#e91e3f] text-white" : form.type === "perk" ? "bg-[#2f6fb0] text-white" : "bg-[#131313] text-white"}`}>
                    {form.type === "physical" ? "기프트카드" : form.type === "perk" ? "권한" : "역할"}
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
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overlay-in">
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
