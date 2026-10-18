"use client";

// 📌 관리자 기능 검색 — 좌측 메뉴(AdminNav)가 모든 관리 화면에 붙으므로 여기 하나로 어디서나 뜬다.
//    · 여는 곳: PC 메뉴 맨 위 검색칸(SearchBox) · 모바일 「관리자 {페이지} ▾」 옆 돋보기(SearchButton) · Ctrl/⌘+K
//      ⚠ Ctrl+K 는 textarea · contenteditable 안이거나 먼저 받은 쪽이 있으면(defaultPrevented) 넘긴다 — 글쓰기 편집기의 링크 넣기
//    · 색인: app/admin/adminIndex.ts(메뉴와 같은 목록) + 개체(유저 · 아이템 · 상품 — 두 글자부터, 250ms 늦춰서)
//    · 맞추기: NFC · 공백/·/›/-/_ 빼고 소문자 → 앞부분 > 포함 > 경로 · 찾을 말 > 같은 뜻 > 초성. 같은 점수면 페이지 > 탭 > 패널 > 명령.
//      최근에 고른 것은 조금 올린다(localStorage — 읽기 · 쓰기 모두 try/catch, 없어도 그대로 동작). 영타(두벌식)는 한글로 바꿔 한 번 더 찾는다
//    · 창: PC 가운데(폭 640 · 위 12vh) / 모바일 아래 판(88dvh). z 140 — 상세 칸(60/120) · 확인 창(130)보다 위.
//      Esc 는 이 창만 닫는다(상세 칸이 같이 닫히지 않게 먼저 받아 멈춘다)
//    · 📌 옮기기: 창을 먼저 닫고 adminNavigate(ui.tsx) 로 — 화면이 건 떠나기 확인(상점 관리 「버리기」)을 거치고, 그 확인이 이 창 아래에 깔리지 않는다
import Link from "next/link";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ICON_PATHS, type IconName } from "../components/Icons";
import { playTone } from "@/lib/sfx";
import { ADMIN_INDEX, SYNONYMS, type AdminCounts, type AdminEntry, type AdminKind } from "./adminIndex";
import { adminNavigate } from "./ui";

// ── 글자 맞추기 ───────────────────────────────────────────
const STRIP = /[\s·›\-_:]/g;
export const normText = (s: string) => String(s || "").normalize("NFC").toLowerCase().replace(STRIP, "");

