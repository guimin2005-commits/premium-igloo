"use client";

// 📌 재화 통계 — 기간 동안 XP · 빙옥이 어디서 생기고(발행) 어디로 빠졌는지(사용). 읽기 전용
//    (app/api/admin/economy · 출처 분류는 lib/adminEconomy.js — 원장 app/api/xp/ledger 와 같다)
//    머리 → 기간 한 줄 → 숫자 4칸(발행 · 사용 · 순증 · 빙옥 유통) → 일별 막대 → XP · 빙옥 출처 / 사용처 → 일별 표 → 상품별 판매
//    일별 막대 · 표의 하루를 누르면 그날 출처별 칸(DetailPane)이 열린다.
//    막대는 차트 라이브러리 없이 div — 발행은 잉크(#131313), 사용은 강조(#e91e3f). 둘 다 같은 눈금(한 축)
//    주소에 ?period= 를 실어 새로고침해도 같은 기간이 열린다.

import React, { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AdminPage, Toolbar, Segmented, StatRow, Panel, PanelGrid, DataTable, DetailPane, DefRow, EmptyRow, useAdminGuard, useNotice, type Column } from "../ui";

type Period = "7d" | "30d" | "60d";
type Part = { l: string; v: number };
type Flow = { in: number; out: number; inBy: Part[]; outBy: Part[] };
type Day = { d: string; xp: Flow; point: Flow };
type Sale = { itemId: string; name: string; n: number; xp: number; point: number };
type Data = {
  period: Period; since: string; floor: string | null;
  daily: Day[]; total: { xp: Flow; point: Flow };
  circulation: { xp: number; point: number; users: number };
  sales: Sale[];
};

const PERIODS: { v: Period; l: string }[] = [
  { v: "7d", l: "7일" },
  { v: "30d", l: "30일" },
  { v: "60d", l: "60일" },
];
const isPeriod = (v: string | null): v is Period => !!v && PERIODS.some((p) => p.v === v);

// 📌 두 색만 — 발행 잉크 · 사용 강조 (관리자 디자인 기준 값, app/admin/ui.tsx 머리 주석)
const INK = "#131313";
const ACCENT = "#e91e3f";
const META = "text-[12px] text-[#8a8a8a] tabular-nums";
const WEEK = ["일", "월", "화", "수", "목", "금", "토"];
const KST = 9 * 60 * 60 * 1000;
// 숫자 칸 아래 줄 자리 — 읽기 전에도 줄 높이를 잡아 두어 읽은 뒤 아래 판이 밀리지 않게
const NBSP = "\u00a0";

const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
const dayLabel = (d: string) => `${md(d)} (${WEEK[new Date(`${d}T00:00:00Z`).getUTCDay()]})`;
const num = (n: number) => Math.round(n || 0).toLocaleString();
const signed = (n: number) => (n > 0 ? `+${num(n)}` : n < 0 ? `−${num(-n)}` : "0");
// 큰 숫자 칸 — 만 · 억으로 줄인다(정확한 값은 칸 아래 줄). 모바일 두 칸 폭에서 여덟 자리가 넘치지 않게
const short = (n: number) => {
  const a = Math.abs(Math.round(n || 0));
  const s = n < 0 ? "−" : "";
  if (a >= 1e8) return `${s}${(a / 1e8).toLocaleString(undefined, { maximumFractionDigits: 1 })}억`;
  if (a >= 1e4) return `${s}${Math.round(a / 1e4).toLocaleString()}만`;
  return `${s}${a.toLocaleString()}`;
};
// 기간 시작 "10/1 19:01" (KST, 자정이면 날짜만)
const sinceLabel = (iso: string) => {
  const k = new Date(new Date(iso).getTime() + KST);
  const d = `${k.getUTCMonth() + 1}/${k.getUTCDate()}`;
  const hh = k.getUTCHours();
  const mm = k.getUTCMinutes();
  return hh || mm ? `${d} ${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}` : d;
};
// 모바일 줄 카드에는 표 머리가 없다 — 값 앞에 이름을 붙인다(PC 에서는 숨김)
const ml = (l: string) => <span className="md:hidden">{l} </span>;

