"use client";

// 📌 알림 수신자 칸 — 관리 › 레벨 설정 수동 지급의 대상 칸(app/admin/bot/page.tsx TargetInput · TargetChips)을 옮겨 온 것(그 파일은 건드리지 않는다).
//    한 칸에 여러 명(줄바꿈 · 쉼표 · 멘션). 입력이 멈추면 400ms 뒤 /api/admin/targets 로 미리 확인해 칸 아래 칩으로 보인다
//    (찾은 사람 · ✕ 못 찾은 키 · ? 겹치는 이름 — 누르면 후보). 키 나누기는 서버와 같은 lib/adminTargetKeys.js.
//    알림만 다른 점 — XP 기록이 없는 디스코드 ID(17~20자리 숫자)는 막지 않는다. 발송 API(app/api/notifications)가
//    디스코드 서버에서 다시 찾아 없으면 그 한 명만 실패한다(채팅 한 번 안 한 회원에게도 보낼 수 있게 — 예전 칸과 같게)
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { parseTargetKeys, MAX_TARGETS } from "@/lib/adminTargetKeys";
import { StatusChip, inputClass } from "../ui";

type TargetCheck = {
  found: { userId: string; name: string; username: string }[];
  missing: string[];
  ambiguous: { key: string; candidates: { userId: string; name: string }[] }[];
};
export type Recipient = { key: string; name: string };
const RAW_ID = /^\d{17,20}$/;

export function useTargetCheck(text: string) {
  const keys: string[] = parseTargetKeys(text);
  const sig = keys.join("\n");
  const [res, setRes] = useState<{ sig: string; data: TargetCheck | null } | null>(null);
  // 요청 번호 — 늦게 온 옛 입력의 응답은 버린다
  const seq = useRef(0);
  useEffect(() => {
    const my = ++seq.current;
    if (!sig) return;
    const list = sig.split("\n");
    if (list.length > MAX_TARGETS) return;
    const t = setTimeout(() => {
      fetch("/api/admin/targets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ keys: list }) })
        .then((r) => r.json().then((d) => (r.ok && d?.success ? (d.data as TargetCheck) : null)).catch(() => null))
        .catch(() => null)
        .then((data) => { if (my === seq.current) setRes({ sig, data }); });
    }, 400);
    return () => clearTimeout(t);
  }, [sig]);
  const fresh = res && res.sig === sig ? res : null;
  const data = fresh?.data || null;
  const tooMany = keys.length > MAX_TARGETS;
  const unverified = data ? data.missing.filter((k) => RAW_ID.test(k)) : [];
  const missing = data ? data.missing.filter((k) => !RAW_ID.test(k)) : [];
  const problems = !!data && (missing.length > 0 || data.ambiguous.length > 0);
  // 잠금 — 비었음 · 200명 초과 · 못 찾음 · 이름 겹침 · 아직 확인 전(알림은 확인한 뒤에만 보낸다)
  const locked = !keys.length || tooMany || problems || !data;
  // 보낼 대상 — 찾은 사람은 유저 ID 로, 기록 없는 ID 는 그대로(입력 순서는 서버 확인 결과 순서)
  const recipients: Recipient[] = locked || !data
    ? []
    : [...data.found.map((f) => ({ key: f.userId, name: f.name })), ...unverified.map((k) => ({ key: k, name: k }))];
  return {
    keys,
    shown: sig ? res?.data || null : null, // 확인 중에는 직전 결과를 흐리게
    pending: !!sig && !tooMany && !fresh,
    failed: !!fresh && !fresh.data,
    tooMany,
    locked,
    recipients,
  };
}
export type TargetCheckState = ReturnType<typeof useTargetCheck>;
// 겹치는 이름 칩에서 후보를 고르면 그 키를 유저 ID 로 바꾼다
export const pickTargetKey = (keys: string[], key: string, userId: string) => keys.map((k) => (k === key ? userId : k)).join("\n");

// 수신자 칸 — 한 줄로 시작해 내용만큼 자라고, 5줄쯤부터는 칸 안에서 스크롤
const TARGET_MAX_H = 124;
const fitTarget = (el: HTMLTextAreaElement) => {
  if (!el.offsetWidth) return; // 숨은 칸(폭 0)은 재지 않는다 — 보일 때 아래 감시가 다시 잰다
  el.style.height = "auto";
  const full = el.scrollHeight + (el.offsetHeight - el.clientHeight);
  el.style.height = `${Math.min(full, TARGET_MAX_H)}px`;
  el.style.overflowY = full > TARGET_MAX_H ? "auto" : "hidden";
};
export function TargetInput({ value, onChange, disabled = false }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    if (ref.current) fitTarget(ref.current);
  }, [value]);
  // 칸 폭이 바뀌면(창 크기 · 화면 회전) 줄바꿈이 달라진다 — 폭이 바뀔 때만 다시 잰다(높이 변화로는 다시 돌지 않게)
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let w = el.offsetWidth;
    const ro = new ResizeObserver(() => {
      if (el.offsetWidth === w) return;
      w = el.offsetWidth;
      fitTarget(el);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <textarea ref={ref} rows={1} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} spellCheck={false}
      aria-label="수신자" placeholder="ID · 이름" className={`${inputClass} block resize-none`} />
  );
}

