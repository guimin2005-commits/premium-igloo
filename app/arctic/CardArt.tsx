import ItemIcon from "../components/ItemIcon";
import { itemTypeColor, artKeyOf, presetKeyOf } from "@/lib/items";
import { backdropSrc } from "@/lib/itemBackdrops";
import { legacyFrameArtOf, productIconOf } from "@/lib/cosmeticArt";

// 📌 카드 그림 자리 — 상품 이미지 > 아이템 이미지 > 아이콘(ItemIcon: 프리셋 SVG·이모지·유형 기본).
//    배경은 등록 색을 연하게 깐 그라데이션이라 이미지 없는 상품도 서로 구분된다.
//    상점 목록 · 찜 · 장바구니 · 결제가 한 벌을 같이 쓴다 (한쪽만 imageUrl 을 보면 빈 회색 칸이 된다).
//    absolute 로 꽉 채우므로 부모는 relative overflow-hidden 이어야 한다.
//    stage: 상품 카드 · 상세처럼 큰 칸 — 아이콘을 칸 폭의 절반 가까이 키우고 아래에 도트 그림자를 깐다(사용자 결정 B안, 2026-09-29).
//           크기는 인라인 폭 46%(칸 폭 비례) 하나로 정한다 — 컨테이너 단위 · round() 같은 새 CSS 에 기대면 안 되는 브라우저에서
//           규칙이 통째로 빠져 아이콘이 원래 그림 크기(256px)로 칸을 가득 채웠다(2026-09-30 "아이템 비정상적으로 커짐").
//           이모지 아이콘은 글자라 폭 비례가 안 되므로 96px 고정. iconSize 는 쓰지 않는다.
//           장바구니 · 결제 썸네일처럼 작은 칸은 stage 없이 iconSize 로 그대로.
//    📌 배경 장면(it.backdrop — lib/itemBackdrops.js, 2026-09-30 "아이콘만 달랑 있어 없어 보인다" → 장면 24종 중 관리자가 고름):
//       stage 칸에서만 그라데이션 대신 64×64 도트 장면을 꽉 채워 깐다(image-rendering: pixelated — 키워도 도트가 번지지 않게).
//       상품 이미지가 있고 장면도 골랐으면(2026-10-01 "내가 등록한 이미지들의 배경도 적용") 장면 위에 이미지를 아이콘처럼 세운다 —
//       아이콘과 같은 폭 46% · 정사각 · object-contain(투명 PNG 물건 그림이 땅에 선다). 장면을 안 고른 이미지는 예전처럼 칸을 꽉 채운다. 작은 썸네일(stage 없음 — 장바구니 80px · 결제 56px · 구매 창 80px)은 장면을 쓰지 않는다:
//       깔아서 나란히 비교해 보니 64 → 56 · 80 은 정수 배율이 아니라 도트가 고르게 안 떨어져 자글자글했고,
//       28~36px 아이콘이 장면 무늬에 묻히며 가운데 정렬이라 땅에 서지도 않았다(2026-09-30 실측 비교 후 결정).
// 📌 세트 상품 그림 — 상품 이미지가 없으면 구성 아이콘으로 그린다. 모양 두 가지(상품 setArt):
//    "" 겹친 카드(기본 · 2026-10-11 운영자 "앞에 메인 상품 있고 양 옆 뒤쪽으로 상품 배치") — 대표가 단품과 같은 자리(46%)에 서고,
//       구성 둘이 양옆 뒤에 조금 어둡게. 대표 = 관리자가 고른 상품 아이콘 > 구성 중 배지(테두리 · 스킨이 아닌 것) > 첫 구성. 작은 칸은 대표만. 「N종」 칩 없음
//    "combo" 구성 합치기(지금 방식도 남기기 — 운영자 "지금 있는 방식도 같이 남기라") — 구성 차례 그대로(관리 상품 폼에서 끌어 바꾼다)
//       2개 = 나란히 겹침 · 3개 = 뒤 하나 앞 둘 · 4개 = 2×2 · 5개 이상 = 앞 4개 2×2 + 「+N」.
//    자리 · 크기는 칸 비율(%)이라 상품 카드 · 상세 · 결제 썸네일 · 관리 목록이 같은 모양. 작은 칸(small)은 그림자 · 「+N」 없이.
//    구성 표기는 목록 · 상세 API 의 bundleItems(lib/bundleServer withBundleItems). 관리자가 고른 상품 아이콘은 세트 그림에선 쓰지 않는다
//    구성 아이콘도 상품 그림과 같은 고르기(cosmeticKeys — 목록 API, lib/cosmeticArt productIconOf)
type BundlePart = { icon?: string; imageUrl?: string; type?: string; color?: string; cosmeticKeys?: { skin?: string; scene?: string; frame?: string } };
export const bundlePartsOf = (it: any): BundlePart[] =>
  it?.type === "bundle" && Array.isArray(it?.bundleItems) ? it.bundleItems.filter((c: any) => c && typeof c === "object") : [];