// 📌 history.replaceState 는 Next 라우터가 받아 useSearchParams 를 바로 바꾼다(서버 왕복 없음). 기본값(7일)은 싣지 않는다
const syncUrl = (period: Period) => {
  window.history.replaceState(null, "", period === "7d" ? "/admin/economy" : `/admin/economy?period=${period}`);
};

// ── 일별 막대 — 하루에 발행 · 사용 두 막대, 같은 눈금. 마우스를 올리면 그날 값, 누르면 그날 칸 ──
function DailyBars({ days, onPick }: { days: Day[]; onPick: (d: Day) => void }) {
  const [hover, setHover] = useState<number | null>(null);
  const n = days.length;
  const max = Math.max(1, ...days.map((d) => Math.max(d.xp.in, d.xp.out)));
  // 날짜 글자는 듬성듬성 — 첫날 · 끝날은 늘
  const every = n <= 10 ? 1 : n <= 31 ? 5 : 10;
  const h = (v: number) => (v > 0 ? `max(2px, ${(v / max) * 100}%)` : "0px");
  const hd = hover != null ? days[hover] : null;
  // 말풍선 — 왼쪽 · 오른쪽 끝에서는 판 밖으로 나가지 않게 기준을 바꾼다
  const tipX = hover != null ? ((hover + 0.5) / n) * 100 : 0;
  const tipShift = hover == null ? "" : hover < n / 4 ? "translateX(-12px)" : hover >= (n * 3) / 4 ? "translateX(calc(-100% + 12px))" : "translateX(-50%)";

  return (
    // 좁은 화면에서는 페이지가 아니라 이 판만 가로로 스크롤 — 하루 최소 14px
    <div className="overflow-x-auto no-bar">
      <div className="relative pt-5" style={{ minWidth: n * 14 }}>
        <span className={`absolute left-0 top-0 ${META}`}>{short(max)}</span>
        <div className="relative h-40 border-b border-[#ededed]">
          <div aria-hidden className="absolute inset-x-0 top-0 border-t border-[#ededed]" />
          <div aria-hidden className="absolute inset-x-0 top-1/2 border-t border-[#ededed]" />
          <div className="absolute inset-0 flex items-end">
            {days.map((d, i) => (
              <button
                key={d.d}
                type="button"
                onClick={() => onPick(d)}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover((x) => (x === i ? null : x))}
                onFocus={() => setHover(i)}
                onBlur={() => setHover((x) => (x === i ? null : x))}
                aria-label={`${dayLabel(d.d)} · 발행 ${num(d.xp.in)} · 사용 ${num(d.xp.out)}`}
                className={`flex-1 min-w-0 h-full flex items-end justify-center gap-[2px] px-px outline-none transition-colors ${hover === i ? "bg-[#f2f2f2]" : ""}`}
              >
                <span className="flex-1 max-w-[12px]" style={{ height: h(d.xp.in), background: INK }} />
                <span className="flex-1 max-w-[12px]" style={{ height: h(d.xp.out), background: ACCENT }} />
              </button>
            ))}
          </div>
        </div>
        <div className="flex mt-1.5">
          {days.map((d, i) => (
            <span key={d.d} className={`flex-1 min-w-0 text-center whitespace-nowrap ${META}`}>{i % every === 0 || i === n - 1 ? md(d.d) : ""}</span>
          ))}
        </div>
        {hd && (
          <div
            role="tooltip"
            className="pointer-events-none absolute top-0 z-10 min-w-[150px] px-3 py-2.5 bg-white border border-[#ededed] shadow-[0_28px_56px_-28px_rgba(0,0,0,0.25)] text-[12px]"
            style={{ left: `${tipX}%`, transform: tipShift }}
          >
            <p className="font-black text-[#131313]">{dayLabel(hd.d)}</p>
            <p className="mt-1 flex items-center gap-1.5 text-[#5a5a5a]">
              <span aria-hidden className="w-2 h-2 shrink-0" style={{ background: INK }} />발행
              <span className="ml-auto pl-3 font-bold text-[#131313] tabular-nums">{num(hd.xp.in)}</span>
            </p>
            <p className="mt-0.5 flex items-center gap-1.5 text-[#5a5a5a]">
              <span aria-hidden className="w-2 h-2 shrink-0" style={{ background: ACCENT }} />사용
              <span className="ml-auto pl-3 font-bold text-[#131313] tabular-nums">{num(hd.xp.out)}</span>
            </p>
            <p className="mt-0.5 flex items-center text-[#5a5a5a]">
              순증<span className="ml-auto pl-3 font-bold text-[#131313] tabular-nums">{signed(hd.xp.in - hd.xp.out)}</span>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── 출처 · 사용처 한 판 — 이름 · 몫 막대 · 비율 · 값 ──
function FlowList({ parts, total, color }: { parts: Part[]; total: number; color: string }) {
  if (!parts.length) return <p className="px-5 py-10 text-center text-[13px] text-[#5a5a5a]">없음</p>;
  return (
    <div className="divide-y divide-[#ededed]">
      {parts.map((p) => {
        const share = total > 0 ? (p.v / total) * 100 : 0;
        return (
          <div key={p.l} className="flex items-center gap-3 px-5 py-3">
            <span className="w-24 sm:w-28 shrink-0 truncate text-[13px] font-bold">{p.l}</span>
            <span aria-hidden className="flex-1 min-w-0 h-1.5 bg-[#f2f2f2]">
              <span className="block h-full" style={{ width: `${share}%`, background: color }} />
            </span>
            <span className={`hidden sm:inline w-12 shrink-0 text-right ${META}`}>{share.toLocaleString(undefined, { maximumFractionDigits: 1 })}%</span>
            <span className="w-24 sm:w-28 shrink-0 text-right text-[13px] font-bold tabular-nums">{num(p.v)}</span>
          </div>
        );
      })}
    </div>
  );
}

// 상세 칸 안 한 묶음 — 제목 · 합계 줄 · 출처별 줄
function DaySection({ title, flow, side }: { title: string; flow: Flow; side: "in" | "out" }) {
  const parts = side === "in" ? flow.inBy : flow.outBy;
  const sum = side === "in" ? flow.in : flow.out;
  return (
    <section className="mb-5 last:mb-0">
      <div className="flex items-center gap-2 pb-1.5 border-b border-[#131313]">
        <h3 className="text-[13px] font-black">{title}</h3>
        <span className="ml-auto text-[13px] font-black tabular-nums">{num(sum)}</span>
      </div>
      {parts.length ? (
        <dl>{parts.map((p) => <DefRow key={p.l} k={p.l}><span className="tabular-nums">{num(p.v)}</span></DefRow>)}</dl>
      ) : (
        <p className="py-2.5 text-[13px] text-[#5a5a5a]">없음</p>
      )}
    </section>
  );
}

export default function AdminEconomyPage() {
  const { isAdmin, gate } = useAdminGuard();
  const { notify, noticeEl } = useNotice();

  // 📌 기간은 주소가 원본 — 새로고침 · 뒤로가기가 같은 기간을 연다
  const pq = useSearchParams().get("period");
  const period: Period = isPeriod(pq) ? pq : "7d";
  const [dayKey, setDayKey] = useState<string | null>(null); // 상세 칸에 연 날

  // 받은 결과는 어느 기간의 것인지와 함께 둔다 — 다른 기간을 읽는 동안에는 앞 결과를 흐리게 보여 준다
  const [shown, setShown] = useState<{ period: Period; data: Data } | null>(null);
  const [failed, setFailed] = useState(""); // 읽지 못한 기간 — 그 기간에서는 "불러오는 중"을 끈다

  useEffect(() => {
    if (!isAdmin) return;
    let alive = true; // 빠르게 바꾸면 늦게 온 이전 응답을 버린다
    fetch(`/api/admin/economy?period=${period}`, { cache: "no-store" })
      .then(async (r) => {
        const d = await r.json().catch(() => null);
        if (!r.ok || !d?.success) throw new Error(d?.error || "불러오지 못했습니다.");
        if (!alive) return;
        setShown({ period, data: d.data });
        // 📌 연 날이 새 기간에 없으면 닫는다 — 남겨 두면 그날이 있는 기간으로 돌아올 때 누르지 않아도 칸이 다시 열린다
        const days: Day[] = Array.isArray(d.data?.daily) ? d.data.daily : [];
        setDayKey((k) => (k && !days.some((x) => x.d === k) ? null : k));
        setFailed("");
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setFailed(period);
        notify(e instanceof Error ? e.message : "불러오지 못했습니다.", true);
      });
    return () => { alive = false; };
  }, [isAdmin, period, notify]);

  const data = shown?.data ?? null;
  const loading = shown?.period !== period && failed !== period;

  const closeDay = useCallback(() => setDayKey(null), []);

  if (gate) return gate;

  const t = data?.total;
  const c = data?.circulation;
  const net = t ? t.xp.in - t.xp.out : 0;
  // 상세 칸의 날 — 기간을 바꿔 그날이 목록에 없으면 닫힌 것으로 본다
  const day = dayKey && data ? data.daily.find((d) => d.d === dayKey) || null : null;
  const dim = `transition-opacity ${loading ? "opacity-60" : ""}`;

  const dayColumns: Column<Day>[] = [
    { key: "d", label: "날짜", mobile: "title", render: (d) => <span className="font-bold tabular-nums">{dayLabel(d.d)}</span> },
    { key: "xin", label: "XP 발행", align: "right", render: (d) => <span className="tabular-nums">{ml("발행")}{num(d.xp.in)}</span> },
    { key: "xout", label: "XP 사용", align: "right", render: (d) => <span className="tabular-nums">{ml("사용")}{num(d.xp.out)}</span> },
    {
      key: "net",
      label: "순증",
      align: "right",
      render: (d) => {
        const v = d.xp.in - d.xp.out;
        return <span className={`font-bold tabular-nums ${v < 0 ? "text-[#d01634]" : ""}`}>{ml("순증")}{signed(v)}</span>;
      },
    },
    { key: "pin", label: "빙옥 발행", align: "right", render: (d) => <span className="tabular-nums">{ml("빙옥 발행")}{num(d.point.in)}</span> },
    { key: "pout", label: "빙옥 사용", align: "right", render: (d) => <span className="tabular-nums">{ml("빙옥 사용")}{num(d.point.out)}</span> },
  ];

  const saleColumns: Column<Sale>[] = [
    { key: "name", label: "상품", mobile: "title", render: (s) => <span className="font-bold">{s.name}</span> },
    { key: "n", label: "건수", align: "right", render: (s) => <span className="tabular-nums">{num(s.n)}건</span> },
    { key: "xp", label: "XP", align: "right", render: (s) => <span className="tabular-nums">{num(s.xp)}{ml(" XP")}</span> },
    { key: "point", label: "빙옥", align: "right", render: (s) => <span className="tabular-nums">{num(s.point)}{ml(" 빙옥")}</span> },
  ];

  const legend = (
    <span className="inline-flex items-center gap-3 text-[12px] text-[#5a5a5a]">
      <span className="inline-flex items-center gap-1.5"><span aria-hidden className="w-2.5 h-2.5" style={{ background: INK }} />발행</span>
      <span className="inline-flex items-center gap-1.5"><span aria-hidden className="w-2.5 h-2.5" style={{ background: ACCENT }} />사용</span>
    </span>
  );

  return (
    <AdminPage section="허브" title="재화 통계">
      {/* 📌 판 사이 간격은 이 묶음 안에서만 — 상세 칸 · 알림(fixed)이 space-y 의 여백을 받아 칸 아래가 뜨지 않게 */}
      <div className="space-y-5">
        <Toolbar className="!mb-0">
          <Segmented options={PERIODS} value={period} onChange={(v) => syncUrl(v as Period)} />
          {/* 기간 시작 — 내역 기준 시각보다 이르면 그 시각부터 센다 */}
          <span className={`ml-auto ${META}`}>{data ? `${sinceLabel(data.since)} 부터` : ""}</span>
        </Toolbar>

        <div className={dim}>
          <StatRow
            items={[
              { label: "XP 발행", value: t ? short(t.xp.in) : "—", sub: t ? `${num(t.xp.in)} XP` : NBSP },
              { label: "XP 사용", value: t ? short(t.xp.out) : "—", sub: t ? `${num(t.xp.out)} XP` : NBSP },
              { label: "XP 순증", value: t ? `${net > 0 ? "+" : ""}${short(net)}` : "—", sub: c ? `보유 합 ${num(c.xp)}` : NBSP, tone: net < 0 ? "bad" : undefined },
              { label: "빙옥 유통", value: c ? num(c.point) : "—", sub: t ? `기간 +${num(t.point.in)} · −${num(t.point.out)}` : NBSP },
            ]}
          />
        </div>

        {data ? (
          <div className={`${dim} space-y-5`} aria-busy={loading || undefined}>
            <Panel title="일별 XP" right={legend}>
              <DailyBars days={data.daily} onPick={(d) => setDayKey(d.d)} />
            </Panel>

            <PanelGrid>
              <Panel title="XP 발행" right={<span className={META}>{num(data.total.xp.in)}</span>} flush className="h-full">
                <FlowList parts={data.total.xp.inBy} total={data.total.xp.in} color={INK} />
              </Panel>
              <Panel title="XP 사용" right={<span className={META}>{num(data.total.xp.out)}</span>} flush className="h-full">
                <FlowList parts={data.total.xp.outBy} total={data.total.xp.out} color={ACCENT} />
              </Panel>
            </PanelGrid>

            <PanelGrid>
              <Panel title="빙옥 발행" right={<span className={META}>{num(data.total.point.in)}</span>} flush className="h-full">
                <FlowList parts={data.total.point.inBy} total={data.total.point.in} color={INK} />
              </Panel>
              <Panel title="빙옥 사용" right={<span className={META}>{num(data.total.point.out)}</span>} flush className="h-full">
                <FlowList parts={data.total.point.outBy} total={data.total.point.out} color={ACCENT} />
              </Panel>
            </PanelGrid>

            <Panel title="일별" flush>
              <DataTable
                columns={dayColumns}
                rows={data.daily.slice().reverse()}
                rowKey={(d) => d.d}
                onRowClick={(d) => setDayKey(d.d)}
                selectedKey={day ? day.d : null}
                className="!rounded-none !border-0"
              />
            </Panel>

            <Panel title="상품별 판매" right={<span className={META}>{num(data.sales.reduce((s, x) => s + x.n, 0))}건</span>} flush>
              {data.sales.length ? (
                <DataTable columns={saleColumns} rows={data.sales} rowKey={(s) => s.itemId || s.name} className="!rounded-none !border-0" />
              ) : (
                <p className="px-5 py-10 text-center text-[13px] text-[#5a5a5a]">없음</p>
              )}
            </Panel>
          </div>
        ) : (
          <EmptyRow>{loading ? "불러오는 중…" : "기록이 없습니다."}</EmptyRow>
        )}
      </div>

      <DetailPane
        open={!!day}
        onClose={closeDay}
        title={day ? dayLabel(day.d) : ""}
        sub={day ? `순증 ${signed(day.xp.in - day.xp.out)} XP` : undefined}
      >
        {day && (
          <>
            <DaySection title="XP 발행" flow={day.xp} side="in" />
            <DaySection title="XP 사용" flow={day.xp} side="out" />
            <DaySection title="빙옥 발행" flow={day.point} side="in" />
            <DaySection title="빙옥 사용" flow={day.point} side="out" />
          </>
        )}
      </DetailPane>
      {noticeEl}
    </AdminPage>
  );
}