// 칸 아래 한 줄 — 찾은 사람(앞 8명) · 기록 없는 ID · 못 찾은 키(✕) · 겹치는 이름(?, 누르면 후보). 칩이 많으면 줄을 바꿔 감싼다
const TARGET_CHIPS = 8;
const chipBtn = "inline-flex max-w-full min-w-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[#131313]/20";
export function TargetChips({ check, onPick }: { check: TargetCheckState; onPick: (key: string, userId: string) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const { keys, shown, pending, failed, tooMany } = check;
  if (!keys.length) return null;
  if (tooMany) {
    return (
      <div className="mt-1.5 flex flex-wrap gap-1 min-w-0">
        <StatusChip tone="bad">{keys.length.toLocaleString()}명 · 최대 {MAX_TARGETS}명</StatusChip>
      </div>
    );
  }
  const found = shown?.found || [];
  // 못 찾은 키 중 디스코드 ID 모양은 「기록 없는 ID」(막지 않음), 나머지는 ✕
  const miss = (shown?.missing || []).filter((k) => !RAW_ID.test(k));
  const ids = (shown?.missing || []).filter((k) => RAW_ID.test(k));
  const amb = shown?.ambiguous || [];
  const openAmb = amb.find((a) => a.key === open);
  return (
    <div className={`mt-1.5 min-w-0 transition-opacity ${pending && shown ? "opacity-50" : ""}`}>
      <div className="flex flex-wrap items-center gap-1 min-w-0">
        {!shown && (failed ? <StatusChip tone="bad">확인 실패</StatusChip> : <StatusChip>…</StatusChip>)}
        {found.slice(0, TARGET_CHIPS).map((f) => (
          <StatusChip key={`f${f.userId}`} tone="ok" className="max-w-full min-w-0"><span className="truncate" title={f.userId}>{f.name}</span></StatusChip>
        ))}
        {found.length > TARGET_CHIPS && <StatusChip>외 {(found.length - TARGET_CHIPS).toLocaleString()}명</StatusChip>}
        {ids.slice(0, TARGET_CHIPS).map((k) => (
          <StatusChip key={`u${k}`} className="max-w-full min-w-0"><span className="truncate tabular-nums" title="XP 기록 없음">{k}</span></StatusChip>
        ))}
        {ids.length > TARGET_CHIPS && <StatusChip>외 {(ids.length - TARGET_CHIPS).toLocaleString()}개</StatusChip>}
        {miss.slice(0, TARGET_CHIPS).map((k) => (
          <StatusChip key={`m${k}`} tone="bad" className="max-w-full min-w-0"><span className="truncate">✕ {k}</span></StatusChip>
        ))}
        {miss.length > TARGET_CHIPS && <StatusChip tone="bad">✕ 외 {(miss.length - TARGET_CHIPS).toLocaleString()}개</StatusChip>}
        {amb.map((a) => (
          <button key={`a${a.key}`} type="button" className={chipBtn} aria-expanded={open === a.key}
            title={a.candidates.map((c) => `${c.name || "이름 없음"} ${c.userId}`).join("\n")}
            onClick={() => setOpen(open === a.key ? null : a.key)}>
            <StatusChip tone="warn" className="max-w-full min-w-0 cursor-pointer"><span className="truncate">{a.key} ?</span></StatusChip>
          </button>
        ))}
      </div>
      {openAmb && (
        <div className="mt-1 flex flex-wrap gap-1 min-w-0">
          {openAmb.candidates.map((c) => (
            <button key={c.userId} type="button" className={chipBtn} onClick={() => { onPick(openAmb.key, c.userId); setOpen(null); }}>
              <StatusChip className="max-w-full min-w-0 cursor-pointer hover:bg-[#e6e6e6]"><span className="truncate">{c.name || "이름 없음"} · {c.userId}</span></StatusChip>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
