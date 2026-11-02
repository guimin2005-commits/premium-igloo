"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ICON_PATHS } from "./Icons";

// 📌 XP · 빙옥 입출금 내역 — 그 자리 팝업(화면 이동 없음).
//    레벨 대시보드의 '내역' 단추와 관리자 유저 조회(userId 를 넘긴다)가 연다.
//    데이터는 /api/xp/ledger — 어떤 기록을 어디서 가져오는지는 그 파일 머리 주석.
//    탭(XP · 빙옥)은 고정 폭 · 같은 굵기라 이번 달 합계 자릿수가 바뀌어도 움직이지 않는다.
//    📌 2026-11-02 그 자리 모드(레벨 대시보드 「기록」)는 모양이 따로다 — 아래 「그 자리 모드」 주석

export type WalletCurrency = "xp" | "point";
type Row = { at: string; currency: WalletCurrency; amount: number; label: string; kind: string; count?: number };
type Month = { since: string; plus: number; minus: number };
type Page = {
  items: Row[];
  hasMore: boolean;
  nextBefore: string | null;
  month: Month | null;
  retentionDays: number;
  loading: boolean;
  error: string;
};
type Props = {
  open: boolean;
  onClose: () => void;
  initial?: WalletCurrency;
  userId?: string; // 관리자가 남의 원장을 볼 때만
  title?: string;
  onTone?: () => void;
  // 📌 2026-11-02 창 없이 그 자리(레벨 대시보드 「기록」 화면 맨 아래 — app/level/RecordView.js). open · onClose 는 안 쓴다.
  //    refreshKey 가 바뀌면 처음부터 다시 읽는다(강화 · 수령 뒤 XP 가 바뀌면 부모가 올린다)
  inline?: boolean;
  refreshKey?: string | number;
  // 그 자리 모드 머리의 재화 탭 옆 보유량(없으면 이름만)
  balances?: { xp: number; point: number };
};

const PAGE_SIZE = 50;
// 아직 안 읽은 탭 — 첫 그림에서 "내역이 없습니다" 가 번쩍이지 않게 불러오는 중으로 둔다
const BLANK: Page = { items: [], hasMore: false, nextBefore: null, month: null, retentionDays: 60, loading: true, error: "" };
const TABS: { v: WalletCurrency; l: string }[] = [
  { v: "xp", l: "XP" },
  { v: "point", l: "빙옥" },
];
const KST = 9 * 60 * 60 * 1000;
const WEEK = ["일", "월", "화", "수", "목", "금", "토"];