const COMBO: Record<number, [number, number, number][]> = {
  2: [[18, 22, 50], [44, 30, 50]],
  3: [[31, 10, 42], [14, 38, 42], [46, 38, 42]],
  4: [[15, 12, 36], [51, 12, 36], [15, 46, 36], [51, 46, 36]],
};
const partIcon = (p: BundlePart) => { const fx = productIconOf(p); return { icon: String((fx ? fx.icon : p.icon) || ""), img: (fx ? fx.imageUrl : p.imageUrl) || "" }; };
const isEmoji = (icon: string) => !!icon && !artKeyOf(icon) && !presetKeyOf(icon) && !/^(art|svg):/.test(icon);
function PartIcon({ p, icon, img, small }: { p: BundlePart; icon: string; img: string; small: boolean }) {
  return isEmoji(icon)
    ? <ItemIcon icon={icon} imageUrl={img} type={p.type} size={small ? 16 : 56} color={p.color || itemTypeColor(p.type)} />
    : <ItemIcon icon={icon} imageUrl={img} type={p.type} size={256} color={p.color || itemTypeColor(p.type)} style={{ width: "100%", height: "auto" }} />;
}
// 겹친 카드 — 자리는 칸 폭 비율(정사각 칸 기준 · 단품 figure 와 같은 땅: 그림자 아래 끝 76.7%)
function StackArt({ parts, color, small, hero }: { parts: BundlePart[]; color: string; small: boolean; hero?: string }) {
  const list = parts.map((p) => ({ p, ...partIcon(p) }));
  let hi = hero ? list.findIndex((x) => x.icon === hero) : -1;
  if (hi < 0 && !hero) { hi = list.findIndex((x) => !/^art:(deco|skin|scene)-/.test(x.icon)); if (hi < 0) hi = 0; }
  const front = hi >= 0 ? list[hi] : { p: { type: "bundle" } as BundlePart, icon: String(hero || ""), img: "" };
  const back = list.filter((_, i) => i !== hi).slice(0, 2);
  if (small) {
    return (
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="flex items-center justify-center aspect-square" style={{ width: "60%" }}><PartIcon {...front} small /></div>
      </div>
    );
  }
  const dim = { filter: `brightness(0.86) drop-shadow(0 3px 0 ${shade(color)}26)` };
  return (
    <div className="absolute inset-0">
      {back[0] && <div className="absolute flex items-center justify-center aspect-square" style={{ left: "7%", top: "22.8%", width: "30%", ...dim }}><PartIcon {...back[0]} small={false} /></div>}
      {back[1] && <div className="absolute flex items-center justify-center aspect-square" style={{ left: "63%", top: "22.8%", width: "30%", ...dim }}><PartIcon {...back[1]} small={false} /></div>}
      <svg viewBox="0 0 12 3" aria-hidden className="absolute h-auto" shapeRendering="crispEdges" style={{ left: "32.75%", top: "68.1%", width: "34.5%", fill: shade(color), opacity: 0.3 }}>
        <rect x="2" y="0" width="8" height="1" />
        <rect x="0" y="1" width="12" height="1" />
        <rect x="2" y="2" width="8" height="1" />
      </svg>
      <div className="absolute flex items-center justify-center aspect-square" style={{ left: "27%", top: "19.3%", width: "46%" }}><PartIcon {...front} small={false} /></div>
    </div>
  );
}
export function BundleArt({ parts, color, small = false, mode = "", hero }: { parts: BundlePart[]; color: string; small?: boolean; mode?: string; hero?: string }) {
  if (mode !== "combo") return <StackArt parts={parts} color={color} small={small} hero={hero} />;
  const pos = COMBO[Math.min(4, Math.max(2, parts.length))];
  const shown = parts.slice(0, pos.length);
  const more = parts.length - shown.length;
  return (
    <div className="absolute inset-0">
      {shown.map((p, i) => {
        const fx = productIconOf(p);
        const icon = String((fx ? fx.icon : p.icon) || "");
        const pImg = fx ? fx.imageUrl : p.imageUrl;
        const emoji = !!icon && !artKeyOf(icon) && !presetKeyOf(icon) && !/^(art|svg):/.test(icon);
        return (
          <div key={i} className="absolute flex items-center justify-center aspect-square"
            style={{ left: `${pos[i][0]}%`, top: `${pos[i][1]}%`, width: `${pos[i][2]}%`, filter: small ? undefined : `drop-shadow(0 4px 0 ${shade(color)}26)` }}>
            {emoji ? (
              <ItemIcon icon={icon} imageUrl={pImg} type={p.type} size={small ? 16 : 56} color={p.color || itemTypeColor(p.type)} />
            ) : (
              <ItemIcon icon={icon} imageUrl={pImg} type={p.type} size={256} color={p.color || itemTypeColor(p.type)} style={{ width: "100%", height: "auto" }} />
            )}
          </div>
        );
      })}
      {more > 0 && !small && (
        <span className="absolute right-[9%] bottom-[9%] inline-flex items-center justify-center h-6 min-w-[34px] px-2 rounded-full bg-[#131313] text-white text-[12px] font-black tabular-nums">+{more}</span>
      )}
      {!small && (
        <svg viewBox="0 0 12 3" aria-hidden className="absolute left-1/2 -translate-x-1/2 bottom-[6%] w-3/4 h-auto" shapeRendering="crispEdges" style={{ fill: shade(color), opacity: 0.16 }}>
          <rect x="2" y="0" width="8" height="1" />
          <rect x="0" y="1" width="12" height="1" />
          <rect x="2" y="2" width="8" height="1" />
        </svg>
      )}
    </div>
  );
}

