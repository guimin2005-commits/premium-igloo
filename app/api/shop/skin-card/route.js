export const dynamic = "force-dynamic";
export const runtime = "nodejs"; // 글꼴을 fs 로 읽는다

import { createElement } from "react";
import { NextResponse } from "next/server";
import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { SKIN_OF } from "@/lib/itemEffects";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/authOptions";
import { connectToDatabase } from "@/lib/mongodb";
import UserXp from "@/models/UserXp";
import { buildCard, CARD_SIZE, CARD_FONT, CARD_SKIN_KEYS, sampleCardData, fontCoverage, fetchAvatarDataUri } from "@/lib/botCards";
import { getCumulativeXpByLevel } from "@/lib/leveling";
import { COSMETIC_SAMPLE } from "@/lib/cosmeticSample";

// 📌 상품 상세 '디스코드' 미리보기 — 카드 스킨을 입힌 봇 /레벨 카드(lib/botCards.js cmdLevel)를 PNG 로 그린다.
//    GET ?skin=<SKINS 키>. 로그인 안 했으면 예시 사람(lib/cosmeticSample.js) — 공개 · 길게 캐시.
//    ?me=1 이고 로그인했으면 **본인**(세션의 이름 · 디스코드 사진 · 레벨 · 순위)으로 그린다(2026-10-01 "미리보기는 개인 프로필이 적용되게").
//    본인 값은 세션에서만 읽는다 — 다른 사람 값을 그릴 길은 없다. 응답은 브라우저 캐시 없음(no-store) + 메모리 5분(사람 · 스킨별).
//    스킨마다 그림이 하나뿐이라 길게 캐시한다(브라우저 · CDN) + 같은 스킨을 다시 그리지 않게 메모리에도 둔다(스킨 수만큼만 — 키는 검증된 것뿐).
//    봇 카드가 아직 그리지 못하는 스킨(CARD_SKINS 에 없음)도 400 — 기본 카드를 그 스킨인 것처럼 보이면 안 된다.

const fail = (message, status = 400) => NextResponse.json({ success: false, message, error: message }, { status });

// 📌 경로는 글자 그대로 적는다 — 배포 때 파일 추적이 이 글꼴들을 함수에 함께 싣도록 (관리자 카드 미리보기와 같은 파일)
const FONT_FILES = [
  { weight: 500, path: join(process.cwd(), "assets/fonts/Pretendard-Medium.otf") },
  { weight: 700, path: join(process.cwd(), "assets/fonts/Pretendard-Bold.otf") },
  { weight: 900, path: join(process.cwd(), "assets/fonts/Pretendard-Black.otf") },
];

let fontsPromise = null;
function loadFonts() {
  if (!fontsPromise) {
    fontsPromise = Promise.all(FONT_FILES.map((f) => readFile(f.path)))
      .then((bufs) => ({
        fonts: bufs.map((data, i) => ({ name: CARD_FONT, data, weight: FONT_FILES[i].weight, style: "normal" })),
        has: fontCoverage(bufs[0]),
      }))
      .catch((e) => {
        fontsPromise = null; // 다음 요청에서 다시 읽는다
        throw e;
      });
  }
  return fontsPromise;
}

// 예시 사람의 사진 — 사이트 미리보기와 같은 로고 펭귄(public/logo.png). 못 읽으면 이름 첫 글자 원형(카드가 알아서 그린다)
const LOGO_FILE = join(process.cwd(), "public/logo.png");
let logoPromise = null;
function loadLogo() {
  if (!logoPromise) {
    logoPromise = readFile(LOGO_FILE)
      .then((buf) => `data:image/png;base64,${buf.toString("base64")}`)
      .catch(() => {
        logoPromise = null;
        return null;
      });
  }
  return logoPromise;
}

// 예시 사람의 /레벨 카드 값 — 사이트 미리보기 카드와 같은 레벨 · 진행률(누적 XP 는 lib/leveling.js 공식)
function sampleData(skin, avatar) {
  const s = COSMETIC_SAMPLE;
  const base = getCumulativeXpByLevel(s.level);
  const step = getCumulativeXpByLevel(s.level + 1) - base;
  const cur = Math.floor(step * s.progress);
  return {
    ...sampleCardData("cmdLevel", 0, avatar, skin),
    name: s.name,
    level: s.level,
    xp: base + cur,
    need: step - cur,
    progress: cur / step,
    rank: s.rank,
    total: s.total,
  };
}

