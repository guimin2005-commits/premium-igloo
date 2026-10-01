export const dynamic = "force-dynamic";
export const runtime = "nodejs"; // 글꼴을 fs 로 읽는다

import { createElement } from "react";
import { NextResponse } from "next/server";
import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { requireAdmin } from "@/lib/apiAuth";
import { buildCard, cardSizeOf, CARD_FONT, CARD_TIERS, isCardKind, sampleCardData, fontCoverage, fetchAvatarDataUri } from "@/lib/botCards";
import { itemArtSvg } from "@/lib/itemArt";

// 📌 관리자 '봇 메시지' 이미지 카드 미리보기 — 봇이 붙이는 PNG 와 같은 템플릿(lib/botCards.js)을 샘플 값으로 그린다
//    GET ?key=levelUp|roleGrant|cmdLevel|cmdRank|cmdAttend|cmdQuest|cmdInventory|cmdPass|rankerAnnounce&tier=<0-9, 없으면 브론즈>
//    한 사람 카드는 미리보기를 여는 관리자 이름 · 사진으로 그린다(사진을 못 받으면 첫 글자 원형).

const fail = (message, status = 400) => NextResponse.json({ success: false, message, error: message }, { status });

// 📌 경로는 글자 그대로 적는다 — 배포 때 파일 추적이 이 글꼴들을 함수에 함께 싣도록 (lib/botCards.js 의 CARD_FONT_FILES 와 같은 파일)
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

export async function GET(request) {
  const auth = await requireAdmin();
  if (auth.deny) return auth.deny;

  const sp = request.nextUrl.searchParams;
  const key = sp.get("key") || "";
  if (!isCardKind(key)) return fail("잘못된 카드입니다.");
  const tierRaw = sp.get("tier");
  if (tierRaw !== null && tierRaw !== "" && !(/^\d+$/.test(tierRaw) && Number(tierRaw) < CARD_TIERS.length)) return fail("잘못된 등급입니다.");
  const tier = tierRaw === null || tierRaw === "" ? 1 : Number(tierRaw);

  try {
    const one = key !== "rankerAnnounce";
    const [{ fonts, has }, avatar] = await Promise.all([loadFonts(), one ? fetchAvatarDataUri(auth.session?.user?.image) : null]);
    const data = sampleCardData(key, tier, avatar);
    if (one && auth.name) data.name = auth.name;
    const { width, height } = cardSizeOf(key, data);
    // 도트 아이콘("art:<키>") — 봇과 같은 96px 그림
    const art = (k) => itemArtSvg(k, { size: 96 });
    return new ImageResponse(buildCard(key, data, createElement, { has, art }), {
      width,
      height,
      fonts,
      headers: { "Cache-Control": "private, max-age=60" },
    });
  } catch (e) {
    console.error("봇 메시지 카드 미리보기 오류:", e);
    return fail("카드를 그리지 못했습니다.", 500);
  }
}