const CHO = ["ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];
const JUNG = "ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ";
const JONG = ["", "ㄱ", "ㄲ", "ㄳ", "ㄴ", "ㄵ", "ㄶ", "ㄷ", "ㄹ", "ㄺ", "ㄻ", "ㄼ", "ㄽ", "ㄾ", "ㄿ", "ㅀ", "ㅁ", "ㅂ", "ㅄ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];
const isJamo = (ch: string) => ch >= "ㄱ" && ch <= "ㅎ";
const choOf = (ch: string) => {
  const c = ch.charCodeAt(0) - 0xac00;
  return c >= 0 && c < 11172 ? CHO[Math.floor(c / 588)] : ch;
};

// 초성이 섞인 찾기 — 「ㅅㅈ」 · 「상ㅈ」(입력 중)도 「상점」에 걸린다. 앞부분이면 2, 안쪽이면 1
function choMatch(text: string, q: string): 0 | 1 | 2 {
  const t = Array.from(text);
  const qs = Array.from(q);
  if (!qs.some(isJamo) || qs.length > t.length) return 0;
  for (let i = 0; i + qs.length <= t.length; i++) {
    let ok = true;
    for (let j = 0; j < qs.length && ok; j++) {
      const a = t[i + j];
      const b = qs[j];
      ok = a === b || (isJamo(b) && choOf(a) === b);
    }
    if (ok) return i === 0 ? 2 : 1;
  }
  return 0;
}

// 두벌식 영타 → 한글 (「tkdwja」 → 「상점」)
const KEYMAP: Record<string, string> = {
  q: "ㅂ", w: "ㅈ", e: "ㄷ", r: "ㄱ", t: "ㅅ", y: "ㅛ", u: "ㅕ", i: "ㅑ", o: "ㅐ", p: "ㅔ",
  a: "ㅁ", s: "ㄴ", d: "ㅇ", f: "ㄹ", g: "ㅎ", h: "ㅗ", j: "ㅓ", k: "ㅏ", l: "ㅣ",
  z: "ㅋ", x: "ㅌ", c: "ㅊ", v: "ㅍ", b: "ㅠ", n: "ㅜ", m: "ㅡ",
  Q: "ㅃ", W: "ㅉ", E: "ㄸ", R: "ㄲ", T: "ㅆ", O: "ㅒ", P: "ㅖ",
};
const VOWEL2: Record<string, string> = { "ㅗㅏ": "ㅘ", "ㅗㅐ": "ㅙ", "ㅗㅣ": "ㅚ", "ㅜㅓ": "ㅝ", "ㅜㅔ": "ㅞ", "ㅜㅣ": "ㅟ", "ㅡㅣ": "ㅢ" };
const FINAL2: Record<string, string> = { "ㄱㅅ": "ㄳ", "ㄴㅈ": "ㄵ", "ㄴㅎ": "ㄶ", "ㄹㄱ": "ㄺ", "ㄹㅁ": "ㄻ", "ㄹㅂ": "ㄼ", "ㄹㅅ": "ㄽ", "ㄹㅌ": "ㄾ", "ㄹㅍ": "ㄿ", "ㄹㅎ": "ㅀ", "ㅂㅅ": "ㅄ" };
const FINAL_SPLIT: Record<string, [string, string]> = Object.fromEntries(Object.entries(FINAL2).map(([k, v]) => [v, [k[0], k[1]] as [string, string]]));

export function engToKor(s: string): string {
  let out = "";
  let c = "", v = "", f = "";
  const flush = () => {
    if (c && v) out += String.fromCharCode(0xac00 + (CHO.indexOf(c) * 21 + JUNG.indexOf(v)) * 28 + JONG.indexOf(f));
    else out += c + v;
    c = v = f = "";
  };
  for (const ch of s) {
    const j = KEYMAP[ch] ?? KEYMAP[ch.toLowerCase()];
    if (!j) { flush(); out += ch; continue; }
    if (!JUNG.includes(j)) {
      // 자음 — 받침으로 붙이거나(겹받침 포함) 새 글자를 시작한다
      if (c && v && !f && JONG.includes(j)) f = j;
      else if (c && v && f && FINAL2[f + j]) f = FINAL2[f + j];
      else { flush(); c = j; }
    } else if (c && v && f) {
      // 받침 뒤 모음 — 받침(겹받침이면 뒤 자음)이 다음 글자 첫소리로 넘어간다
      const split = FINAL_SPLIT[f];
      const next = split ? split[1] : f;
      f = split ? split[0] : "";
      flush();
      c = next;
      v = j;
    } else if (v) {
      if (VOWEL2[v + j]) v = VOWEL2[v + j];
      else { flush(); v = j; }
    } else v = j;
  }
  flush();
  return out;
}

// ── 색인 준비(한 번) ──────────────────────────────────────
const KIND_RANK: Record<AdminKind, number> = { page: 0, tab: 1, section: 2, action: 3 };
type Prepared = { e: AdminEntry; label: string; hay: string; alias: string; all: string; rank: number };
const SYN_NORM = SYNONYMS.map((g) => g.map(normText));
const PREPARED: Prepared[] = ADMIN_INDEX.map((e) => {
  const label = normText(e.label);
  const hay = normText(`${e.crumb} ${e.keywords}`);
  const base = label + hay;
  // 같은 뜻 묶음을 붙인다 — 「디스코드」 안의 「코드」가 쿠폰 묶음에 걸리지 않게 그 낱말은 빼고 본다
  const bare = base.replace(/디스코드/g, "");
  const alias = SYN_NORM.filter((g) => g.some((w) => bare.includes(w))).flat().join("|");
  return { e, label, hay, alias, all: `${base}|${alias}`, rank: KIND_RANK[e.kind] };
});

function scoreOf(p: Prepared, q: string, tokens: string[]): number {
  if (p.label.startsWith(q)) return 100;
  if (p.label.includes(q)) return 80;
  if (p.hay.includes(q)) return 60;
  if (p.alias.includes(q)) return 50;
  if (tokens.length > 1 && tokens.every((t) => p.all.includes(t))) return 45;
  const cho = choMatch(p.label, q);
  if (cho) return cho === 2 ? 40 : 30;
  return 0;
}

function searchIndex(q: string, tokens: string[], recent: Set<string>) {
  return PREPARED.map((p) => {
    const s = scoreOf(p, q, tokens);
    return { p, s: s ? s + (recent.has(p.e.id) ? 8 : 0) : 0 };
  })
    .filter((r) => r.s > 0)
    .sort((a, b) => b.s - a.s || a.p.rank - b.p.rank || a.p.e.label.length - b.p.e.label.length)
    .map((r) => r.p.e);
}

// ── 최근 고른 것 ──────────────────────────────────────────
const RECENT_KEY = "igloo:admin-search-recent";
const RECENT_MAX = 8;
type Row = { key: string; label: string; crumb: string; href: string; icon: IconName; count?: number };
const isRow = (r: unknown): r is Row => {
  const x = r as Row;
  return !!x && typeof x.key === "string" && typeof x.label === "string" && typeof x.href === "string" && x.href.startsWith("/");
};
function readRecent(): Row[] {
  try {
    const v = JSON.parse(window.localStorage.getItem(RECENT_KEY) || "[]");
    return Array.isArray(v) ? v.filter(isRow).slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}
function writeRecent(rows: Row[]) {
  try { window.localStorage.setItem(RECENT_KEY, JSON.stringify(rows.slice(0, RECENT_MAX))); } catch {}
}

// ── 개체 검색(유저 · 아이템 · 상품) ─────────────────────────
//    아이템 · 상품 목록은 처음 찾을 때 한 번 받아 60초 둔다(읽기만 — 상품 목록은 ?groups=1 을 붙이지 않는다: 그 주소는 순서를 맞춰 쓴다)
type CatRow = { id: string; name: string; cat: string; norm: string };
type Catalog = { at: number; items: CatRow[]; products: CatRow[] };
let catalog: Catalog | null = null;
let catalogLoading: Promise<Catalog> | null = null;
const CATALOG_TTL = 60_000;
const catRows = (d: unknown): CatRow[] => {
  const list = (d as { data?: unknown })?.data;
  return Array.isArray(list)
    ? list
        // 📌 분류는 이름과 따로(lib/itemCategory — API shortName · categoryLabel). 이름이 같은 「골드」(카드 테두리 · 프로필 테두리)가 분류로 갈린다
        .map((x: { _id?: unknown; name?: unknown; shortName?: unknown; categoryLabel?: unknown }) => ({ id: String(x?._id || ""), name: String(x?.shortName || x?.name || "").trim(), cat: String(x?.categoryLabel || "").trim() }))
        .filter((x) => x.id && x.name)
        .map((x) => ({ ...x, norm: normText(`${x.cat} ${x.name}`) }))
    : [];
};
function loadCatalog(): Promise<Catalog> {
  if (catalog && Date.now() - catalog.at < CATALOG_TTL) return Promise.resolve(catalog);
  if (catalogLoading) return catalogLoading;
  const get = (url: string) => fetch(url, { cache: "no-store" }).then((r) => r.json()).catch(() => null);
  catalogLoading = Promise.all([get("/api/admin/items"), get("/api/shop/items?all=1")])
    .then(([it, pr]) => {
      const next: Catalog = { at: Date.now(), items: catRows(it), products: catRows(pr) };
      catalog = next;
      return next;
    })
    .finally(() => { catalogLoading = null; });
  return catalogLoading;
}
const matchCat = (rows: CatRow[], qs: string[], max: number) =>
  rows
    .map((r) => {
      let s = 0;
      for (const q of qs) {
        const v = r.norm.startsWith(q) ? 3 : r.norm.includes(q) ? 2 : choMatch(r.norm, q) ? 1 : 0;
        if (v > s) s = v;
      }
      return { r, s };
    })
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.r.name.length - b.r.name.length)
    .slice(0, max)
    .map((x) => x.r);

type UserHit = { userId?: string; username?: string; displayName?: string };
type Entities = { q: string; users: Row[]; items: Row[]; products: Row[] };

// ── 효과음 — 관리 화면 공용 소리(app/admin/pass 등 sfxTick 과 같은 소리) ──
const sfxTick = () => playTone(740, 0.06, "sine", 0.03);

// ── 아이콘 ────────────────────────────────────────────────
function Glyph({ name, className = "w-4 h-4" }: { name: IconName; className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d={ICON_PATHS[name]} />
    </svg>
  );
}
const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || "");

// ── PC 메뉴 맨 위 검색칸 ──────────────────────────────────
export function SearchBox({ onOpen, dark = false }: { onOpen: () => void; dark?: boolean }) {
  const [mac] = useState(isMac);
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="기능 검색"
      className={`w-full h-10 px-3 rounded-lg border flex items-center text-[13px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#131313]/20 ${
        dark ? "border-white/20 text-gray-400 hover:border-white/50 bg-transparent" : "border-[#a3a3a3] text-[#8a8a8a] hover:border-[#131313] bg-white"
      }`}
    >
      <Glyph name="search" className="w-4 h-4 shrink-0" />
      <span className="ml-2 min-w-0 truncate">기능 검색</span>
      <kbd className={`ml-auto shrink-0 h-[22px] px-1.5 rounded-md text-[11px] font-bold font-sans leading-[22px] ${dark ? "bg-white/10 text-gray-300" : "bg-[#f2f2f2] text-[#5a5a5a]"}`}>{mac ? "⌘ K" : "Ctrl K"}</kbd>
    </button>
  );
}

