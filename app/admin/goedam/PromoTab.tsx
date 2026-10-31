"use client";

import { useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import Link from "next/link";
import { AdminPage, Panel, FieldRow, Segmented, Btn, ConfirmDialog, StatusChip, inputClass, numClass } from "../ui";

// 📌 괴담회 「홍보 DM」 탭(2026-11-01 운영자 "문화상품권 16개가 추가 됐거든 그거 홍보성 dm 보낼 거니까") — 관리 › 괴담회 ?tab=promo.
//    받는 사람(최근 30일 활동 · 괴담회 참여자 · 서버 전체 — 수가 같이 보인다) · 상품 이름 · 늘어난 수를 넣고 보내면 단체 DM 한 건이 생기고,
//    봇이 한 통씩(1.5초 간격) 보낸다(bot/src/features/dmBlast.js). 문구는 관리 › 봇 메시지 「괴담회 홍보」에서 고친다.
//    아래 「보낸 기록」 — 최근 5건(보낸 수 / 전체 · 못 보낸 수 · 상태), 보내는 중이면 「멈추기」. 보내는 중엔 10초마다 다시 읽는다
//    API app/api/admin/goedam/promo
type Target = "active" | "goedam" | "all";
type Blast = { id: string; target: Target; total: number; sent: number; failed: number; status: string; createdBy: string; createdAt: string | null; startedAt: string | null; finishedAt: string | null; vars: { prize?: string; count?: string; until?: string } };
type Data = { counts: Record<Target, number>; codesLeft: number; until: string; blasts: Blast[] };
type ToastFn = (msg: string, isError?: boolean) => void;

const API = "/api/admin/goedam/promo";
const TARGET_L: Record<Target, string> = { active: "최근 30일 활동", goedam: "괴담회 참여자", all: "서버 전체" };
const STATUS: Record<string, { l: string; tone: "ok" | "warn" | "bad" | "info" | "neutral" | "ink" }> = {
  queued: { l: "대기", tone: "info" },
  sending: { l: "보내는 중", tone: "warn" },
  done: { l: "끝", tone: "ok" },
  stopped: { l: "멈춤", tone: "neutral" },
};
const GAP_SEC = 1.5;
const when = (s: string | null) => (s ? new Date(s).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "-");

export default function PromoTab({ tabs, desc, toast }: { tabs: ReactNode; desc: string; toast: ToastFn }) {
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);
  const [target, setTarget] = useState<Target>("active");
  const [prize, setPrize] = useState("문화상품권");
  const [count, setCount] = useState("");
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const filled = useRef(false);

  const load = useCallback(() => {
    fetch(API, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!j?.success) { setFailed(true); return; }
        setFailed(false);
        setData({ counts: j.counts, codesLeft: Number(j.codesLeft) || 0, until: String(j.until || ""), blasts: Array.isArray(j.blasts) ? j.blasts : [] });
        // 처음 한 번 — 늘어난 수 칸을 남은 문화상품권 수로 채워 둔다(고칠 수 있다)
        if (!filled.current) { filled.current = true; if (Number(j.codesLeft) > 0) setCount(String(j.codesLeft)); }
      })
      .catch(() => setFailed(true));
  }, []);
  useEffect(() => { load(); }, [load]);
  // 보내는 중이면 10초마다 진행을 다시 읽는다
  const live = !!data?.blasts.some((b) => b.status === "queued" || b.status === "sending");
  useEffect(() => {
    if (!live) return;
    const t = setInterval(load, 10_000);
    return () => clearInterval(t);
  }, [live, load]);

  const n = data ? data.counts[target] || 0 : 0;
  const countNum = Number(count);
  const countOk = Number.isInteger(countNum) && countNum >= 1 && countNum <= 9999;
  const minutes = Math.max(1, Math.ceil((n * GAP_SEC) / 60 * 1.35)); // 20초에 10명 — 간격 1.5초 + 쉬는 틈
  const prizeName = prize.trim() || "문화상품권";

  const post = async (body: object) => {
    const r = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((x) => x.json()).catch(() => null);
    return r;
  };
  const send = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const r = await post({ action: "send", target, prize: prizeName, count: countNum });
      if (!r?.success) { toast(r?.error || "보내지 못했습니다.", true); return; }
      toast(`${TARGET_L[target]} ${n.toLocaleString()}명에게 보내기 시작했습니다.`);
      setAsk(false);
      load();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  const stop = async (id: string) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const r = await post({ action: "stop", id });
      if (!r?.success) { toast(r?.error || "멈추지 못했습니다.", true); return; }
      toast("보내기를 멈췄습니다.");
      load();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return (
    <AdminPage section="SYSTEM : LEVEL" title="괴담회" desc={desc} tabs={tabs}>
      <div className="space-y-5 max-w-3xl">
        {failed && <p className="text-[13px] font-bold text-[#d01634]">불러오지 못했습니다. 새로 고침해 주세요.</p>}
        <Panel
          title="홍보 DM 보내기"
          right={<Link href="/admin/messages?key=goedamPromo" className="text-[12px] font-bold text-[#5a5a5a] hover:text-[#131313] underline underline-offset-2">문구 고치기</Link>}
        >
          <div className="space-y-5">
            <FieldRow label="받는 사람">
              <Segmented
                options={(["active", "goedam", "all"] as Target[]).map((t) => ({ v: t, l: TARGET_L[t], n: data ? data.counts[t] || 0 : undefined }))}
                value={target}
                onChange={(v) => setTarget(v as Target)}
              />
            </FieldRow>
            <FieldRow label="상품 이름">
              <input value={prize} maxLength={20} onChange={(e) => setPrize(e.target.value)} className={`${inputClass} !w-48`} />
            </FieldRow>
            <FieldRow label="늘어난 수">
              <div className="flex items-center gap-2">
                <input value={count} inputMode="numeric" onChange={(e) => setCount(e.target.value.replace(/[^0-9]/g, "").slice(0, 4))} className={numClass} />
                <span className="text-[13px] font-bold text-[#5a5a5a]">장</span>
                {data && <span className="text-[12px] text-[#8a8a8a]">남은 문화상품권 {data.codesLeft}장</span>}
              </div>
            </FieldRow>
            {/* 미리 보기 — 틀 기본 글(관리 › 봇 메시지에서 고쳤으면 그 글로 나간다) */}
            <div className="rounded-lg border border-[#ededed] bg-[#f2f2f2] p-4">
              <div className="border-l-4 border-[#e91e3f] bg-white rounded-r-md px-4 py-3">
                <p className="text-[11px] font-bold text-[#5a5a5a]">방구석 심야 괴담회</p>
                <p className="mt-1 text-[15px] font-black text-[#131313]">{prizeName} {countOk ? countNum : "?"}장 추가!</p>
                <p className="mt-1.5 text-[13px] text-[#131313] leading-relaxed">
                  괴담회 추첨에 <b>{prizeName} {countOk ? countNum : "?"}장</b>이 더 들어왔습니다.<br />추첨권이 있다면 지금 뽑아 보세요.
                </p>
                <p className="mt-2 text-[12px] font-bold text-[#5a5a5a]">추첨 마감</p>
                <p className="text-[13px] text-[#131313]">{data?.until || "-"}</p>
              </div>
              <span className="mt-2 inline-block h-8 px-3.5 rounded-[4px] bg-[#4e5058] text-white text-[12px] font-bold leading-8">뽑기 하러 가기</span>
            </div>
            <div className="flex items-center gap-3">
              <Btn disabled={!data || !countOk || n < 1 || live || busy} onClick={() => setAsk(true)}>보내기</Btn>
              {live && <span className="text-[12px] font-bold text-[#5a5a5a]">보내는 중인 DM 이 끝나면 보낼 수 있습니다.</span>}
            </div>
          </div>
        </Panel>

        <Panel title="보낸 기록" flush>
          {!data || data.blasts.length === 0 ? (
            <p className="px-5 py-8 text-center text-[13px] text-[#8a8a8a]">보낸 기록이 없습니다.</p>
          ) : (
            <div className="divide-y divide-[#ededed]">
              {data.blasts.map((b) => {
                const st = STATUS[b.status] || { l: b.status, tone: "neutral" as const };
                const on = b.status === "queued" || b.status === "sending";
                return (
                  <div key={b.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5">
                    <StatusChip tone={st.tone}>{st.l}</StatusChip>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-bold text-[#131313]">{b.vars?.prize || "문화상품권"} {b.vars?.count || "?"}장 <span className="ml-1.5 font-bold text-[#5a5a5a]">{TARGET_L[b.target] || b.target}</span></p>
                      <p className="mt-0.5 text-[12px] text-[#8a8a8a]">{when(b.createdAt)} <span className="ml-1.5">{b.createdBy || "-"}</span></p>
                    </div>
                    <p className="text-[13px] font-bold tabular-nums text-[#131313]">
                      {b.sent.toLocaleString()} / {b.total.toLocaleString()}
                      {b.failed > 0 && <span className="ml-2 text-[12px] text-[#d01634]">못 보냄 {b.failed.toLocaleString()}</span>}
                    </p>
                    {on && <Btn size="sm" variant="secondary" disabled={busy} onClick={() => stop(b.id)}>멈추기</Btn>}
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
      </div>

      <ConfirmDialog
        open={ask}
        title="홍보 DM 을 보낼까요?"
        body={
          <p className="text-[13px] text-[#5a5a5a] leading-relaxed break-keep">
            {TARGET_L[target]} <b className="text-[#131313]">{n.toLocaleString()}명</b>에게 「{prizeName} {countNum}장 추가!」를 보냅니다. 한 통씩 보내서 약 {minutes}분 걸려요. 보내는 중에 멈출 수 있어요.
          </p>
        }
        confirmLabel="보내기"
        busy={busy}
        onConfirm={send}
        onCancel={() => setAsk(false)}
      />
    </AdminPage>
  );
}
