export const dynamic = "force-dynamic";
export const runtime = "nodejs"; // 글꼴을 fs 로 읽는다

import { createElement } from "react";
import { NextResponse } from "next/server";
import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { SKIN_OF } from "@/lib/itemEffects";
import { buildCard, CARD_SIZE, CARD_FONT, CARD_SKIN_KEYS, sampleCardData, fontCoverage } from "@/lib/botCards";
import { getCumulativeXpByLevel } from "@/lib/leveling";
import { COSMETIC_SAMPLE } from "@/lib/cosmeticSample";

// 📌 상품 상세 '디스코드' 미리보기 — 카드 스킨을 입힌 봇 /레벨 카드(lib/botCards.js cmdLevel)를 PNG 로 그린다.
//    GET ?skin=<SKINS 키>. 공개 — 예시 사람(lib/cosmeticSample.js)으로만 그리고 사용자 데이터는 쓰지 않는다.
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