// 시각은 보는 사람의 시간대와 상관없이 KST 로 적는다 (묶음 기준인 서버와 같게)
const kst = (iso: string) => new Date(new Date(iso).getTime() + KST);
const dayKeyOf = (iso: string) => kst(iso).toISOString().slice(0, 10);
const timeOf = (iso: string) => kst(iso).toISOString().slice(11, 16);
const dayLabel = (key: string, today: string, yesterday: string) => {
  if (key === today) return "오늘";
  if (key === yesterday) return "어제";
  const [y, m, d] = key.split("-").map(Number);
  const w = WEEK[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${y === Number(today.slice(0, 4)) ? "" : `${y}년 `}${m}월 ${d}일 (${w})`;
};
const fmt = (n: number) => Math.abs(n).toLocaleString("ko-KR");
// 📌 2026-11-02 그 자리 모드(「기록」 내역) — 운영자 "따로 노는 생김새 · 너무 길어짐 · 보여 주는 내용" → 시안 "ㅇㅇ".
//    날마다 묶고(날 합계), 날마다 쌓이는 적립(XpLog 묶음 · 출석 빙옥 · 연속 출석)은 「활동」 한 줄에 출처별 금액으로 합친다.
//    보상 · 구매 · 강화 · 지급처럼 따로 일어난 일은 시각과 한 줄씩. 처음 7일, 「이전 7일 더 보기」마다 7일 더(종류 칩은 활동을 합치며 뺐다)
const DAYS_STEP = 7;
const INLINE_PAGE = 100; // 그 자리 모드 한 번에 읽는 줄(서버 MAX_LIMIT) — 7일을 한두 번에 채우게
const ACT_ORDER = ["채팅", "음성", "출석", "연속 출석", "아이템 효과", "레벨업 효과", "기타 적립"];
const actRank = (l: string) => {
  const i = ACT_ORDER.indexOf(l);
  return i < 0 ? 99 : i;
};
// 활동 줄에 들어갈 이름 — XpLog 묶음(count 가 있다)은 그 이름, 출석 빙옥 · 연속 출석 보너스는 출석 쪽. 아니면 ""(따로 한 줄)
const actOf = (r: Row) => (r.count != null ? r.label : r.kind === "attend-point" ? "출석" : r.kind === "streak" ? "연속 출석" : "");
// 「구매 · 이름」 → 앞말(작게) · 이름
const splitLabel = (label: string): [string, string] => {
  const i = label.indexOf(" · ");
  return i > 0 ? [label.slice(0, i), label.slice(i + 3)] : ["", label];
};
const shortDay = (key: string, today: string) => {
  const [y, m, d] = key.split("-").map(Number);
  const w = WEEK[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${y === Number(today.slice(0, 4)) ? "" : `${y}.`}${m}.${d} (${w})`;
};
type Day = { key: string; label: string; sub: string; net: number; ev: Row[]; acts: Record<string, number>; actSum: number };
const signed = (n: number) => (n === 0 ? "0" : `${n > 0 ? "+" : "−"}${fmt(n)}`);

export default function WalletHistory({ open: openProp, onClose, initial = "xp", userId = "", title = "내역", onTone, inline = false, refreshKey, balances }: Props) {
  const open = inline || openProp;
  const [tab, setTab] = useState<WalletCurrency>(initial);
  const [days, setDays] = useState(DAYS_STEP); // 그 자리 모드 — 보이는 날 수
  // 그 자리 모드 — 오늘(KST) 날짜. 화면을 켜 둔 채 자정이 지나면 「오늘」 「어제」 이름을 다시 붙인다(1분마다 확인)
  const [todayKey, setTodayKey] = useState(() => dayKeyOf(new Date().toISOString()));
  useEffect(() => {
    if (!inline) return;
    const t = setInterval(() => {
      const k = dayKeyOf(new Date().toISOString());
      setTodayKey((p) => (p === k ? p : k));
    }, 60 * 1000);
    return () => clearInterval(t);
  }, [inline]);
  const [pages, setPages] = useState<Record<WalletCurrency, Page>>({ xp: BLANK, point: BLANK });
  const [round, setRound] = useState(0); // 비울 때마다 올린다 — 아래 읽기 효과를 다시 돌린다
  // 비울 때마다 올린다 — 닫았다 다시 연 뒤 늦게 도착한 옛 응답을 버린다
  const seq = useRef(0);
  const asked = useRef<Record<WalletCurrency, boolean>>({ xp: false, point: false });
  const closeRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const load = useCallback(
    async (cur: WalletCurrency, before: string | null) => {
      const my = seq.current;
      setPages((p) => ({ ...p, [cur]: { ...p[cur], loading: true, error: "" } }));
      try {
        const qs = new URLSearchParams({ currency: cur, limit: String(inline ? INLINE_PAGE : PAGE_SIZE) });
        if (before) qs.set("before", before);
        if (userId) qs.set("userId", userId);
        const res = await fetch(`/api/xp/ledger?${qs.toString()}`, { cache: "no-store" });
        const j = await res.json().catch(() => null);
        if (my !== seq.current) return;
        if (!res.ok || !j?.success) throw new Error(j?.error || j?.message || "불러오지 못했습니다.");
        const d = j.data || {};
        setPages((p) => {
          const prev = p[cur];
          return {
            ...p,
            [cur]: {
              items: before ? [...prev.items, ...(d.items || [])] : d.items || [],
              hasMore: !!d.hasMore,
              nextBefore: d.nextBefore || null,
              month: d.month ?? prev.month,
              retentionDays: Number(d.retentionDays) || 60,
              loading: false,
              error: "",
            },
          };
        });
      } catch (e) {
        if (my !== seq.current) return;
        const msg = e instanceof Error && e.message ? e.message : "불러오지 못했습니다.";
        setPages((p) => ({ ...p, [cur]: { ...p[cur], loading: false, error: msg } }));
      }
    },
    [userId, inline]
  );

  // 닫을 때 비운다 — 다시 열면 처음부터 새로 읽는다(방금 강화 · 수령한 것이 바로 보이게).
  //    열 때 비우면 옛 목록이 한 번 그려졌다 사라진다
  useEffect(() => {
    if (!open || inline) return;
    return () => {
      seq.current += 1;
      asked.current = { xp: false, point: false };
      setPages({ xp: BLANK, point: BLANK });
      setTab(initial);
      setRound((n) => n + 1);
    };
  }, [open, inline, initial, userId]);

  // 그 자리 모드 — refreshKey 가 바뀌면 두 탭 다 비우고 지금 탭부터 다시 읽는다(아래 읽기 효과가 round 를 보고 다시 돈다)
  useEffect(() => {
    if (!inline) return;
    seq.current += 1;
    asked.current = { xp: false, point: false };
    setPages({ xp: BLANK, point: BLANK });
    setDays(DAYS_STEP);
    setRound((n) => n + 1);
  }, [inline, refreshKey]);

  // 탭은 처음 볼 때 한 번만 읽는다 (탭을 오가며 매번 다시 받지 않게)
  useEffect(() => {
    if (!open || asked.current[tab]) return;
    asked.current[tab] = true;
    load(tab, null);
  }, [open, tab, load, round]);

  // 열면 닫기 단추에 초점 · Esc 로 닫기 (부모가 다시 그려도 초점을 다시 뺏지 않게 open 에만 건다)
  useEffect(() => {
    if (!open || inline) return;
    closeRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, inline]);

  const page = pages[tab];
  // 날짜별 묶음 — 서버가 이미 최신순으로 준다
  const groups = useMemo(() => {
    const now = new Date().toISOString();
    const today = dayKeyOf(now);
    const yesterday = dayKeyOf(new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
    const out: { key: string; label: string; rows: Row[] }[] = [];
    for (const r of page.items) {
      const key = dayKeyOf(r.at);
      const last = out[out.length - 1];
      if (last && last.key === key) last.rows.push(r);
      else out.push({ key, label: dayLabel(key, today, yesterday), rows: [r] });
    }
    return out;
  }, [page.items]);

  // 그 자리 모드 날 묶음 — 날 합계 · 따로 한 줄(ev) · 활동 합(acts). 더 읽을 쪽이 남았으면 마지막 날은 다음 쪽에 이어질 수 있어 다 읽을 때까지 안 그린다
  const inlineDays = useMemo(() => {
    if (!inline) return [] as Day[];
    const today = todayKey;
    const yesterday = new Date(Date.parse(`${todayKey}T00:00:00Z`) - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const out: Day[] = [];
    for (const r of page.items) {
      const key = dayKeyOf(r.at);
      let g = out[out.length - 1];
      if (!g || g.key !== key) {
        const near = key === today || key === yesterday;
        g = { key, label: key === today ? "오늘" : key === yesterday ? "어제" : shortDay(key, today), sub: near ? shortDay(key, today) : "", net: 0, ev: [], acts: {}, actSum: 0 };
        out.push(g);
      }
      g.net += r.amount;
      const a = actOf(r);
      if (a) {
        g.acts[a] = (g.acts[a] || 0) + r.amount;
        g.actSum += r.amount;
      } else g.ev.push(r);
    }
    return page.hasMore ? out.slice(0, -1) : out;
  }, [inline, page.items, page.hasMore, todayKey]);

  // 그 자리 모드 — 보일 날 수만큼 다 묶일 때까지 다음 쪽을 이어 읽는다(실패하면 멈추고 단추가 「다시 시도」)
  const needMore = inline && open && !page.loading && !page.error && page.hasMore && inlineDays.length < days;
  useEffect(() => {
    if (needMore) load(tab, page.nextBefore);
  }, [needMore, tab, page.nextBefore, load]);

  if (!open) return null;

  const pick = (v: WalletCurrency) => {
    if (v === tab) return;
    setTab(v);
    setDays(DAYS_STEP);
    // 📌 목록 칸은 두 탭이 같이 쓴다 — 앞 탭에서 내려간 자리가 남아 다른 탭 중간부터 보이지 않게 맨 위로
    if (listRef.current) listRef.current.scrollTop = 0;
    onTone?.();
  };
  const first = page.loading && page.items.length === 0;
  const px = inline ? "" : "px-5";

  // 탭 · 이번 달 합계 — 탭은 왼쪽 고정, 합계는 오른쪽 정렬이라 자릿수가 바뀌어도 탭이 밀리지 않는다
  const bar = (
    <div className={`shrink-0 flex items-center justify-between gap-3 ${px} pb-3 border-b border-[#ededed]`}>
      <div role="tablist" aria-label="재화" className="shrink-0 inline-flex p-1 rounded-full bg-[#f2f2f2]">
        {TABS.map((t) => {
          const on = tab === t.v;
          return (
            <button
              key={t.v}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => pick(t.v)}
              className={`w-16 h-8 inline-flex items-center justify-center rounded-full text-[13px] font-bold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#131313]/30 ${
                on ? "bg-white text-[#131313] ring-1 ring-black/[0.06]" : "text-[#5a5a5a] hover:text-[#131313]"
              }`}
            >
              {t.l}
            </button>
          );
        })}
      </div>
      <div className="min-w-0 text-right">
        <p className="text-[11px] font-bold text-[#8a8a8a]">이번 달</p>
        <p className="mt-0.5 text-[13px] font-bold tabular-nums whitespace-nowrap truncate">
          {page.month ? (
            <>
              <span className="text-[#d01634]">+{fmt(page.month.plus)}</span>
              <span className="ml-2 text-[#131313]">−{fmt(page.month.minus)}</span>
            </>
          ) : (
            <span className="text-[#a3a3a3]">—</span>
          )}
        </p>
      </div>
    </div>
  );

  // 목록 — 창에서는 날짜 머리가 스크롤해도 위에 붙어 있다(그 자리 모드는 화면과 같이 흘러간다)
  const list = first ? (
    <p className={`${px} py-16 text-center text-[13px] text-[#5a5a5a]`}>불러오는 중…</p>
  ) : page.error && page.items.length === 0 ? (
    <div className={`${px} py-16 text-center`}>
      <p className="text-[13px] text-[#5a5a5a]">{page.error}</p>
      <button
        type="button"
        onClick={() => load(tab, null)}
        className="mt-4 h-9 px-4 rounded-full border border-[#a3a3a3] text-[12px] font-bold text-[#131313] hover:border-[#131313] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#131313]/30"
      >
        다시 시도
      </button>
    </div>
  ) : page.items.length === 0 ? (
    <p className={`${px} py-16 text-center text-[13px] text-[#5a5a5a]`}>내역이 없습니다.</p>
  ) : (
    <>
      {groups.map((g) => (
        <section key={g.key}>
          <h3 className={`${inline ? "" : "sticky top-0 z-[1] bg-white "}${px} pt-4 pb-2 text-[12px] font-bold text-[#5a5a5a] border-b border-[#ededed]`}>
            {g.label}
          </h3>
          <ul>
            {g.rows.map((r, i) => (
              <li key={`${r.at}-${r.kind}-${i}`} className={`flex items-center gap-3 ${px} py-3 border-b border-[#ededed]`}>
                <span className="w-10 shrink-0 text-[12px] text-[#8a8a8a] tabular-nums">{timeOf(r.at)}</span>
                <span className="min-w-0 flex-1 flex items-baseline gap-1.5">
                  <span className="min-w-0 truncate text-[14px]">{r.label}</span>
                  {r.count ? (
                    <span className="shrink-0 text-[12px] text-[#8a8a8a] tabular-nums">{r.count.toLocaleString("ko-KR")}회</span>
                  ) : null}
                </span>
                <span className={`shrink-0 text-[14px] font-bold tabular-nums ${r.amount > 0 ? "text-[#d01634]" : "text-[#131313]"}`}>
                  {signed(r.amount)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <div className={`${px} pt-4 pb-6`}>
        {page.hasMore ? (
          <button
            type="button"
            disabled={page.loading}
            onClick={() => load(tab, page.nextBefore)}
            className="w-full h-10 rounded-full border border-[#a3a3a3] text-[13px] font-bold text-[#131313] hover:border-[#131313] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#131313]/30 disabled:opacity-40"
          >
            {page.loading ? "불러오는 중…" : page.error ? "다시 시도" : "더 보기"}
          </button>
        ) : (
          tab === "xp" && (
            <p className="text-center text-[12px] text-[#5a5a5a]">채팅 · 음성 · 출석 적립은 최근 {page.retentionDays}일만 남습니다.</p>
          )
        )}
        {/* 📌 더 보기 실패 문구는 단추 아래에 — 위에 끼면 방금 누른 단추가 한 줄 내려간다 */}
        {page.error && <p className="mt-3 text-center text-[12px] text-[#d01634]">{page.error}</p>}
      </div>
    </>
  );

  // 그 자리 모드 — 창 틀 없이 머리(「기록」 다른 칸 제목과 같은 틀 · 오른쪽 재화 탭) · 날 묶음 · 이전 7일 더 보기.
  //    선은 긋지 않는다(「기록」은 칸 사이 선 한 줄만 — 2026-11-02 운영자 "선이 너무 많다")
  if (inline) {
    const shown = inlineDays.slice(0, days);
    const moreLeft = inlineDays.length > days || page.hasMore;
    const amt = (n: number) => (
      <span className={`shrink-0 text-[14px] font-black tabular-nums ${n > 0 ? "text-[#e91e3f]" : "text-[#131313]"}`}>{signed(n)}</span>
    );
    const body = first ? (
      <p className="py-10 text-center text-[13px] font-bold text-[#a3a3a3]">불러오는 중…</p>
    ) : page.error && page.items.length === 0 ? (
      <div className="py-10 text-center">
        <p className="text-[13px] text-[#5a5a5a]">{page.error}</p>
        <button
          type="button"
          onClick={() => load(tab, null)}
          className="mt-4 h-9 px-4 rounded-full border border-[#a3a3a3] text-[12px] font-bold text-[#131313] hover:border-[#131313] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#131313]/30"
        >
          다시 시도
        </button>
      </div>
    ) : page.items.length === 0 ? (
      <p className="py-10 text-center text-[13px] font-bold text-[#a3a3a3]">내역이 없습니다.</p>
    ) : (
      <>
        {shown.map((g, i) => {
          const parts = Object.entries(g.acts).sort(([x], [y]) => actRank(x) - actRank(y));
          return (
            <section key={g.key} className={i ? "mt-5" : ""}>
              <h5 className="flex items-baseline gap-2 mb-1">
                <span className="text-[14px] font-black text-[#131313]">{g.label}</span>
                {g.sub && <span className="text-[12px] font-extrabold text-[#a3a3a3] tabular-nums">{g.sub}</span>}
                <span className="ml-auto text-[12.5px] font-black text-[#8a8a8a] tabular-nums">{signed(g.net)}</span>
              </h5>
              <ul>
                {g.ev.map((r, j) => {
                  const [pre, name] = splitLabel(r.label);
                  return (
                    <li key={`${r.at}-${r.kind}-${j}`} className="flex items-baseline gap-3 py-1.5">
                      <span className="w-10 shrink-0 text-[12px] font-bold text-[#a3a3a3] tabular-nums">{timeOf(r.at)}</span>
                      <span className="min-w-0 flex-1 flex items-baseline gap-1.5">
                        {/* 앞말은 짧은 말(구매 · 강화 · 캐시백)이 대부분이지만 운영자가 적은 지급 사유는 길 수 있다 — 칸의 60% 까지만, 넘치면 … */}
                        {pre && <span className="shrink-0 max-w-[60%] truncate text-[12px] font-extrabold text-[#8a8a8a]">{pre}</span>}
                        <span className="min-w-0 truncate text-[13.5px] font-extrabold text-[#131313]">{name}</span>
                      </span>
                      {amt(r.amount)}
                    </li>
                  );
                })}
                {parts.length > 0 && (
                  <li className="flex items-baseline gap-3 py-1.5">
                    <span className="w-10 shrink-0 text-[12px] font-extrabold text-[#8a8a8a]">활동</span>
                    <span className="min-w-0 flex-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[12px] font-bold text-[#a3a3a3] tabular-nums">
                      {parts.map(([l, v]) => (
                        <span key={l} className="whitespace-nowrap">
                          {l} <b className="font-black text-[#5a5a5a]">{v < 0 ? "−" : ""}{fmt(v)}</b>
                        </span>
                      ))}
                    </span>
                    {amt(g.actSum)}
                  </li>
                )}
              </ul>
            </section>
          );
        })}
        {moreLeft && (
          <button
            type="button"
            disabled={page.loading}
            onClick={() => {
              if (page.error) {
                load(tab, page.nextBefore);
                return;
              }
              setDays((d) => d + DAYS_STEP);
              onTone?.();
            }}
            className="mt-4 w-full h-11 inline-flex items-center justify-center gap-1.5 text-[13px] font-black text-[#5a5a5a] hover:text-[#131313] disabled:opacity-50 transition-colors outline-none focus-visible:underline"
          >
            {page.loading ? (
              "불러오는 중…"
            ) : page.error ? (
              "다시 시도"
            ) : (
              <>
                이전 7일 더 보기
                <svg aria-hidden viewBox="0 0 24 24" className="w-[13px] h-[13px]" fill="none" stroke="currentColor" strokeWidth="2.6"><path d="M4.5 8.25l7.5 7.5 7.5-7.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </>
            )}
          </button>
        )}
        {page.error && <p className="mt-2 text-center text-[12px] text-[#d01634]">{page.error}</p>}
      </>
    );
    return (
      <div className="text-[#131313]">
        <div className="flex items-center justify-between gap-3 mb-3.5">
          <h4 className="text-[15px] font-black text-[#131313] leading-5">{title}</h4>
          {/* 재화 탭 — 이름 + 보유량, 고르면 글자 색만 바뀐다(굵기 같음 — 탭이 안 움직인다) */}
          <div role="tablist" aria-label="재화" className="flex items-baseline gap-4">
            {TABS.map((t) => {
              const on = tab === t.v;
              const v = balances ? (t.v === "xp" ? balances.xp : balances.point) : null;
              const tone = on ? "text-[#131313]" : "text-[#c2c2c2] group-hover:text-[#8a8a8a]";
              return (
                <button
                  key={t.v}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => pick(t.v)}
                  className="group inline-flex items-baseline gap-1.5 outline-none focus-visible:underline"
                >
                  <span className={`text-[12px] font-black transition-colors ${tone}`}>{t.l}</span>
                  {v != null && <span className={`text-[15px] font-black tabular-nums transition-colors ${tone}`}>{fmt(v)}</span>}
                </button>
              );
            })}
          </div>
        </div>
        <div ref={listRef}>{body}</div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center bg-black/40 sm:p-6 overlay-in"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md h-[80dvh] sm:h-[min(640px,86vh)] flex flex-col overflow-hidden bg-white border border-[#ededed] rounded-t-2xl sm:rounded-2xl shadow-[0_28px_56px_-28px_rgba(0,0,0,0.25)] text-[#131313] pb-[env(safe-area-inset-bottom)] sm:pb-0"
      >
        {/* 머리 — 제목 · 닫기 */}
        <div className="shrink-0 flex items-center justify-between gap-3 pl-5 pr-3 pt-4 pb-3">
          <h2 className="min-w-0 truncate text-[17px] font-black tracking-tight">{title}</h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-[#5a5a5a] hover:text-[#131313] hover:bg-[#f2f2f2] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#131313]/30"
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
              <path d={ICON_PATHS.close} strokeLinecap="round" />
            </svg>
          </button>
        </div>
        {bar}
        <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
          {list}
        </div>
      </div>
    </div>
  );
}