export default function CardArt({ it, imgClass = "", iconSize = 48, stage = false }: { it: any; imgClass?: string; iconSize?: number; stage?: boolean }) {
  const color = it?.color || itemTypeColor(it?.type);
  // 📌 옛 테두리 그림(/avatar-borders/<키>.svg — 예전 추천 아이템이 이미지 칸에 넣었다)은 그림으로 깔지 않는다 — 아이콘 자리로 넘겨
  //    ItemIcon 이 그 테두리 도트 아이콘(아이콘이 공용일 때) 또는 운영자가 고른 아이콘으로 그린다(lib/cosmeticArt — DB 는 그대로, 2026-10-11)
  // 📌 꾸미기 상품(목록 API cosmeticKeys)은 인벤토리와 같은 아이콘 고르기 — 공용 반짝 카드 · 옛 테두리 그림이면 그 스킨 · 테두리 도트 아이콘으로,
  //    운영자가 고른 아이콘 · 직접 올린 이미지는 그대로(lib/cosmeticArt productIconOf — DB 는 그대로). 키가 없으면 상품 값 그대로
  const fixed = productIconOf(it);
  const iconIn = fixed ? fixed.icon : it?.icon;
  const raw = fixed ? fixed.imageUrl : it?.imageUrl || it?.itemImageUrl;
  const legacy = legacyFrameArtOf(raw) ? raw : "";
  const img = legacy ? "" : raw;
  const scene = stage ? backdropSrc(it?.backdrop) : "";
  if (img && !scene) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={img} alt={it.name || ""} className={`absolute inset-0 w-full h-full object-cover ${imgClass}`} style={{ transform: "scale(var(--pz, 1))" }} />;
  }
  const bg = { background: `linear-gradient(160deg, ${color}33, ${color}0a)` };
  // 세트 — 상품 이미지가 없으면 구성 아이콘을 합친다(장면을 골랐으면 장면 위에)
  const parts = img ? [] : bundlePartsOf(it);
  if (parts.length >= 2) {
    return (
      <div className="absolute inset-0" style={bg}>
        {scene && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={scene} alt="" aria-hidden draggable={false} decoding="async"
            className="absolute inset-0 w-full h-full object-cover select-none pointer-events-none" style={{ imageRendering: "pixelated" }} />
        )}
        {/* 확대(--pz)는 틀 자체를 키운다 — 칸 가운데 기준, 구성 자리는 틀 비율이라 함께 커진다 */}
        <div className={`absolute ${imgClass}`} style={{ inset: "calc((1 - var(--pz, 1)) * 50%)" }}><BundleArt parts={parts} color={color} small={!stage} mode={it?.setArt} hero={iconIn ? String(iconIn) : undefined} /></div>
      </div>
    );
  }
  if (!stage) {
    return (
      <div className="absolute inset-0 flex items-center justify-center" style={bg}>
        <ItemIcon icon={iconIn} imageUrl={legacy} type={it?.type} size={iconSize} color={color} />
      </div>
    );
  }
  const icon = String(iconIn || "");
  const emoji = !!icon && !artKeyOf(icon) && !presetKeyOf(icon) && !/^(art|svg):/.test(icon);
  // 아이콘 + 도트 그림자 한 덩어리 (배경이 있든 없든 같은 모양)
  const figure = (
    <div className={`flex flex-col items-center ${scene ? "shrink-0" : ""} ${imgClass}`} style={{ width: "calc(46% * var(--pz, 1))", marginTop: scene ? "auto" : "-4%" }}>
      {/* 아이콘 — SVG(도트 · 프리셋)는 256 으로 그려 폭 100% 로 맞춘다(여백 없이). 이모지는 96px 고정 */}
      {img ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={img} alt={it.name || ""} draggable={false} className="block w-full aspect-square object-contain select-none" />
      ) : emoji ? (
        <ItemIcon icon={icon} imageUrl={legacy} type={it?.type} size={96} color={color} />
      ) : (
        <ItemIcon icon={icon} imageUrl={legacy} type={it?.type} size={256} color={color} style={{ width: "100%", height: "auto" }} />
      )}
      {/* 도트 그림자 — 아이콘 폭의 3/4, 도트 칸 크기는 아이콘과 같다(12 × 3 칸). 색은 등록 색을 어둡게 */}
      <svg viewBox="0 0 12 3" aria-hidden className="block w-3/4 h-auto mt-[6%]" shapeRendering="crispEdges" style={{ fill: shade(color), opacity: scene ? SCENE_SHADOW_OPACITY : 0.18 }}>
        <rect x="2" y="0" width="8" height="1" />
        <rect x="0" y="1" width="12" height="1" />
        <rect x="2" y="2" width="8" height="1" />
      </svg>
    </div>
  );
  if (!scene) {
    return (
      <div className="absolute inset-0 flex items-center justify-center" style={bg}>
        {figure}
      </div>
    );
  }
  return (
    // 장면이 오기 전에는 지금 바탕(등록 색 그라데이션)이 보인다 — 빈 회색 칸이 번쩍이지 않게
    <div className="absolute inset-0" style={bg}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={scene} alt="" aria-hidden draggable={false} decoding="async"
        className="absolute inset-0 w-full h-full object-cover select-none pointer-events-none" style={{ imageRendering: "pixelated" }} />
      {/* 📌 그림자를 장면의 땅에 붙인다 — 덩어리 바닥(그림자 아래 끝)을 칸 가운데(bottom 50%)에서 칸 폭의 26.7% 아래(margin % 는 폭 기준)에 둔다.
             장면은 폭에 맞춰 덮이므로(정사각 · 4:3 모두 폭 기준 object-cover) 그림자는 늘 장면 64줄 중 44~49번째 줄에 놓인다
             = 카운터 · 제단 · 무대 · 섬 윗면 같은 땅 면(실측 42~50줄) 위. 정사각 칸 높이로는 68~77%.
             26.7% 는 배경 없는 칸의 가운데 정렬(marginTop -4%)과 같은 자리라 도트 · 프리셋 아이콘은 배경을 바꿔도 한 칸도 안 움직이고,
             이모지(96px 고정 — 칸 폭에 비례하지 않는다)도 가운데 정렬처럼 뜨거나 가라앉지 않고 같은 땅에 선다.
          📌 틀은 칸 맨 위(top 0)부터 그 땅 줄까지 세로로 잡고, 덩어리는 margin-top:auto 로 바닥에 붙인다.
             좁은 칸(약 147px 미만 — 320px 폰 2열 134px)에서 96px 이모지 덩어리가 틀보다 크면 auto 여백이 0 이 되어
             덩어리가 칸 위 끝에서 시작한다(위로 넘쳐 잘리지 않고 아래로 조금 내려앉음). justify-content: safe 는 안 받는 브라우저가 있어 쓰지 않는다 */}
      <div className="absolute inset-x-0 top-0 flex flex-col items-center" style={{ bottom: "50%", marginBottom: "-26.7%" }}>
        {figure}
      </div>
    </div>
  );
}

// 장면 위 그림자 진하기 — 무늬 있는 땅 위에서도 읽히게 기본 바탕(0.18)보다 조금 진하게
const SCENE_SHADOW_OPACITY = 0.3;

// 등록 색을 검정 쪽으로 65% 섞는다 — 그림자가 칸 바탕(같은 색을 옅게 깐 것)과 한 톤으로 어울리게. 모르는 형식이면 잉크색
function shade(hex: string) {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex || ""));
  if (!m) return "#131313";
  const d = (h: string) => Math.round(parseInt(h, 16) * 0.35).toString(16).padStart(2, "0");
  return `#${d(m[1])}${d(m[2])}${d(m[3])}`;
}