// 카드 값 → PNG 바이트
async function render(data) {
  const { fonts, has } = await loadFonts();
  const { width, height } = CARD_SIZE.cmdLevel;
  const res = new ImageResponse(buildCard("cmdLevel", data, createElement, { has }), { width, height, fonts });
  return new Uint8Array(await res.arrayBuffer());
}

// 📌 본인 /레벨 카드 값 — /api/xp/me 와 같은 계산(레벨 구간 진행 · 순위 = 나보다 위인 사람 + 1).
//    동점은 userId 오름차순 — 서버 랭킹 · 내 정보 · 봇 /레벨 · /랭크와 같은 규칙(2026-10-04 "규칙 하나로 맞추면")
async function myData(session, skin) {
  await connectToDatabase();
  const doc = await UserXp.findOne({ userId: session.user.id }, { xp: 1, level: 1 }).lean();
  const xp = doc?.xp || 0;
  const level = doc?.level || 0;
  const [above, total, avatar] = await Promise.all([
    UserXp.countDocuments({ $or: [{ xp: { $gt: xp } }, { xp, userId: { $lt: session.user.id } }] }),
    UserXp.countDocuments(),
    fetchAvatarDataUri(session.user.image).catch(() => null),
  ]);
  const cur = getCumulativeXpByLevel(level);
  const next = getCumulativeXpByLevel(level + 1);
  return {
    ...sampleCardData("cmdLevel", 0, avatar, skin),
    name: String(session.user.name || ""),
    level,
    xp,
    need: Math.max(0, next - xp),
    progress: Math.min(1, Math.max(0, (xp - cur) / Math.max(1, next - cur))),
    rank: above + 1,
    total,
  };
}
// 본인 카드 메모리 캐시 — 사람 · 스킨별 5분, 많아야 200장(오래된 것부터 버린다)
const MINE_TTL = 5 * 60 * 1000;
const mineCache = new Map();
async function minePng(session, skin) {
  const key = `${session.user.id}:${skin}`;
  const hit = mineCache.get(key);
  if (hit && Date.now() - hit.at < MINE_TTL) return hit.png;
  const png = await render(await myData(session, skin));
  mineCache.delete(key);
  mineCache.set(key, { at: Date.now(), png });
  if (mineCache.size > 200) mineCache.delete(mineCache.keys().next().value);
  return png;
}

// 스킨 → PNG 바이트(Promise). 실패하면 지워 다음 요청에서 다시 그린다
const pngCache = new Map();
function pngOf(skin) {
  let p = pngCache.get(skin);
  if (!p) {
    p = (async () => {
      const [{ fonts, has }, avatar] = await Promise.all([loadFonts(), loadLogo()]);
      const { width, height } = CARD_SIZE.cmdLevel;
      const res = new ImageResponse(buildCard("cmdLevel", sampleData(skin, avatar), createElement, { has }), { width, height, fonts });
      return new Uint8Array(await res.arrayBuffer());
    })();
    pngCache.set(skin, p);
    p.catch(() => pngCache.delete(skin));
  }
  return p;
}

export async function GET(request) {
  const skin = request.nextUrl.searchParams.get("skin") || "";
  if (!Object.prototype.hasOwnProperty.call(SKIN_OF, skin) || !CARD_SKIN_KEYS.includes(skin)) return fail("잘못된 스킨입니다.");

  try {
    if (request.nextUrl.searchParams.get("me") === "1") {
      const session = await getServerSession(authOptions);
      if (session?.user?.id) {
        const png = await minePng(session, skin);
        // 📌 본인 카드는 URL 이 누구든 같다 — 브라우저 캐시에 두면 같은 기기에서 계정을 바꿔도 앞 사람 카드가 보인다. 다시 그리는 비용은 mineCache 가 막는다
        return new NextResponse(png, { headers: { "Content-Type": "image/png", "Cache-Control": "private, no-store" } });
      }
    }
    const png = await pngOf(skin);
    return new NextResponse(png, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=86400, s-maxage=2592000, stale-while-revalidate=86400",
      },
    });
  } catch (e) {
    console.error("스킨 카드 미리보기 오류:", e);
    return fail("카드를 그리지 못했습니다.", 500);
  }
}
