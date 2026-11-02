"use client";

import { useState, useEffect, useMemo } from "react";
import { Panel, Btn, StatusChip, inputClass } from "../ui";

// 📌 완청 횟수(2026-11-01 운영자 "녹화중 테두리는 3개 이상 영화 시청한 인원들에게 줄 거니까 확인 가능한 기능 만들어") — 관리 › 괴담회 「명단」 탭 맨 위.
//    사람마다 완청한 상영 회차 수(음성 날 빼고 · 명단 「완청」과 같은 판정 — lib/goedam.js goedamWatchCounts). 「N편 이상」(기본 3)만 보이고,
//    「아이디 복사」는 보이는 사람의 디스코드 ID 를 줄마다 하나씩(지급 창에 붙여 넣기). 읽기만 한다
type Person = { userId: string; userName: string; count: number; sids: string[] };
type Data = { screenings: { sid: string; title: string; startsAt: string | null }[]; people: Person[] };
const API = "/api/admin/goedam?watchCount=1";

export default function WatchCountPanel({ toast }: { toast?: (msg: string, isError?: boolean) => void }) {
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);
  const [min, setMin] = useState("3");
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let live = true;
    fetch(API, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!live) return;
        if (!j?.success) { setFailed(true); return; }
        setFailed(false);
        setData({ screenings: Array.isArray(j.data?.screenings) ? j.data.screenings : [], people: Array.isArray(j.data?.people) ? j.data.people : [] });
      })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [nonce]);

  const n = Math.max(1, Math.floor(Number(min) || 1));
  const shown = useMemo(() => (data ? data.people.filter((p) => p.count >= n) : []), [data, n]);
  const titleOf = useMemo(() => new Map((data?.screenings || []).map((s) => [s.sid, s.title])), [data]);

  const copyIds = async () => {
    const text = shown.map((p) => p.userId).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      toast?.(`${shown.length}명의 아이디를 복사했습니다.`);
    } catch {
      toast?.("복사하지 못했습니다.", true);
    }
  };

  return (
    <Panel
      className="mb-5"
      title="완청 횟수"
      right={
        <>
          <input value={min} inputMode="numeric" aria-label="최소 완청 편수" onChange={(e) => setMin(e.target.value.replace(/[^0-9]/g, "").slice(0, 2))} className={`${inputClass} !w-14 text-center tabular-nums`} />
          <span className="text-[13px] font-bold text-[#5a5a5a]">편 이상</span>
          <Btn size="sm" variant="secondary" disabled={!shown.length} onClick={copyIds}>아이디 복사</Btn>
          <Btn size="sm" variant="ghost" onClick={() => setNonce((x) => x + 1)}>새로고침</Btn>
        </>
      }
      flush
    >
      {failed ? (
        <p className="px-5 py-6 text-[13px] font-bold text-[#d01634]">불러오지 못했습니다.</p>
      ) : !data ? (
        <p className="px-5 py-6 text-[13px] text-[#8a8a8a]">불러오는 중…</p>
      ) : (
        <>
          <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 px-5 pt-4 pb-3 border-b border-[#ededed]">
            <p className="text-[13px] text-[#5a5a5a]">상영 <b className="text-[#131313] tabular-nums">{data.screenings.length}</b>회</p>
            <p className="text-[13px] text-[#5a5a5a]">{n}편 이상 완청 <b className="text-[#131313] tabular-nums">{shown.length}</b>명</p>
            <p className="text-[13px] text-[#5a5a5a]">한 편 이상 <b className="text-[#131313] tabular-nums">{data.people.length}</b>명</p>
          </div>
          {shown.length === 0 ? (
            <p className="px-5 py-6 text-[13px] text-[#8a8a8a]">해당하는 사람이 없습니다.</p>
          ) : (
            <div className="max-h-[360px] overflow-y-auto divide-y divide-[#ededed]">
              {shown.map((p) => (
                <div key={p.userId} className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-5 py-2.5">
                  <div className="min-w-[160px]">
                    <p className="text-[13px] font-bold text-[#131313]">{p.userName || "이름 없음"}</p>
                    <p className="text-[11px] text-[#8a8a8a] tabular-nums">{p.userId}</p>
                  </div>
                  <p className="w-14 text-[13px] font-black text-[#131313] tabular-nums">{p.count}편</p>
                  <div className="min-w-0 flex-1 flex flex-wrap gap-1">
                    {p.sids.map((sid) => (
                      <StatusChip key={sid} tone="neutral">{titleOf.get(sid) || sid}</StatusChip>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Panel>
  );
}
