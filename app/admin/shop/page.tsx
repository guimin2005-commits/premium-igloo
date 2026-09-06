"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Reveal, LuxStyles } from "../../components/Lux";
import {
  inputClass,
  fieldNote,
  SectionHead,
  FilterChips,
  EmptyRow,
  ListFrame,
  Btn,
  Toggle,
  useNotice,
  ConfirmDialog,
  useAdminGuard,
  AdminHero,
  AdminTabs,
  TableScroll,
} from "../ui";

// 📌 탭 구성
//    상품·배너·쿠폰·구매내역은 ARCTIC 상점을 채우고 굴리는 일상 작업이다.
//    반면 '시즌 전환'은 길드 전체의 역할 표기를 한 번에 내리는 일회성 조작이라
//    성격이 완전히 다르다. 상품 탭 03 섹션으로 얹혀 있으면 상품을 손보러 들어왔다가
//    스크롤 끝에서 마주치게 된다 — 그래서 별도 탭으로 뺐다.
// desc 에는 화면만 봐서는 모르는 것만 적는다 (지급 시점 · 자동 전환 주기 · 되돌릴 수 없음)
const TAB_META: Record<string, { title: string; desc: string }> = {
  items: { title: "상품 관리", desc: "역할 상품은 구매 시 봇이 자동 지급합니다." },
  banners: { title: "이미지 배너", desc: "배너가 여럿이면 5초마다 자동 전환됩니다." },
  coupons: { title: "쿠폰 관리", desc: "" },
  orders: { title: "구매 내역", desc: "" },
  season: { title: "시즌 전환", desc: "되돌리려면 역할을 손으로 다시 붙여야 합니다." },
};

const TAB_ORDER = [
  { id: "items", short: "상품" },
  { id: "banners", short: "배너" },
  { id: "coupons", short: "쿠폰" },
  { id: "orders", short: "구매 내역" },
  { id: "season", short: "시즌 전환" },
];

const STATUS_LABEL: Record<string, string> = { pending: "처리 대기", completed: "완료", cancelled: "취소" };

// 상품 유형 — 라벨과 배지 색을 실제 상점(ArcticShopBody 의 TYPE_BADGE)과 맞춘다.
// 관리자 쪽에서만 '아이템'을 '역할'로 적어 두면 카드 미리보기가 거짓말을 한다.
const TYPE_OPTIONS = [
  { v: "role", l: "역할" },
  { v: "perk", l: "권한" },
  { v: "item", l: "아이템" },
  { v: "physical", l: "기프트카드" },
];
const TYPE_BADGE: Record<string, { label: string; cls: string }> = {
  role: { label: "역할", cls: "bg-[#e91e3f] text-white" },
  perk: { label: "권한", cls: "bg-[#2f6fb0] text-white" },
  item: { label: "아이템", cls: "bg-[#3f9e93] text-white" },
  physical: { label: "기프트카드", cls: "bg-[#131313] text-white" },
};
const typeLabel = (t: string) => TYPE_BADGE[t]?.label || "역할";

const labelClass = "block text-xs font-bold text-[#5a5a5a] mb-2";