// ── 모바일 돋보기 단추 ────────────────────────────────────
export function SearchButton({ onOpen, dark = false }: { onOpen: () => void; dark?: boolean }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="기능 검색"
      className={`shrink-0 w-10 h-10 rounded-full border flex items-center justify-center outline-none ${dark ? "border-white/20 text-white" : "border-[#a3a3a3] text-[#131313]"}`}
    >
      <Glyph name="search" className="w-[18px] h-[18px]" />
    </button>
  );
}

// ── 검색 창 ───────────────────────────────────────────────
export default function AdminSearch({
  open,
  onOpenChange,
  counts,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  counts: AdminCounts;
}) {
  // 📌 Ctrl/⌘+K — 창이 닫혀 있어도 듣는다(AdminNav 는 관리자 화면에서만 붙는다)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat || e.isComposing || e.altKey || e.shiftKey) return;
      if (!(e.ctrlKey || e.metaKey) || (e.key !== "k" && e.key !== "K")) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      e.preventDefault();
      onOpenChange(!open);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  if (!open) return null;
  return <Palette onClose={() => onOpenChange(false)} counts={counts} />;
}

function Palette({ onClose, counts }: { onClose: () => void; counts: AdminCounts }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [recent, setRecent] = useState<Row[]>(readRecent);
  const [ent, setEnt] = useState<Entities | null>(null);

  // 열자마자 입력칸 — 닫으면 연 자리로 포커스를 돌려준다
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    inputRef.current?.focus({ preventScroll: true });
    return () => { try { prev?.focus?.({ preventScroll: true }); } catch {} };
  }, []);

  // Esc 는 이 창만 — 바깥(상세 칸 · 페이지)의 Esc 처리보다 먼저 받아 멈춘다
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.isComposing) return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const raw = query.trim();
  const q = normText(raw);
  const tokens = useMemo(() => raw.split(/\s+/).map(normText).filter(Boolean), [raw]);

  // 기능 — 영타로 친 말은 아무것도 안 걸릴 때만 한글로 바꿔 다시 찾는다(「xp」 같은 짧은 영문이 엉뚱한 한글에 걸리지 않게)
  const features = useMemo(() => {
    if (!q) return [] as AdminEntry[];
    const rec = new Set(recent.map((r) => r.key));
    const hit = searchIndex(q, tokens, rec);
    if (hit.length || !/[a-z]/i.test(raw)) return hit;
    const k = normText(engToKor(raw));
    if (!k || k === q) return hit;
    return searchIndex(k, raw.split(/\s+/).map((t) => normText(engToKor(t))).filter(Boolean), rec);
  }, [q, raw, tokens, recent]);

  // 개체 — 두 글자부터, 250ms 늦춰서. 초성만 친 말은 유저를 찾지 않는다
  useEffect(() => {
    if (raw.length < 2) return;
    let alive = true;
    const timer = setTimeout(async () => {
      const jamoOnly = Array.from(raw.replace(/\s/g, "")).every(isJamo);
      const [users, cat] = await Promise.all([
        jamoOnly
          ? Promise.resolve([] as UserHit[])
          : fetch(`/api/admin/users?q=${encodeURIComponent(raw)}`, { cache: "no-store" })
              .then((r) => r.json())
              .then((d) => (Array.isArray(d?.data) ? (d.data as UserHit[]) : []))
              .catch(() => [] as UserHit[]),
        loadCatalog().catch(() => null),
      ]);
      if (!alive) return;
      const qs = [normText(raw)];
      if (/[a-z]/i.test(raw)) qs.push(normText(engToKor(raw)));
      setEnt({
        q: raw,
        users: users.slice(0, 5).flatMap((u) => {
          const id = String(u.userId || "");
          if (!id) return [];
          const name = String(u.displayName || u.username || id);
          return [{
            key: `user:${id}`,
            label: name,
            crumb: u.username ? `@${u.username}` : "유저 조회",
            href: `/admin/users?q=${encodeURIComponent(String(u.username || id))}&userId=${encodeURIComponent(id)}`,
            icon: "user" as IconName,
          }];
        }),
        items: cat ? matchCat(cat.items, qs, 8).map((r) => ({ key: `item:${r.id}`, label: r.name, crumb: r.cat ? `상점 관리 › 아이템 · ${r.cat}` : "상점 관리 › 아이템", href: `/admin/shop?tab=items&item=${encodeURIComponent(r.id)}`, icon: "gift" as IconName })) : [],
        products: cat ? matchCat(cat.products, qs, 8).map((r) => ({ key: `product:${r.id}`, label: r.name, crumb: r.cat ? `상점 관리 › 상품 · ${r.cat}` : "상점 관리 › 상품", href: `/admin/shop?tab=products&edit=${encodeURIComponent(r.id)}`, icon: "bag" as IconName })) : [],
      });
    }, 250);
    return () => { alive = false; clearTimeout(timer); };
  }, [raw]);

  // ── 보여 줄 묶음 ──
  const sections = useMemo(() => {
    const out: { title: string; rows: Row[] }[] = [];
    if (!q) {
      const byId = new Map(ADMIN_INDEX.map((e) => [e.id, e]));
      // 최근 — 색인 항목은 지금 이름으로 다시 읽는다(이름이 바뀌어도 옛 글자가 남지 않게). 색인에서 빠진 항목은 버린다
      const rec = recent
        .flatMap((r) => {
          if (r.key.startsWith("user:") || r.key.startsWith("item:") || r.key.startsWith("product:")) return [r];
          const e = byId.get(r.key);
          return e ? [{ key: e.id, label: e.label, crumb: e.crumb, href: e.href, icon: e.icon }] : [];
        })
        .slice(0, 5);
      if (rec.length) out.push({ title: "최근", rows: rec });
      const todo = ([
        { key: "todo:inquiry", label: "미답변 문의", crumb: "1:1 문의", href: "/support?admin=1", icon: "chat", count: counts.inquiry },
        { key: "todo:apply", label: "심사 중 지원", crumb: "구인 지원자", href: "/recruit?admin=1", icon: "briefcase", count: counts.apply },
        { key: "todo:orders", label: "구매 처리 대기", crumb: "상점 관리 › 구매 내역", href: "/admin/shop?tab=orders", icon: "receipt", count: counts.orders },
        { key: "todo:reports", label: "미처리 신고", crumb: "서포터즈 › 신고·피드백", href: "/admin/supporters?tab=reports", icon: "shieldCheck", count: counts.supportReports },
      ] as Row[]).filter((r) => (r.count || 0) > 0);
      if (todo.length) out.push({ title: "확인할 일", rows: todo });
      if (!out.length) {
        out.push({ title: "기능", rows: ADMIN_INDEX.filter((e) => e.kind === "page").map((e) => ({ key: e.id, label: e.label, crumb: e.crumb, href: e.href, icon: e.icon })) });
      }
      return out;
    }
    if (features.length) out.push({ title: "기능", rows: features.slice(0, 8).map((e) => ({ key: e.id, label: e.label, crumb: e.crumb, href: e.href, icon: e.icon })) });
    if (ent && ent.q === raw) {
      if (ent.users.length) out.push({ title: "유저", rows: ent.users });
      if (ent.items.length) out.push({ title: "아이템", rows: ent.items });
      if (ent.products.length) out.push({ title: "상품", rows: ent.products });
    }
    return out;
  }, [q, raw, features, ent, recent, counts]);

  const flat = useMemo(() => sections.flatMap((s) => s.rows), [sections]);
  // 묶음마다 첫 줄 번호 — ↑↓ 이동 · 고른 줄 표시는 묶음을 건너 하나로 센다
  const starts = useMemo(() => sections.map((_, i) => sections.slice(0, i).reduce((t, x) => t + x.rows.length, 0)), [sections]);
  const cur = Math.min(active, Math.max(0, flat.length - 1));
  const waiting = raw.length >= 2 && !(ent && ent.q === raw);

  const go = useCallback(
    (row: Row, newTab = false) => {
      sfxTick();
      const next = [{ key: row.key, label: row.label, crumb: row.crumb, href: row.href, icon: row.icon }, ...readRecent().filter((r) => r.key !== row.key)];
      if (!row.key.startsWith("todo:")) {
        writeRecent(next);
        setRecent(next.slice(0, RECENT_MAX));
      }
      if (newTab) {
        window.open(row.href, "_blank", "noopener");
        return;
      }
      // 창을 먼저 닫고 옮긴다 — 화면의 떠나기 확인(registerLeaveGuard)이 뜨면 이 창 없이 그 확인만 보인다. 멈추면(취소) 그 화면에 그대로
      onClose();
      void adminNavigate(router, row.href);
    },
    [onClose, router]
  );

  // 📌 결과 줄 누르기는 창(window) 캡처에서 먼저 받는다 — 화면이 문서(document) 캡처로 링크 누르기를 막으면(상점 관리 「버리기」 확인)
  //    그 확인이 이 창(z 140) 아래(z 130)에 뜨고 창은 그대로 남았다. 여기서 멈추고 go(창 닫기 → adminNavigate)로 같은 확인을 거친다.
  //    새 탭으로 여는 누르기(Ctrl · ⌘ · Shift · Alt · 가운데 단추)는 건드리지 않는다(브라우저 기본)
  const live = useRef({ flat, go });
  useEffect(() => {
    live.current = { flat, go };
  });
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const el = (e.target as Element | null)?.closest?.("[data-row]");
      const list = listRef.current;
      if (!el || !list || !list.contains(el)) return;
      const row = live.current.flat[Number(el.getAttribute("data-row"))];
      if (!row) return;
      e.preventDefault();
      e.stopPropagation();
      live.current.go(row);
    };
    window.addEventListener("click", onClick, true);
    return () => window.removeEventListener("click", onClick, true);
  }, []);

  const move = (d: number) => {
    if (!flat.length) return;
    const n = (cur + d + flat.length) % flat.length;
    setActive(n);
    requestAnimationFrame(() => listRef.current?.querySelector<HTMLElement>(`[data-row="${n}"]`)?.scrollIntoView({ block: "nearest" }));
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      e.stopPropagation();
      move(e.key === "ArrowDown" ? 1 : -1);
    } else if (e.key === "Enter") {
      const row = flat[cur];
      if (!row) return;
      e.preventDefault();
      e.stopPropagation();
      go(row, e.ctrlKey || e.metaKey);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[140] flex items-end md:items-start md:justify-center bg-black/40 overlay-in"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="기능 검색"
        onKeyDown={onKeyDown}
        className="w-full md:w-[640px] md:max-w-[calc(100vw-2rem)] md:mt-[12vh] h-[88dvh] md:h-auto md:max-h-[76vh] flex flex-col bg-white text-[#131313] rounded-t-2xl md:rounded-2xl border border-[#ededed] shadow-[0_28px_56px_-28px_rgba(0,0,0,0.35)] overflow-hidden pb-[env(safe-area-inset-bottom)] md:pb-0"
      >
        {/* 입력 줄 */}
        <div className="shrink-0 h-14 px-4 flex items-center border-b border-[#ededed]">
          <Glyph name="search" className="w-[18px] h-[18px] shrink-0 text-[#5a5a5a]" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActive(0); }}
            placeholder="기능 검색"
            role="combobox"
            aria-expanded="true"
            aria-controls="admin-search-list"
            aria-activedescendant={flat[cur] ? `admin-search-row-${cur}` : undefined}
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="go"
            className="ml-3 flex-1 min-w-0 h-full bg-transparent outline-none text-base md:text-[15px] font-bold placeholder:text-[#a3a3a3] placeholder:font-normal"
          />
          {query && (
            <button
              type="button"
              aria-label="지우기"
              onClick={() => { setQuery(""); setActive(0); inputRef.current?.focus(); }}
              className="ml-2 shrink-0 w-7 h-7 rounded-full bg-[#f2f2f2] text-[#5a5a5a] hover:text-[#131313] flex items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-[#131313]/20"
            >
              <Glyph name="close" className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="ml-2 shrink-0 h-7 px-2 rounded-md bg-[#f2f2f2] text-[11px] font-bold text-[#5a5a5a] hover:text-[#131313] outline-none focus-visible:ring-2 focus-visible:ring-[#131313]/20"
          >
            <span className="hidden md:inline">Esc</span>
            <span className="md:hidden">닫기</span>
          </button>
        </div>

        {/* 결과 */}
        <div ref={listRef} id="admin-search-list" role="listbox" aria-label="검색 결과" className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-2 py-2">
          {sections.map((s, si) => (
            <div key={s.title} role="group" aria-label={s.title} className="mb-1.5 last:mb-0">
              <p className="px-3 pt-2 pb-1 text-[11px] font-black tracking-[0.04em] text-[#8a8a8a]">{s.title}</p>
              {s.rows.map((r, ri) => {
                const i = starts[si] + ri;
                const on = i === cur;
                return (
                  <Link
                    key={r.key}
                    id={`admin-search-row-${i}`}
                    data-row={i}
                    role="option"
                    aria-selected={on}
                    href={r.href}
                    prefetch={false}
                    onMouseMove={() => { if (!on) setActive(i); }}
                    // 보통 누르기는 위 창 캡처(go)가 받는다 — 가운데 · Ctrl/⌘ 누르기는 브라우저 기본(새 탭)
                    className={`flex items-center h-11 px-3 rounded-xl outline-none ${on ? "bg-[#f2f2f2]" : ""}`}
                  >
                    <span className={`shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-[#5a5a5a] ${on ? "bg-white" : "bg-[#f2f2f2]"}`}>
                      <Glyph name={r.icon} className="w-4 h-4" />
                    </span>
                    <span className="ml-3 min-w-0 flex-1 truncate text-[14px] font-bold">{r.label}</span>
                    {r.count ? (
                      <span className="ml-3 shrink-0 min-w-[20px] h-5 px-1.5 rounded-full bg-[#e91e3f] text-white text-[11px] font-black tabular-nums leading-5 text-center">{r.count > 99 ? "99+" : r.count}</span>
                    ) : null}
                    <span className="ml-3 shrink-0 max-w-[45%] truncate text-[12px] text-[#8a8a8a]">{r.crumb}</span>
                  </Link>
                );
              })}
            </div>
          ))}
          {q && !flat.length && !waiting && <p className="px-3 py-6 text-center text-[13px] text-[#8a8a8a]">결과 없음</p>}
        </div>

        {/* 키 안내 — PC 만 */}
        <div className="hidden md:flex shrink-0 h-10 px-4 items-center border-t border-[#ededed] text-[11px] font-bold text-[#8a8a8a]">
          <kbd className="h-5 px-1.5 rounded bg-[#f2f2f2] text-[#5a5a5a] font-sans leading-5">↑↓</kbd>
          <span className="ml-1.5">이동</span>
          <kbd className="ml-4 h-5 px-1.5 rounded bg-[#f2f2f2] text-[#5a5a5a] font-sans leading-5">Enter</kbd>
          <span className="ml-1.5">열기</span>
          <kbd className="ml-4 h-5 px-1.5 rounded bg-[#f2f2f2] text-[#5a5a5a] font-sans leading-5">Esc</kbd>
          <span className="ml-1.5">닫기</span>
        </div>
      </div>
    </div>
  );
}
