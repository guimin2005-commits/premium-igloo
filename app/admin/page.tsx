"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
// 📌 관리자 공용 UI — 권한 가드 · 페이지 틀 · 패널 · 토스트(효과음 포함)는 모두 여기서 가져온다.
import { useAdminGuard, AdminPage, Panel, PanelGrid, Switch, StatusChip, useToast } from "./ui";
import { EMPTY_COUNTS, ADMIN_COUNTS_EVENT, type AdminCounts } from "./adminIndex";

// 📌 대시보드 (2026-09 개편 → 2026-10-17 정리)
//    할 일만 남긴다 — 머리의 점검 모드 · 확인할 일 · 봇. 넓은 화면(xl)은 두 판이 나란히, 좁으면 확인할 일이 먼저.
//    분석 판(Discord 서버 현황 · 활동 골든타임 · 멤버 증감 · 최근 7일 문의 · 콘텐츠 & 활동 현황)은 통계 › 서버 활동 탭으로 옮겼다(app/admin/economy).
//    「지급 대기」는 숫자 줄 · 확인할 일 · 봇 판에 세 번(기준도 둘) 나오던 것 — 봇이 30초마다 자동으로 처리하므로 봇 판의 「XP 지급」 하나만 둔다.
//    확인할 일 숫자는 좌측 메뉴 빨간 숫자와 같은 원천(/api/admin/counts — 개수만 센다). 예전처럼 문의 · 지원서 · 글 · 쿠폰 전체 목록을 받지 않는다.
//    ?sec=bot — 봇 판으로 내려간다(기능 검색 바로가기).

