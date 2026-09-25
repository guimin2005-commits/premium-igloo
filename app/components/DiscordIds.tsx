"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";

/* 📌 디스코드 사용자 ID 공용 유틸 — 명예의 전당(공개/관리) · 대회 우승자 입력에서 함께 쓴다.
   저장 형식은 예전 그대로 "쉼표로 이어붙인 문자열"이지만, 화면에서는 사람이 ID를 손으로
   쉼표로 나열하지 않고 한 명씩 칩으로 추가·삭제하도록 감싼다. */

export type DiscordProfile = {
  id: string;
  username: string;
  globalName: string;
  avatarUrl: string;
  failed?: boolean;
};

// 숫자가 아닌 문자는 전부 구분자로 본다 — 쉼표·공백·줄바꿈은 물론 "<@1104...>" 멘션을 붙여넣어도 걸러진다.
export const parseIds = (s?: string): string[] =>
  Array.from(new Set((s || "").split(/[^0-9]+/).filter(Boolean)));

export const joinIds = (ids: string[]): string => ids.join(", ");

export const isValidId = (id: string): boolean => /^\d{15,21}$/.test(id);

// 페이지를 오가도 다시 부르지 않도록 모듈 단위로 캐시한다.
const profileCache = new Map<string, DiscordProfile>();

export function useDiscordProfiles() {
  const [profiles, setProfiles] = useState<Record<string, DiscordProfile>>(() => Object.fromEntries(profileCache));
  const pending = useRef<Set<string>>(new Set());

  const load = useCallback((ids: string[]) => {
    ids.forEach((id) => {
      if (!id || pending.current.has(id)) return;

      const cached = profileCache.get(id);
      if (cached) {
        setProfiles((prev) => (prev[id] ? prev : { ...prev, [id]: cached }));
        return;
      }
      if (!isValidId(id)) return;

      pending.current.add(id);
      fetch(`/api/discord-user?id=${id}`)
        .then((r) => r.json())
        .then((u) => {
          const p: DiscordProfile = u?.success
            ? { id, username: u.username, globalName: u.globalName, avatarUrl: u.avatarUrl }
            : { id, username: "", globalName: "", avatarUrl: "", failed: true };
          profileCache.set(id, p);
          setProfiles((prev) => ({ ...prev, [id]: p }));
        })
        .catch(() => {
          const p: DiscordProfile = { id, username: "", globalName: "", avatarUrl: "", failed: true };
          profileCache.set(id, p);
          setProfiles((prev) => ({ ...prev, [id]: p }));
        })
        .finally(() => pending.current.delete(id));
    });
  }, []);

  return { profiles, load };
}

/* 📌 우승자 명단 입력 — 한 명씩 추가하면 프로필(아바타·이름)로 확인된다.
   여러 ID를 한꺼번에 붙여넣어도 알아서 나눠 담는다. */
export function DiscordIdInput({
  value,
  onChange,
  accent = "#e91e3f",
  label = "우승자 디스코드 ID",
  required = false,
}: {
  value: string;
  onChange: (next: string) => void;
  accent?: string;
  label?: string;
  required?: boolean;
}) {
  const ids = parseIds(value);
  const { profiles, load } = useDiscordProfiles();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");

  useEffect(() => { load(ids); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  const add = (raw: string) => {
    const picked = parseIds(raw);
    if (picked.length === 0) {
      setError(raw.trim() ? "숫자로 된 디스코드 ID만 넣을 수 있습니다." : "");
      return;
    }
    const invalid = picked.filter((id) => !isValidId(id));
    const merged = Array.from(new Set([...ids, ...picked]));
    onChange(joinIds(merged));
    setDraft("");
    setError(invalid.length ? `형식이 이상한 ID가 있습니다 — ${invalid.join(", ")}` : "");
  };

  const remove = (id: string) => {
    onChange(joinIds(ids.filter((x) => x !== id)));
    setError("");
  };

  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <label className="block text-xs font-bold text-gray-500">
          {label}
          {required ? <span style={{ color: accent }}> *</span> : <span className="text-gray-600 font-medium"> (선택)</span>}
        </label>
        {ids.length > 0 && <span className="text-[10px] font-bold text-gray-500 tabular-nums">{ids.length}명</span>}
      </div>

      <div className="rounded-xl bg-[#121212] border border-white/10 p-2.5 focus-within:border-[color:var(--dii-accent)] transition-colors" style={{ ["--dii-accent" as any]: accent }}>
        {ids.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {ids.map((id) => {
              const p = profiles[id];
              const bad = p?.failed || !isValidId(id);
              return (
                <span
                  key={id}
                  className={`inline-flex items-center gap-2 pl-1 pr-1.5 py-1 rounded-full border text-xs font-bold ${bad ? "border-red-500/40 bg-red-500/10 text-red-300" : "border-white/10 bg-white/[0.06] text-white"}`}
                >
                  {p && !p.failed ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.avatarUrl} alt="" className="w-6 h-6 rounded-full bg-gray-800 object-cover" />
                  ) : (
                    <span className={`w-6 h-6 rounded-full grid place-items-center text-[10px] ${bad ? "bg-red-500/20" : "bg-white/10 animate-pulse"}`}>{bad ? "!" : ""}</span>
                  )}
                  <span className="max-w-[9rem] truncate">
                    {p && !p.failed ? p.globalName : bad ? "확인 실패" : "확인 중…"}
                  </span>
                  <button
                    type="button"
                    onClick={() => remove(id)}
                    aria-label="명단에서 제거"
                    className="w-5 h-5 shrink-0 grid place-items-center rounded-full text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                  >
                    ×
                  </button>
                </span>
              );
            })}
          </div>
        )}

        <div className="flex gap-2">
          <input
            type="text"
            inputMode="numeric"
            value={draft}
            onChange={(e) => { setDraft(e.target.value); setError(""); }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === "," || e.key === " ") { e.preventDefault(); add(draft); }
              if (e.key === "Backspace" && !draft && ids.length) remove(ids[ids.length - 1]);
            }}
            onPaste={(e) => {
              const text = e.clipboardData.getData("text");
              if (/[^0-9]/.test(text.trim())) { e.preventDefault(); add(text); }
            }}
            onBlur={() => draft.trim() && add(draft)}
            placeholder="ID 입력 후 Enter — 여러 개 붙여넣기도 됩니다"
            className="flex-1 min-w-0 bg-transparent px-2 py-2 text-sm text-white outline-none placeholder:text-gray-600"
          />
          <button
            type="button"
            onClick={() => add(draft)}
            disabled={!draft.trim()}
            className="shrink-0 px-3.5 py-2 rounded-lg text-xs font-bold text-white disabled:opacity-35 transition-opacity"
            style={{ background: accent }}
          >
            추가
          </button>
        </div>
      </div>

      <p className={`text-[11px] mt-2 leading-relaxed ${error ? "text-red-400" : "text-gray-600"}`}>
        {error || "디스코드 · 설정 → 고급 → 개발자 모드를 켜고 사용자 우클릭 → ‘사용자 ID 복사’"}
      </p>
    </div>
  );
}