const fmtDateTime = (v: string | Date) => {
  const d = new Date(v);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

// 📌 접이식 묶음 — 상품 폼은 칸이 열 개가 넘어 한 화면에 들어오지 않는다.
//    접어 둬도 무엇이 들어 있는지 알 수 있게 요약을 한 줄 보여 준다.
//    ⚠️ 페이지 컴포넌트 안에서 정의하면 입력할 때마다 다시 마운트돼 포커스가 날아간다 — 모듈 바깥에 둔다.
function FormGroup({
  title,
  summary,
  open,
  onToggle,
  children,
}: {
  title: string;
  summary?: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-black/[0.06]">
      <button
        type="button"
        onClick={onToggle}
        className="w-full py-4 flex items-center justify-between gap-4 text-left outline-none focus:outline-none"
      >
        <span className="min-w-0">
          <span className="block text-sm font-black text-[#131313] tracking-tight">{title}</span>
          {!open && summary && <span className="block mt-1 text-[11px] text-[#5a5a5a] truncate">{summary}</span>}
        </span>
        <span className={`text-[10px] text-[#8a8a8a] shrink-0 transition-transform ${open ? "rotate-180" : ""}`}>▼</span>
      </button>
      {open && <div className="pb-6">{children}</div>}
    </div>
  );
}

export default function AdminShopPage() {
  const { isAdmin, gate } = useAdminGuard();
  const { notify, noticeEl } = useNotice();

  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab") || "items";
  const tab = TAB_META[tabParam] ? tabParam : "items";

  const [items, setItems] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [guildRoles, setGuildRoles] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<{ kind: "item" | "banner" | "coupon"; id: string } | null>(null);
  const [orderFilter, setOrderFilter] = useState("");
  const [noteTarget, setNoteTarget] = useState<any>(null);
  const [noteText, setNoteText] = useState("");
  const [cancelTarget, setCancelTarget] = useState<any>(null);
  const [showPreview, setShowPreview] = useState(false);

  const emptyForm = { id: "", name: "", description: "", imageUrl: "", type: "role", roleId: "", price: "", discountPct: "", stock: "", sortOrder: "", active: true, timed: false, price7: "", price30: "", priceInf: "", detachOnSeason: false };
  const [form, setForm] = useState(emptyForm);
  const [isRoleOpen, setIsRoleOpen] = useState(false);
  const selectedRole = guildRoles.find((r) => r.id === form.roleId);

  // 상품 폼 묶음 열림 상태 — 기본 정보와 가격만 펼쳐 두고 나머지는 요약으로 접는다
  const [openGroups, setOpenGroups] = useState({ basic: true, price: true, stock: false, season: false });
  const toggleGroup = (k: keyof typeof openGroups) => setOpenGroups((g) => ({ ...g, [k]: !g[k] }));

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
  // 전체 지급은 한 번 누르면 서버 전원의 지갑에 들어간다 — 확인을 한 단계 세운다
  const [issueAllConfirm, setIssueAllConfirm] = useState(false);

  const issueCoupon = async (target: string) => {
    if (!issueTarget || isIssuing) return;
    setIsIssuing(true);
    const res = await fetch("/api/shop/coupons/issue", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ couponId: issueTarget._id, target }),
    }).catch(() => null);
    const d = await res?.json().catch(() => null);
    if (res?.ok && d?.success) { notify(d.message || "지급했습니다."); setIssueAllConfirm(false); setIssueTarget(null); setIssueInput(""); }
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

  // ── 시즌 전환 (디스코드 표기 떼기) ────────────
  //    되돌리려면 역할을 손으로 다시 붙여야 하므로, 미리보기를 통과해야 실행 버튼이 열린다
  const [detachPreview, setDetachPreview] = useState<any>(null);
  // "" | "preview" | "run" — 어느 쪽을 누른 건지 알아야 버튼마다 다른 문구를 띄운다
  const [detachBusy, setDetachBusy] = useState("");
  const [detachConfirm, setDetachConfirm] = useState(false);

  const callDetach = async (dryRun: boolean) => {
    if (detachBusy) return null;
    setDetachBusy(dryRun ? "preview" : "run");
    const res = await fetch("/api/season/detach", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dryRun }),
    }).catch(() => null);
    const d = await res?.json().catch(() => null);
    setDetachBusy("");
    if (res?.ok && d?.success) return d;
    notify(d?.message || "처리에 실패했습니다.", true);
    return null;
  };

  const runDetach = async () => {
    if (!detachPreview || detachPreview.matched === 0) return;
    const d = await callDetach(false);
    setDetachConfirm(false);
    if (!d) return;
    // 실행한 목록으로 다시 실행하지 못하게 미리보기를 비운다
    setDetachPreview(null);
    notify(`${(d.updated || 0).toLocaleString()}건의 디스코드 표기를 내렸습니다. 봇이 30초 안에 실제 역할을 정리합니다.`);
  };

  useEffect(() => { if (isAdmin) fetchAll(); }, [isAdmin, fetchAll]);

  // 목록·링크에서 상품을 폼으로 끌어오는 자리가 두 군데였다 — 한 함수로 모은다
  const fillItemForm = useCallback((it: any) => {
    setForm({
      id: it._id, name: it.name, description: it.description || "", imageUrl: it.imageUrl || "",
      type: it.type, roleId: it.roleId || "", price: String(it.price), discountPct: it.discountPct ? String(it.discountPct) : "",
      stock: it.stock < 0 ? "" : String(it.stock), sortOrder: String(it.sortOrder || 0), active: it.active,
      timed: Array.isArray(it.durations) && it.durations.length > 0,
      price7: String(it.durations?.find((d: any) => d.days === 7)?.price ?? ""),
      price30: String(it.durations?.find((d: any) => d.days === 30)?.price ?? ""),
      priceInf: String(it.durations?.find((d: any) => d.days === 0)?.price ?? ""),
      detachOnSeason: !!it.detachOnSeason,
    });
  }, []);

  // 📌 상점 카드의 '수정' 링크(?edit=<id>)로 들어오면 해당 상품을 폼에 채워 둔다
  const editId = searchParams.get("edit");
  useEffect(() => {
    if (!editId || items.length === 0) return;
    const it = items.find((x) => x._id === editId);
    if (!it) return;
    fillItemForm(it);
  }, [editId, items, fillItemForm]);

  // 📌 기간제 역할 — 켠 기간(값이 들어 있는 칸)만 판매 목록에 올린다
  const buildDurations = () => {
    if (!form.timed) return [];
    return [
      { days: 7, price: Math.max(0, Math.floor(Number(form.price7) || 0)) },
      { days: 30, price: Math.max(0, Math.floor(Number(form.price30) || 0)) },
      // days 0 = 무제한. 기간 옵션과 나란히 팔 수 있다.
      { days: 0, price: Math.max(0, Math.floor(Number(form.priceInf) || 0)) },
    ].filter((d) => d.price > 0);
  };

  const saveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch("/api/shop/items", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, roleName: selectedRole?.name || "", durations: buildDurations() }),
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
    setNoteTarget(null); setNoteText(""); setCancelTarget(null);
  };

  // ⚠️ 훅을 모두 부른 뒤에 가린다. 이건 화면을 가리는 장치일 뿐이고 실제 방어는 서버(API)에서 한다.
  if (gate) return gate;

  const meta = TAB_META[tab];
  const shownOrders = orderFilter ? orders.filter((o) => o.status === orderFilter) : orders;
  const pendingCount = orders.filter((o) => o.status === "pending").length;

  // 접힌 묶음에서도 값이 보이도록 한 줄 요약을 만든다
  const discountPct = Math.min(100, Math.max(0, Number(form.discountPct) || 0));
  const salePreview = Math.max(0, Math.floor(((Number(form.price) || 0) * (100 - discountPct)) / 100));
  const basicSummary = [form.name || "이름 없음", typeLabel(form.type), selectedRole?.name].filter(Boolean).join(" · ");
  const priceSummary = Number(form.price) > 0
    ? `${salePreview.toLocaleString()} XP${discountPct > 0 ? ` (-${discountPct}%)` : ""}${form.timed ? ` · 기간제 ${buildDurations().length}종` : ""}`
    : "가격 미입력";
  // 판매 상태는 묶음 밖으로 뺐으므로 요약에서도 뺀다 (항상 보이는 값을 두 번 적지 않는다)
  const stockSummary = `${form.stock === "" ? "재고 무제한" : `재고 ${form.stock}`} · 추천 ${form.sortOrder || 0}`;
  const seasonSummary = form.detachOnSeason ? "시즌 바뀌면 디스코드 역할 뗌" : "디스코드 역할 계속 유지";

  return (
    <main className="w-full flex-1 flex flex-col relative">
      <LuxStyles />

      <AdminHero size="lg" title={meta.title} desc={meta.desc} width="max-w-4xl" />
      <AdminTabs tabs={TAB_ORDER} current={tab} hrefOf={(id) => `/admin/shop?tab=${id}`} width="max-w-4xl" />

      <div className="w-full max-w-4xl mx-auto px-6 pb-16 flex-1 flex flex-col space-y-14">

        {/* ═══ 상품 관리 ═══ */}
        {tab === "items" && (
          <>
            <Reveal>
            <section>
              <SectionHead no="01" title={form.id ? "상품 수정" : "상품 등록"} right={
                <Btn type="button" variant="ghost" onClick={() => setShowPreview(true)} className="flex items-center gap-1.5 whitespace-nowrap">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  카드 미리보기
                </Btn>
              } />
              <form onSubmit={saveItem}>
                <div className="border-t border-black/[0.06]">

                  {/* ── 기본 정보 ── */}
                  <FormGroup title="기본 정보" summary={basicSummary} open={openGroups.basic} onToggle={() => toggleGroup("basic")}>
                    <div className="mb-4">
                      <label className={labelClass}>상품명 <span className="text-[#e91e3f]">*</span></label>
                      <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="예: [XP] Boost+" className={inputClass} />
                    </div>

                    <div className="mb-4">
                      <label className={labelClass}>상품 유형 <span className="text-[#e91e3f]">*</span></label>
                      <FilterChips options={TYPE_OPTIONS} value={form.type} onChange={(v) => setForm({ ...form, type: v })} />
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
                    </div>

                    {/* 역할 상품일 때만 역할 선택 — 드롭다운이 아래 요소를 덮도록 열릴 때 z를 올린다 */}
                    {(form.type === "role" || form.type === "perk" || form.type === "item") && (
                      <div className={`relative ${isRoleOpen ? "z-50" : ""}`}>
                        <label className={labelClass}>지급할 역할 <span className="text-[#e91e3f]">*</span></label>
                        <button type="button" onClick={() => setIsRoleOpen(!isRoleOpen)} className={`${inputClass} flex items-center justify-between text-left`}>
                          {selectedRole ? (
                            <span className="flex items-center gap-2.5">
                              <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: selectedRole.color }}></span>
                              <span className="font-bold">{selectedRole.name}</span>
                            </span>
                          ) : <span className="text-[#8a8a8a]">역할을 선택하세요</span>}
                          <span className="text-[10px] text-[#5a5a5a]">▼</span>
                        </button>
                        {isRoleOpen && (
                          <>
                            <div className="fixed inset-0 z-40" onClick={() => setIsRoleOpen(false)}></div>
                            <div className="absolute top-full left-0 w-full mt-1.5 bg-[#ffffff] border border-black/10 rounded-xl overflow-hidden shadow-[0_24px_60px_-24px_rgba(0,0,0,0.28)] z-50 max-h-64 overflow-y-auto [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-[#e6e3de]">
                              {guildRoles.map((r) => (
                                <button key={r.id} type="button" onClick={() => { setForm({ ...form, roleId: r.id }); setIsRoleOpen(false); }}
                                  className={`w-full text-left px-4 py-3 text-sm flex items-center gap-2.5 transition-colors ${form.roleId === r.id ? "bg-[#e91e3f]/15 text-[#e91e3f] font-bold" : "text-[#4b4b4b] hover:bg-black/5"}`}>
                                  <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: r.color }}></span>
                                  {r.name}
                                </button>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </FormGroup>

                  {/* ── 가격 · 기간 ── */}
                  <FormGroup title="가격 · 기간" summary={priceSummary} open={openGroups.price} onToggle={() => toggleGroup("price")}>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className={labelClass}>정가 (XP) <span className="text-[#e91e3f]">*</span></label>
                        <input type="number" min={1} value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="예: 500000" className={inputClass} />
                      </div>
                      <div>
                        <label className={labelClass}>할인율 (%)</label>
                        <input type="number" min={0} max={100} value={form.discountPct} onChange={(e) => setForm({ ...form, discountPct: e.target.value })} placeholder="0" className={inputClass} />
                        {discountPct > 0 && Number(form.price) > 0 && (
                          <p className="text-[10px] font-bold text-[#e91e3f] mt-1.5">판매가 {salePreview.toLocaleString()} XP</p>
                        )}
                      </div>
                    </div>

                    {/* 📌 기간제 역할 — 역할·권한·아이템만 (기프트카드는 기간 개념이 없다) */}
                    {form.type !== "physical" && (
                      <div className="mt-6">
                        <Toggle on={form.timed} onClick={() => setForm({ ...form, timed: !form.timed })}
                          onLabel="기간제 역할" offLabel="영구 보유" />
                        {/* 회수는 화면 밖에서 일어나는 일이라 이것만 남긴다 */}
                        {form.timed && (
                          <p className={fieldNote}>기간이 지나면 봇이 역할을 자동 회수합니다 (무제한은 회수하지 않습니다).</p>
                        )}

                        {/* 기간이 열릴 때 높이까지 함께 펼친다 */}
                        <div className="grid transition-[grid-template-rows,opacity] duration-500 ease-out" style={{ gridTemplateRows: form.timed ? "1fr" : "0fr", opacity: form.timed ? 1 : 0 }}>
                          <div className="overflow-hidden">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                              {([{ k: "price7", d: 7 }, { k: "price30", d: 30 }] as const).map(({ k, d }) => {
                                const raw = Number((form as any)[k]) || 0;
                                return (
                                  <div key={k}>
                                    <label className={labelClass}>{d}일 가격 (XP)</label>
                                    <input type="number" min={0} value={(form as any)[k]}
                                      onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                                      placeholder={d === 7 ? "예: 30000" : "예: 100000"} className={inputClass} />
                                    <p className={fieldNote}>
                                      {raw > 0
                                        ? discountPct > 0
                                          ? `판매가 ${Math.max(0, Math.floor((raw * (100 - discountPct)) / 100)).toLocaleString()} XP (${discountPct}% 할인)`
                                          : `판매가 ${raw.toLocaleString()} XP`
                                        : "비우면 이 기간은 팔지 않습니다"}
                                    </p>
                                  </div>
                                );
                              })}
                            </div>
                            {/* 무제한(days 0)은 이 화면에 입력 칸이 없다 — 저장 때 값은 그대로 유지되므로 보이기라도 한다 */}
                            {Number(form.priceInf) > 0 && (
                              <p className={`${fieldNote} mt-3`}>
                                무제한 옵션 <span className="font-bold text-[#3a3a3a] tabular-nums">{Number(form.priceInf).toLocaleString()} XP</span> — 기존 값이 그대로 유지됩니다
                              </p>
                            )}
                            {form.timed && buildDurations().length === 0 && (
                              <p className="text-[10px] font-bold text-amber-700 mt-3">기간 가격을 하나 이상 넣어야 기간제로 저장됩니다.</p>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </FormGroup>

                  {/* ── 재고 · 순서 ── */}
                  <FormGroup title="재고 · 순서" summary={stockSummary} open={openGroups.stock} onToggle={() => toggleGroup("stock")}>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className={labelClass}>재고</label>
                        <input type="number" min={-1} value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} placeholder="비우면 무제한" className={inputClass} />
                      </div>
                      <div>
                        <label className={labelClass}>추천 순서</label>
                        <input type="number" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} placeholder="0" className={inputClass} />
                        <p className={fieldNote}>작을수록 상점 앞쪽 (추천순 기준)</p>
                      </div>
                    </div>
                  </FormGroup>

                  {/* ── 시즌 동작 ── 기프트카드는 시즌과 무관하므로 아예 감춘다 */}
                  {form.type !== "physical" && (
                    <FormGroup title="시즌 동작" summary={seasonSummary} open={openGroups.season} onToggle={() => toggleGroup("season")}>
                      {/* 시즌 전환 때 디스코드 역할만 떼고 사이트 인벤토리에는 남긴다 */}
                      <Toggle disabled={form.type === "perk"} on={form.type !== "perk" && form.detachOnSeason} onClick={() => setForm({ ...form, detachOnSeason: !form.detachOnSeason })}
                        onLabel="시즌 바뀌면 디스코드 역할 뗌" offLabel="디스코드 역할 계속 유지" />
                      <p className={fieldNote}>
                        {form.detachOnSeason
                          ? "소유와 인벤토리는 그대로 두고 디스코드 표기만 뗍니다."
                          : "역할 자체가 기능인 권한 상품은 이대로 두세요."}
                      </p>
                    </FormGroup>
                  )}

                  {/* 📌 판매 상태는 접이식 묶음 밖에 둔다 — 안에 있으면 등록 화면을 끝까지 봐도 보이지 않는다 */}
                  <div className="py-4">
                    <label className={labelClass}>판매 상태</label>
                    <Toggle on={form.active} onClick={() => setForm({ ...form, active: !form.active })} onLabel="판매 중" offLabel="숨김" />
                  </div>
                </div>

                <div className="flex gap-3 mt-6">
                  <Btn type="submit" className="w-full md:w-auto md:px-10 py-3.5">{form.id ? "수정 저장" : "상품 등록"}</Btn>
                  {form.id && <Btn type="button" variant="ghost" onClick={() => setForm(emptyForm)} className="px-6 py-3.5">취소</Btn>}
                </div>
              </form>
            </section>
            </Reveal>

            <Reveal>
            <section>
              <SectionHead no="02" title={`등록된 상품 (${items.length})`} />
              {isLoading ? <EmptyRow>불러오는 중...</EmptyRow>
                : items.length === 0 ? <EmptyRow>등록된 상품이 없습니다.</EmptyRow>
                : (
                <TableScroll>
                  <ListFrame>
                    {items.map((it) => (
                      <div key={it._id} className="py-4 flex flex-col md:flex-row md:items-center gap-3 md:gap-4">
                        <div className="w-12 h-12 rounded-lg bg-black/5 overflow-hidden shrink-0">
                          {it.imageUrl && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={it.imageUrl} alt="" className="w-full h-full object-cover" />
                          )}
                        </div>
                        <div className="min-w-0 md:w-48 shrink-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-[#131313] truncate">{it.name}</span>
                            {!it.active && <span className="text-[10px] font-bold text-[#5a5a5a] border border-black/15 px-1.5 rounded shrink-0">숨김</span>}
                          </div>
                          <span className="text-[10px] font-bold text-[#5a5a5a]">{it.type === "physical" ? "기프트카드" : `${typeLabel(it.type)} · ${it.roleName || it.roleId}`}</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 flex-1">
                          <span className="text-[11px] font-bold text-[#e91e3f] tabular-nums">{Math.max(0, Math.floor((it.price * (100 - (it.discountPct || 0))) / 100)).toLocaleString()} XP{it.discountPct > 0 ? ` (-${it.discountPct}%)` : ""}</span>
                          <span className="text-[11px] font-bold text-[#5a5a5a]">{it.stock < 0 ? "재고 무제한" : `재고 ${it.stock}`}</span>
                          <span className="text-[11px] text-[#5a5a5a]">{it.soldCount || 0}개 판매</span>
                          <span className="text-[11px] text-[#5a5a5a]">추천 {it.sortOrder || 0}</span>
                        </div>
                        <div className="flex gap-4 shrink-0">
                          <button onClick={() => { fillItemForm(it); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="text-xs font-bold text-[#5a5a5a] hover:text-[#131313] transition-colors">수정</button>
                          <button onClick={() => setDeleteTarget({ kind: "item", id: it._id })} className="text-xs font-bold text-[#8a8a8a] hover:text-[#e91e3f] transition-colors">삭제</button>
                        </div>
                      </div>
                    ))}
                  </ListFrame>
                </TableScroll>
              )}
            </section>
            </Reveal>
          </>
        )}

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
                    권장 크기 <span className="text-[#3a3a3a] font-bold tabular-nums">2400 × 600 px</span> (4:1) · 최소 1200 × 300 px · JPG/PNG/WebP
                  </p>
                  <p className={fieldNote}>
                    모바일에서는 3:1로 잘립니다 — 글자 · 로고는 가운데 <span className="text-[#3a3a3a] font-bold">가로 75%</span> 안에.
                  </p>
                  {bannerSize && (() => {
                    const ratio = bannerSize.w / bannerSize.h;
                    const tooSmall = bannerSize.w < 1200;
                    const offRatio = ratio < 3.4 || ratio > 4.6;
                    const ok = !tooSmall && !offRatio;
                    return (
                      <p className={`text-[10px] mt-1.5 font-bold ${ok ? "text-emerald-700" : "text-amber-700"}`}>
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
                {/* 제목 · 부제가 어떻게 얹히는지는 아래 미리보기가 그대로 보여 준다 */}

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
                  <label className={labelClass}>노출 상태</label>
                  <Toggle on={bannerForm.active} onClick={() => setBannerForm({ ...bannerForm, active: !bannerForm.active })}
                    onLabel="노출 중" offLabel="숨김" />
                </div>

                {/* 미리보기 */}
                {bannerForm.imageUrl && (
                  <div className="mb-6">
                    <div className="text-[10px] font-black tracking-[0.25em] text-[#5a5a5a] uppercase mb-2">Preview</div>
                    <div className="relative rounded-2xl overflow-hidden border border-black/10 aspect-[4/1] bg-[#ffffff]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={bannerForm.imageUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
                      {(bannerForm.title || bannerForm.subtitle) && (
                        <div className="absolute inset-0 bg-gradient-to-r from-black/55 via-black/20 to-transparent flex flex-col justify-center px-8">
                          {bannerForm.title && <h3 className="text-xl font-black tracking-tight text-[#131313] mb-1">{bannerForm.title}</h3>}
                          {bannerForm.subtitle && <p className="text-[12px] text-[#131313]/85">{bannerForm.subtitle}</p>}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex gap-3">
                  <Btn type="submit" className="w-full md:w-auto md:px-10 py-3.5">{bannerForm.id ? "수정 저장" : "배너 등록"}</Btn>
                  {bannerForm.id && <Btn type="button" variant="ghost" onClick={() => setBannerForm(EMPTY_BANNER)} className="px-6 py-3.5">취소</Btn>}
                </div>
              </form>
            </section>
            </Reveal>

            <Reveal>
            <section>
              <SectionHead no="02" title={`등록된 배너 (${banners.length})`} />
              {isLoading ? <EmptyRow>불러오는 중...</EmptyRow>
                : banners.length === 0 ? <EmptyRow>등록된 배너가 없습니다.</EmptyRow>
                : (
                <TableScroll>
                  <ListFrame>
                    {banners.map((b) => (
                      <div key={b._id} className="py-4 flex flex-col md:flex-row md:items-center gap-3 md:gap-4">
                        <div className="w-28 h-14 rounded-lg bg-black/5 overflow-hidden shrink-0">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={b.imageUrl} alt="" className="w-full h-full object-cover" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-[#131313] truncate">{b.title || "(제목 없음)"}</span>
                            {!b.active && <span className="text-[10px] font-bold text-[#5a5a5a] border border-black/15 px-1.5 rounded shrink-0">숨김</span>}
                          </div>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
                            {b.subtitle && <span className="text-[11px] text-[#5a5a5a] truncate">{b.subtitle}</span>}
                            {b.link && <span className="text-[11px] font-bold text-[#5a5a5a]">→ {b.link}</span>}
                            <span className="text-[11px] text-[#5a5a5a]">순서 {b.sortOrder || 0}</span>
                          </div>
                        </div>
                        <div className="flex gap-4 shrink-0">
                          <button onClick={() => { setBannerForm({ id: b._id, imageUrl: b.imageUrl, title: b.title || "", subtitle: b.subtitle || "", link: b.link || "", sortOrder: String(b.sortOrder || 0), active: b.active }); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="text-xs font-bold text-[#5a5a5a] hover:text-[#131313] transition-colors">수정</button>
                          <button onClick={() => setDeleteTarget({ kind: "banner", id: b._id })} className="text-xs font-bold text-[#8a8a8a] hover:text-[#e91e3f] transition-colors">삭제</button>
                        </div>
                      </div>
                    ))}
                  </ListFrame>
                </TableScroll>
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
                <Btn type="button" variant="ghost" onClick={migrateCodes} disabled={isMigrating} className="whitespace-nowrap">
                  {isMigrating ? "이전 중..." : "예전 코드 가져오기"}
                </Btn>
              } />
              <form onSubmit={saveCoupon}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className={labelClass}>쿠폰 코드 <span className="text-[#e91e3f]">*</span></label>
                    <input type="text" value={couponForm.code} onChange={(e) => setCouponForm({ ...couponForm, code: e.target.value.toUpperCase() })}
                      placeholder="예: WELCOME10" className={`${inputClass} uppercase`} />
                    <p className={fieldNote}>대문자로 저장됩니다</p>
                  </div>
                  <div>
                    <label className={labelClass}>쿠폰 이름</label>
                    <input type="text" value={couponForm.name} onChange={(e) => setCouponForm({ ...couponForm, name: e.target.value })}
                      placeholder="예: 신규 가입 축하 쿠폰" className={inputClass} />
                    <p className={fieldNote}>주문서에 표시될 이름</p>
                  </div>
                </div>

                {/* 쿠폰 종류 — 보상형(역할·XP 지급) / 할인형(결제 할인).
                    설명을 함께 읽어야 고를 수 있어 칩 대신 카드로 둔다 */}
                <div className="mb-4">
                  <label className={labelClass}>쿠폰 종류 <span className="text-[#e91e3f]">*</span></label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {[
                      { v: "discount", l: "할인형", d: "ARCTIC 결제 시 금액 할인" },
                      { v: "reward", l: "보상형", d: "입력 즉시 역할·XP 지급" },
                    ].map((o) => (
                      <button key={o.v} type="button" onClick={() => setCouponForm({ ...couponForm, kind: o.v })}
                        className={`py-3 px-4 rounded-lg text-left border transition-colors outline-none focus:outline-none ${
                          (couponForm.kind || "discount") === o.v ? "bg-[#e91e3f]/15 text-[#e91e3f] border-[#e91e3f]/40" : "text-[#4b4b4b] border-black/10 hover:text-[#131313]"
                        }`}>
                        <span className="block text-xs font-bold">{o.l}</span>
                        <span className="block text-[10px] text-[#5a5a5a] mt-0.5">{o.d}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* ── 보상형 설정 ── */}
                {couponForm.kind === "reward" && (
                  <div className="mb-4 space-y-4 p-4 rounded-lg border border-black/10">
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
                          className={`${inputClass} [&>option]:bg-[#ffffff]`}>
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
                        className={`${inputClass} [&>option]:bg-[#ffffff]`}>
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
                    <FilterChips
                      options={[{ v: "percent", l: "정률 (%)" }, { v: "flat", l: "정액 (XP)" }]}
                      value={couponForm.type}
                      onChange={(v) => setCouponForm({ ...couponForm, type: v })}
                    />
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
                      className={inputClass} />
                    <p className={fieldNote}>비우면 무기한</p>
                  </div>
                </div>

                <div className="mb-6">
                  <label className={labelClass}>사용 상태</label>
                  <Toggle on={couponForm.active} onClick={() => setCouponForm({ ...couponForm, active: !couponForm.active })}
                    onLabel="사용 가능" offLabel="사용 중지" />
                </div>

                <div className="flex gap-3">
                  <Btn type="submit" className="w-full md:w-auto md:px-10 py-3.5">{couponForm.id ? "수정 저장" : "쿠폰 발급"}</Btn>
                  {couponForm.id && <Btn type="button" variant="ghost" onClick={() => setCouponForm(EMPTY_COUPON)} className="px-6 py-3.5">취소</Btn>}
                </div>
              </form>
            </section>
            </Reveal>

            <Reveal>
            <section>
              <SectionHead no="02" title={`발급된 쿠폰 (${coupons.length})`} />
              {isLoading ? <EmptyRow>불러오는 중...</EmptyRow>
                : coupons.length === 0 ? <EmptyRow>발급된 쿠폰이 없습니다.</EmptyRow>
                : (
                <TableScroll>
                  <ListFrame>
                    {coupons.map((c) => {
                      const expired = c.expiresAt && new Date(c.expiresAt) < new Date();
                      const exhausted = c.maxUses > 0 && c.usedCount >= c.maxUses;
                      const state = !c.active ? "중지" : expired ? "만료" : exhausted ? "소진" : "사용 가능";
                      return (
                        <div key={c._id} className="py-4 flex flex-col md:flex-row md:items-center gap-3 md:gap-4">
                          <div className="flex items-center gap-2.5 md:w-56 shrink-0 min-w-0">
                            <span className={`text-[10px] font-black px-2 py-0.5 rounded shrink-0 ${
                              state === "사용 가능" ? "bg-[#e91e3f] text-white" : "bg-black/10 text-[#4b4b4b]"}`}>{state}</span>
                            <div className="min-w-0">
                              <div className="text-sm font-black text-[#131313] tracking-wide truncate">{c.code}</div>
                              {c.name && <div className="text-[10px] text-[#5a5a5a] truncate">{c.name}</div>}
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 flex-1 min-w-0">
                            <span className={`text-[10px] font-black px-1.5 py-0.5 rounded shrink-0 ${
                              c.kind === "reward" ? "bg-[#2f6fb0]/15 text-[#2f6fb0]" : "bg-black/10 text-[#4b4b4b]"}`}>
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
                              <span className="text-[11px] text-[#5a5a5a]">{c.requiredRoleName} 전용</span>
                            )}
                            {c.kind !== "reward" && c.minTotal > 0 && <span className="text-[11px] text-[#5a5a5a]">{c.minTotal.toLocaleString()} XP 이상</span>}
                            <span className="text-[11px] text-[#5a5a5a]">사용 {c.usedCount || 0}{c.maxUses > 0 ? ` / ${c.maxUses}` : ""}</span>
                            <span className="text-[11px] text-[#5a5a5a]">1인 {c.perUserLimit === 0 ? "무제한" : `${c.perUserLimit}회`}</span>
                            {c.expiresAt && <span className="text-[11px] text-[#5a5a5a]">~ {fmtDateTime(c.expiresAt)}</span>}
                          </div>
                          <div className="flex gap-4 shrink-0">
                            {c.kind !== "reward" && (
                              <button onClick={() => { setIssueTarget(c); setIssueInput(""); }} className="text-xs font-bold text-emerald-700/80 hover:text-emerald-700 transition-colors">지급</button>
                            )}
                            <button onClick={() => { setCouponForm({ id: c._id, code: c.code, name: c.name || "", kind: c.kind || "discount", reward: c.reward || "", rewardRoleId: c.rewardRoleId || "", rewardRoleName: c.rewardRoleName || "", rewardXp: c.rewardXp ? String(c.rewardXp) : "", requiredRoleId: c.requiredRoleId || "", requiredRoleName: c.requiredRoleName || "", type: c.type, value: String(c.value), maxDiscount: c.maxDiscount ? String(c.maxDiscount) : "", minTotal: c.minTotal ? String(c.minTotal) : "", maxUses: c.maxUses ? String(c.maxUses) : "", perUserLimit: String(c.perUserLimit ?? 1), active: c.active, expiresAt: c.expiresAt ? new Date(new Date(c.expiresAt).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "" }); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="text-xs font-bold text-[#5a5a5a] hover:text-[#131313] transition-colors">수정</button>
                            <button onClick={() => setDeleteTarget({ kind: "coupon", id: c._id })} className="text-xs font-bold text-[#8a8a8a] hover:text-[#e91e3f] transition-colors">삭제</button>
                          </div>
                        </div>
                      );
                    })}
                  </ListFrame>
                </TableScroll>
              )}
            </section>
            </Reveal>
          </>
        )}

        {/* ═══ 구매 내역 ═══ */}
        {tab === "orders" && (
          <Reveal>
          <section>
            <SectionHead no="01" title={`구매 내역 (${orders.length})`} />
            {/* 필터는 제목 옆이 아니라 아래 한 줄로 — 좁은 화면에서 제목과 서로 밀지 않는다 */}
            <FilterChips
              className="mb-5"
              options={[{ v: "", l: "전체" }, { v: "pending", l: `대기 ${pendingCount}` }, { v: "completed", l: "완료" }, { v: "cancelled", l: "취소" }]}
              value={orderFilter}
              onChange={setOrderFilter}
            />
            {isLoading ? <EmptyRow>불러오는 중...</EmptyRow>
              : shownOrders.length === 0 ? <EmptyRow>구매 내역이 없습니다.</EmptyRow>
              : (
              <TableScroll>
                <ListFrame>
                  {shownOrders.map((o) => (
                    <div key={o._id} className="py-4">
                      <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-4">
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded shrink-0 w-fit ${
                          o.status === "completed" ? "bg-emerald-500/15 text-emerald-700"
                          : o.status === "cancelled" ? "bg-red-500/15 text-red-600"
                          : "bg-[#e91e3f] text-white"}`}>
                          {STATUS_LABEL[o.status]}
                        </span>
                        <div className="min-w-0 md:w-44 shrink-0">
                          <div className="text-sm font-bold text-[#131313] truncate">{o.itemName}</div>
                          <div className="text-[10px] font-bold text-[#5a5a5a]">{typeLabel(o.itemType)} · {o.userName}</div>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 flex-1">
                          <span className="text-[11px] font-bold text-[#e91e3f] tabular-nums">{o.price.toLocaleString()} XP</span>
                          <span className="text-[11px] text-[#5a5a5a]">{fmtDateTime(o.createdAt)}</span>
                          {o.error && <span className="text-[11px] font-bold text-red-600">지급 실패: {o.error}</span>}
                        </div>
                        {o.status === "pending" && (
                          <div className="flex gap-4 shrink-0">
                            {o.itemType === "physical" && (
                              <button onClick={() => { setNoteTarget(o); setNoteText(""); }} className="text-xs font-bold text-emerald-700/80 hover:text-emerald-700 transition-colors">발송 처리</button>
                            )}
                            <button onClick={() => setCancelTarget(o)} className="text-xs font-bold text-[#8a8a8a] hover:text-[#e91e3f] transition-colors">취소·환불</button>
                          </div>
                        )}
                      </div>
                      {o.contact && (
                        <div className="mt-2 md:ml-[4.5rem] text-[11px] text-[#4b4b4b] bg-black/[0.03] border border-black/[0.06] rounded-lg px-3 py-2 whitespace-pre-wrap break-words">
                          <span className="font-bold text-[#5a5a5a]">수령 정보 · </span>{o.contact}
                        </div>
                      )}
                      {o.adminNote && <div className="mt-1.5 md:ml-[4.5rem] text-[11px] text-[#5a5a5a]">메모: {o.adminNote}</div>}
                    </div>
                  ))}
                </ListFrame>
              </TableScroll>
            )}
            <p className="mt-6 text-xs text-[#5a5a5a] leading-relaxed break-keep">
              역할 상품은 봇이 30초 주기로 자동 지급합니다. 취소하면 XP가 환불되고 재고가 복구됩니다.
            </p>
          </section>
          </Reveal>
        )}

        {/* ═══ 시즌 전환 ═══ */}
        {tab === "season" && (
          <Reveal>
          <section>
            <SectionHead no="01" title="디스코드 역할 떼기" />
            {/* 대상에서 무엇이 빠지는지 · 언제 실제로 떨어지는지는 화면에 안 나온다 — 그것만 남긴다 */}
            <p className="text-xs text-[#5a5a5a] leading-relaxed mb-6 break-keep">
              소유와 사이트 인벤토리는 그대로 두고 <span className="font-bold text-[#3a3a3a]">디스코드 표기만</span> 내립니다.
              권한 상품과 보호 역할은 대상에서 빠지며, 실제 역할 제거는 봇이 30초 주기로 처리합니다.
            </p>

            {/* 모바일에서는 flex-col 에 gap 이 먹지 않아 버튼 간격을 마진으로 준다 */}
            <div className="flex flex-col md:flex-row md:gap-3 mb-6">
              <Btn type="button" variant="ghost" disabled={!!detachBusy}
                onClick={async () => { const d = await callDetach(true); if (d) setDetachPreview(d); }}
                className="w-full md:w-auto md:px-8 py-3.5 mb-3 md:mb-0">
                {detachBusy === "preview" ? "확인 중..." : "대상 미리보기"}
              </Btn>
              <Btn type="button" variant="danger" onClick={() => setDetachConfirm(true)}
                disabled={!detachPreview || detachPreview.matched === 0 || !!detachBusy}
                className="w-full md:w-auto md:px-10 py-3.5">
                {detachBusy === "run" ? "처리 중..." : "디스코드 역할 떼기 실행"}
              </Btn>
            </div>

            {!detachPreview ? (
              <p className={fieldNote}>먼저 대상을 미리보기 해야 실행할 수 있습니다.</p>
            ) : detachPreview.matched === 0 ? (
              <EmptyRow>표기를 뗄 대상이 없습니다.</EmptyRow>
            ) : (
              <TableScroll>
                <ListFrame>
                  {detachPreview.items.map((row: any) => (
                    <div key={`${row.roleId}-${row.itemName}`} className="py-3.5 md:flex md:items-center md:gap-4">
                      <span className="block text-sm font-bold text-[#131313] truncate md:w-56 md:shrink-0">{row.itemName}</span>
                      <span className="block mt-0.5 md:mt-0 text-[11px] text-[#5a5a5a] truncate md:flex-1 md:min-w-0">
                        {guildRoles.find((r) => r.id === row.roleId)?.name || row.roleId}
                      </span>
                      <span className="block mt-1 md:mt-0 text-[11px] font-bold text-[#e91e3f] tabular-nums md:shrink-0">{row.count.toLocaleString()}건</span>
                    </div>
                  ))}
                  <div className="py-3.5 flex items-center justify-between">
                    <span className="text-xs font-black text-[#131313]">합계</span>
                    <span className="text-xs font-black text-[#e91e3f] tabular-nums">{detachPreview.matched.toLocaleString()}건</span>
                  </div>
                </ListFrame>
              </TableScroll>
            )}
          </section>
          </Reveal>
        )}
      </div>

      {/* ── 삭제 확인 ── */}
      <ConfirmDialog
        open={!!deleteTarget}
        danger
        title="삭제 확인"
        confirmLabel="삭제"
        body={
          deleteTarget?.kind === "item" ? <>이 상품을 삭제하시겠습니까?<br />기존 구매 내역은 그대로 유지됩니다.</>
          : deleteTarget?.kind === "banner" ? <>이 배너를 삭제하시겠습니까?</>
          : <>이 쿠폰을 삭제하시겠습니까?<br />이미 사용된 내역에는 영향이 없습니다.</>
        }
        onConfirm={executeDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* ── 구매 취소·환불 확인 — XP를 되돌려 주는 조작이라 한 번 묻는다 ── */}
      <ConfirmDialog
        open={!!cancelTarget}
        danger
        title="구매 취소 · 환불"
        confirmLabel="취소하고 환불"
        body={cancelTarget ? (
          <>
            <span className="block font-bold text-[#131313]">{cancelTarget.itemName}</span>
            <span className="block mb-3">{cancelTarget.userName} · {(cancelTarget.price || 0).toLocaleString()} XP</span>
            XP를 환불하고 재고를 되돌립니다. 되돌리려면 유저가 다시 구매해야 합니다.
          </>
        ) : null}
        onConfirm={() => cancelTarget && processOrder(cancelTarget._id, "cancelled")}
        onCancel={() => setCancelTarget(null)}
      />

      {/* ── 시즌 전환 실행 확인 — 무엇이 얼마나 바뀌는지 보여 준 뒤 묻는다 ── */}
      <ConfirmDialog
        open={detachConfirm}
        danger
        busy={detachBusy === "run"}
        title="디스코드 역할 떼기"
        confirmLabel="실행"
        body={detachPreview ? (
          <>
            <span className="block mb-3">
              구매 <span className="font-bold text-[#131313] tabular-nums">{detachPreview.matched.toLocaleString()}건</span>의 디스코드 역할 표기를 내립니다.
            </span>
            <span className="block border-y border-black/[0.06] py-2 mb-3 max-h-40 overflow-y-auto no-bar">
              {detachPreview.items.slice(0, 6).map((row: any) => (
                <span key={`${row.roleId}-${row.itemName}`} className="flex items-center justify-between gap-3 py-1 text-[11px]">
                  <span className="truncate font-bold text-[#131313]">{row.itemName}</span>
                  <span className="shrink-0 font-bold text-[#e91e3f] tabular-nums">{row.count.toLocaleString()}건</span>
                </span>
              ))}
              {detachPreview.items.length > 6 && (
                <span className="block pt-1 text-[11px] text-[#8a8a8a]">외 {detachPreview.items.length - 6}종</span>
              )}
            </span>
            소유와 사이트 인벤토리는 그대로 유지되지만, 되돌리려면 역할을 손으로 다시 붙여야 합니다.
          </>
        ) : null}
        onConfirm={runDetach}
        onCancel={() => setDetachConfirm(false)}
      />

      {/* ── 쿠폰 지급 ── */}
      {issueTarget && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overlay-in">
          <div className="bg-[#ffffff] border border-black/10 rounded-3xl w-full max-w-sm p-8 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.28)]">
            <h2 className="text-lg font-bold text-[#131313] mb-2">쿠폰 지급</h2>
            <p className="text-xs text-[#5a5a5a] mb-5">
              <span className="font-black text-[#131313] tracking-wide">{issueTarget.code}</span>
              {issueTarget.name ? ` · ${issueTarget.name}` : ""}
            </p>

            <label className={labelClass}>지급 대상</label>
            <input type="text" value={issueInput} onChange={(e) => setIssueInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && issueInput.trim()) issueCoupon(issueInput.trim()); }}
              placeholder="디스코드 닉네임 또는 유저 ID" className={inputClass} />
            <p className={`${fieldNote} mb-6`}>XP 기록이 있는 유저만 검색되고, 이미 보유 중이면 건너뜁니다.</p>

            <div className="flex gap-3 mb-3">
              <Btn variant="ghost" onClick={() => setIssueTarget(null)} className="flex-1 py-3">닫기</Btn>
              <Btn onClick={() => issueCoupon(issueInput.trim())} disabled={!issueInput.trim() || isIssuing} className="flex-1 py-3">
                {isIssuing ? "지급 중..." : "지급"}
              </Btn>
            </div>
            {/* 바로 실행하지 않는다 — 확인 모달을 거친다 */}
            <Btn variant="ghost" onClick={() => setIssueAllConfirm(true)} disabled={isIssuing} className="w-full py-3">
              전체 유저에게 지급
            </Btn>
          </div>
        </div>
      )}

      {/* ── 전체 지급 확인 — 한 번에 전 유저 지갑에 들어가고 회수할 방법이 없다 ── */}
      <ConfirmDialog
        open={issueAllConfirm}
        danger
        busy={isIssuing}
        title="전체 유저에게 지급"
        confirmLabel="지급"
        body={issueTarget ? (
          <>
            <span className="block font-black text-[#131313] tracking-wide">{issueTarget.code}</span>
            {issueTarget.name && <span className="block mb-3">{issueTarget.name}</span>}
            XP 기록이 있는 전 유저의 지갑에 들어가며, 지급 후에는 되돌릴 수 없습니다.
          </>
        ) : null}
        onConfirm={() => issueCoupon("all")}
        onCancel={() => setIssueAllConfirm(false)}
      />

      {/* ── 기프트카드 발송 처리 ── */}
      {noteTarget && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overlay-in">
          <div className="bg-[#ffffff] border border-black/10 rounded-3xl w-full max-w-sm p-8 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.28)]">
            <h2 className="text-lg font-bold text-[#131313] mb-2">발송 처리</h2>
            <p className="text-xs text-[#5a5a5a] mb-5">{noteTarget.userName} · {noteTarget.itemName}</p>
            {noteTarget.contact && (
              <div className="text-[11px] text-[#4b4b4b] bg-black/[0.03] border border-black/[0.06] rounded-lg px-3 py-2 mb-4 whitespace-pre-wrap">{noteTarget.contact}</div>
            )}
            <input type="text" value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="운송장 번호 등 메모 (선택)"
              className={`${inputClass} mb-6`} />
            <div className="flex gap-3">
              <Btn variant="ghost" onClick={() => setNoteTarget(null)} className="flex-1 py-3">닫기</Btn>
              <Btn onClick={() => processOrder(noteTarget._id, "completed", noteText)} className="flex-1 py-3">완료 처리</Btn>
            </div>
          </div>
        </div>
      )}

      {/* 📌 카드 미리보기 — 상점(라이트 톤)에서 실제로 어떻게 보이는지 그대로 렌더 */}
      {showPreview && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overlay-in" onClick={() => setShowPreview(false)}>
          <div className="w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-black tracking-[0.3em] text-[#4b4b4b] uppercase">Shop Preview</span>
              <button onClick={() => setShowPreview(false)} className="p-1.5 text-[#4b4b4b] hover:text-[#131313] transition-colors outline-none focus:outline-none">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {/* 상점 배경 위에 실제 카드 마크업 그대로 */}
            <div className="bg-[#f4f3f2] rounded-2xl p-5">
              <div className="bg-white rounded-2xl border border-[#dedddb] overflow-hidden shadow-[0_2px_12px_rgba(0,0,0,0.04)] flex flex-col">
                <div className="relative aspect-[4/3] bg-[#e9e8e6] overflow-hidden">
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
                  <span className={`absolute top-3 left-3 px-2.5 py-1 rounded-full text-[10px] font-black tracking-wide ${TYPE_BADGE[form.type]?.cls || TYPE_BADGE.role.cls}`}>
                    {typeLabel(form.type)}
                  </span>
                  {form.stock === "0" && (
                    <div className="absolute inset-0 bg-black/35 flex items-center justify-center">
                      <span className="text-sm font-black text-[#131313] tracking-wider">SOLD OUT</span>
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

            <p className="mt-3 text-center text-[11px] text-[#4b4b4b]">
              {form.active ? "판매 중 — 상점에 노출됩니다" : "숨김 — 상점에 노출되지 않습니다"}
              {form.type === "role" && !form.roleId && <span className="block mt-1 text-[#e91e3f]">지급할 역할을 선택해야 저장할 수 있습니다</span>}
            </p>
          </div>
        </div>
      )}

      {noticeEl}
    </main>
  );
}