// 📌 봇 상태 (/api/admin/bot-status) — 봇이 꺼진 채 대기열이 쌓이는 걸 대시보드에서 바로 보게 한다
type BotState = {
  online: boolean;
  agoSec: number | null;
  lastError: string;
  lastErrorAt: string | null;
  pending: Record<string, number>;
  pendingTotal: number;
};
const BOT_CELLS: { k: string; l: string }[] = [
  { k: "payout", l: "XP 지급" },
  { k: "purchase", l: "상품 역할" },
  { k: "codeGrant", l: "코드 역할" },
  { k: "roleSync", l: "레벨 역할" },
  { k: "refund", l: "환불 회수" },
  { k: "expired", l: "기간 만료" },
  { k: "messageTest", l: "테스트 DM" },
];
const agoText = (sec: number | null) => {
  if (sec == null) return "없음"; // "마지막 신호 없음"
  if (sec < 60) return "방금";
  if (sec < 3600) return `${Math.floor(sec / 60)}분 전`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}시간 전`;
  return `${Math.floor(sec / 86400)}일 전`;
};

// 📌 확인할 일 — 처리할 게 남은 곳으로 가는 줄. 숫자는 메뉴 빨간 숫자와 같은 열쇠(AdminCounts)
const TODOS: { k: keyof AdminCounts; l: string; href: string }[] = [
  { k: "inquiry", l: "미답변 문의", href: "/support?admin=1" },
  { k: "apply", l: "심사 중 지원", href: "/recruit?admin=1" },
  { k: "orders", l: "구매 처리 대기", href: "/admin/shop?tab=orders" },
  { k: "supportReports", l: "서포터즈 미처리 신고", href: "/admin/supporters?tab=reports" },
];

// 📌 패널 안 작은 숫자 · 날짜 글자 (메타 전용 #8a8a8a)
const META = "text-[12px] text-[#8a8a8a] tabular-nums";

export default function AdminHubPage() {
  const { isAdmin, gate } = useAdminGuard();
  const { toast, toastEl } = useToast();
  const sec = useSearchParams().get("sec");

  const [maintenance, setMaintenance] = useState(false);
  const [maintenanceLoading, setMaintenanceLoading] = useState(false);
  const [bot, setBot] = useState<BotState | null>(null);
  // 읽기 전(null)에는 숫자 대신 "—" — 0 과 "아직 모름"을 가른다
  const [counts, setCounts] = useState<AdminCounts | null>(null);

  const toggleMaintenance = async () => {
    if (maintenanceLoading) return;
    const next = !maintenance;
    setMaintenanceLoading(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maintenance: next }),
      });
      const d = await res.json().catch(() => null);
      if (res.ok && d?.success) {
        setMaintenance(!!d.maintenance);
        toast(d.maintenance ? "점검 모드를 켰습니다." : "점검 모드를 껐습니다.");
      } else {
        toast(d?.message || "점검 모드를 바꾸지 못했습니다.", true);
      }
    } catch {
      toast("서버 통신 오류가 발생했습니다.", true);
    }
    setMaintenanceLoading(false);
  };

  // 📌 점검 모드 상태
  useEffect(() => {
    if (!isAdmin) return;
    fetch("/api/settings", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setMaintenance(!!d.maintenance))
      .catch(() => {});
  }, [isAdmin]);

  // 📌 확인할 일 숫자 — 처음 · 화면이 처리 뒤 알릴 때(ADMIN_COUNTS_EVENT) · 아래 1분 주기에 다시 센다
  const loadCounts = useCallback(() => {
    fetch("/api/admin/counts", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (!d?.success) return;
        const n = (v: unknown) => Math.max(0, Math.floor(Number(v) || 0));
        setCounts({ ...EMPTY_COUNTS, inquiry: n(d.inquiry), apply: n(d.apply), orders: n(d.orders), supportReports: n(d.supportReports) });
      })
      .catch(() => {});
  }, []);

  // 📌 봇 상태 · 확인할 일 — 켜 둔 채 보는 화면이라 1분마다 다시 읽는다(탭이 가려져 있으면 건너뜀)
  useEffect(() => {
    if (!isAdmin) return;
    let alive = true;
    const load = () => {
      if (document.hidden) return;
      fetch("/api/admin/bot-status", { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => { if (alive && d?.success) setBot(d.data); })
        .catch(() => {});
      loadCounts();
    };
    load();
    const t = setInterval(load, 60_000);
    // 가려져 있다 돌아오면 바로 다시 — 한참 전의 "작동 중"이 최대 1분 동안 남지 않게
    const onVis = () => { if (!document.hidden) load(); };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener(ADMIN_COUNTS_EVENT, loadCounts);
    return () => {
      alive = false;
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener(ADMIN_COUNTS_EVENT, loadCounts);
    };
  }, [isAdmin, loadCounts]);

  // 📌 ?sec=<id> — 그 판(id="sec-<id>")으로 한 번 내려간다. 같은 sec 로 다시 그려져도 다시 움직이지 않는다
  const secDone = useRef<string | null>(null);
  const ready = !gate;
  useEffect(() => {
    if (!sec) { secDone.current = null; return; }
    if (!ready || secDone.current === sec) return;
    const el = document.getElementById(`sec-${sec}`);
    if (!el) return;
    secDone.current = sec;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [sec, ready]);

  // 로딩 중 / 권한 없음 화면은 공용 가드가 낸다 — 훅을 모두 부른 뒤에 빠져나가야 한다.
  if (gate) return gate;

  // 📌 봇이 꺼져 있는데 대기 건이 있으면 경고 톤 — 판 테두리 · 숫자를 빨강으로
  const botAlert = !!bot && !bot.online && bot.pendingTotal > 0;
  const botCells = [{ k: "total", l: "대기 합계", n: bot?.pendingTotal }, ...BOT_CELLS.map((c) => ({ ...c, n: bot?.pending?.[c.k] }))];

  return (
    <AdminPage
      title="대시보드"
      actions={
        // 📌 점검 모드 — 글자를 눌러도 켜고 끈다(label 이 스위치 단추를 가리킨다)
        <label className="inline-flex items-center gap-2.5 cursor-pointer select-none">
          <span className={`text-[13px] font-bold ${maintenance ? "text-[#d01634]" : "text-[#5a5a5a]"}`}>{maintenance ? "점검 중" : "점검 모드"}</span>
          <Switch on={maintenance} onChange={() => toggleMaintenance()} disabled={maintenanceLoading} label="점검 모드" />
        </label>
      }
    >
      {/* 확인할 일 · 봇 — 넓은 화면은 두 판 나란히(높이는 각자 내용만큼 — 늘이면 봇 판 아래가 빈 띠로 남는다), 좁으면 확인할 일이 먼저 */}
      <PanelGrid>
        <Panel id="sec-todo" title="확인할 일" flush className="scroll-mt-24">
          <div className="divide-y divide-[#ededed]">
            {TODOS.map((t) => {
              const n = counts ? counts[t.k] : null;
              return (
                <Link
                  key={t.k}
                  href={t.href}
                  className="flex items-center gap-3 px-5 py-3.5 hover:bg-[#f7f7f7] transition-colors outline-none focus-visible:bg-[#f7f7f7]"
                >
                  <span className="min-w-0 flex-1 text-[14px] font-bold">{t.l}</span>
                  {n == null ? (
                    <span className="text-[13px] text-[#a3a3a3]">—</span>
                  ) : n > 0 ? (
                    <span className="text-[14px] font-black text-[#d01634] tabular-nums">{n.toLocaleString()}건</span>
                  ) : (
                    <span className="text-[13px] text-[#a3a3a3]">없음</span>
                  )}
                  <svg aria-hidden viewBox="0 0 24 24" className="w-4 h-4 shrink-0 text-[#a3a3a3]" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 6l6 6-6 6" />
                  </svg>
                </Link>
              );
            })}
          </div>
        </Panel>

        {/* 봇 작동 여부 · 봇이 처리할 대기 건수 (칸 8개: 2 · 4 열 어디서든 빈 칸 없이 맞는다) */}
        <Panel
          id="sec-bot"
          title="봇"
          right={
            <>
              <span className={META}>마지막 신호 {bot ? agoText(bot.agoSec) : "—"}</span>
              <span title={bot?.lastError ? `최근 오류: ${bot.lastError}` : undefined}>
                <StatusChip tone={!bot ? "neutral" : bot.online ? "ok" : "bad"}>{!bot ? "—" : bot.online ? "작동 중" : "꺼짐"}</StatusChip>
              </span>
            </>
          }
          flush
          className={`scroll-mt-24 ${botAlert ? "!border-[#e91e3f]/50" : ""}`}
        >
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-[#ededed] rounded-b-2xl overflow-hidden">
            {botCells.map((c) => (
              <div key={c.k} className="px-4 md:px-5 py-4 bg-white min-w-0">
                <p className="text-[12px] font-bold text-[#5a5a5a] truncate">{c.l}</p>
                <p className={`mt-1.5 text-[20px] font-black tracking-[-0.02em] tabular-nums leading-none ${!c.n ? "text-[#a3a3a3]" : botAlert ? "text-[#d01634]" : ""}`}>
                  {c.n != null ? c.n.toLocaleString() : "—"}
                </p>
              </div>
            ))}
          </div>
        </Panel>
      </PanelGrid>
      {toastEl}
    </AdminPage>
  );
}
