import mongoose from "mongoose";
import { RARITY_KEYS } from "../lib/rarity.js";

// 📌 아이템 등록 — 인벤토리 / 상점 상품 / 시즌 패스 보상이 함께 쓰는 표기의 단일 원천.
//    관리자가 여기서 이름·설명·아이콘·색·유형·연결 역할을 한 번 정하면
//    (1) 인벤토리 표시가 이 값으로 그려지고, (2) 상점 상품 등록 때 골라 쓰고, (3) 시즌 패스 보상으로도 고른다.
//    봇은 지급 때 Purchase 스냅샷(itemType/roleId/itemName)만 보고, 이 컬렉션은 아이템 효과 적용에만 읽는다(bot/src/itemEffects.js — 1분 캐시).
//
//    type  role     : 디스코드 역할 표기 (시즌 전환 때 떼는 대상이 될 수 있다)
//          perk     : 권한 역할 — 역할이 곧 기능이라 시즌 전환에도 떼지 않는다 (detachOnSeason 항상 false)
//          item     : 수집품 — roleId 가 있으면 보유자 인벤토리에 자동 표시 + 지급 시 역할 부여, 없으면 사이트 보유
//          cosmetic : 꾸미기 (카드 스킨·프로필 배지 등) — 역할 없음, 사이트 보유. 효과는 가질 수 있다
//          physical : 기프트카드 — 역할 없음
const ItemSchema = new mongoose.Schema({
  name: { type: String, required: true, maxlength: 40 },
  description: { type: String, default: "", maxlength: 300 }, // 줄바꿈(\n) 허용 — 정리는 lib/items.js normalizeDescription
  icon: { type: String, default: "" },            // 이모지 또는 짧은 텍스트(≤8자). 비면 유형별 기본 SVG
  imageUrl: { type: String, default: "" },        // 있으면 icon 대신 이미지
  color: { type: String, default: "" },           // "#rrggbb". 비면 유형 기본색 (lib/items.js ITEM_TYPE_COLOR)
  type: { type: String, default: "item", enum: ["role", "perk", "item", "cosmetic", "physical"] },
  roleId: { type: String, default: "" },
  roleName: { type: String, default: "" },
  detachOnSeason: { type: Boolean, default: false }, // role 유형만 의미. perk 는 항상 false
  visible: { type: Boolean, default: true },         // 인벤토리에 표시
  sortOrder: { type: Number, default: 0 },
  // 📌 그룹 — 상점 관리 › 아이템 목록에서 묶어 보여 줄 이름("" = 묶지 않음). 관리 화면 정리용이라 인벤토리 · 상품 · 봇은 쓰지 않는다.
  //    2026-10-10 운영자: "시즌 끝나면 등급별 지급되는 아이템들이 너무 많아져서 다 관리하기 힘드니까 그룹 시스템을 만들어 줘". 정리는 lib/items.js normalizeItemGroup
  group: { type: String, default: "", maxlength: 30 },
  // 📌 희귀도(2026-10-17 운영자 — 일반 · 우수 · 고급 · 희귀 · 영웅 · 전설 · 신화 · 유물 여덟 등급). 키 · 이름 · 색 · 칸 모양은 lib/rarity.js 한 곳.
  //    "" = 아직 안 고름(일반으로 보인다). 관리자 아이템 등록에서 고르고, 인벤토리 칸 · 상세 · 「희귀도순」이 쓴다. 정리는 lib/rarity.js normalizeRarity
  rarity: { type: String, default: "", enum: ["", ...RARITY_KEYS] },
  // 📌 분류(2026-10-17 운영자 「자동 + 바꾸기」 — "이름에 적어야 카테고리가 적용되는 방식이라 애매 … 따로 설정 가능하게 통합하자").
  //    "" = 자동 — 꾸미기 효과(카드 배경 · 카드 테두리 · 프로필 테두리 · 프로필 배지) · 유형 이름(아이템 · 역할 …)에서 정한다. 값이 있으면 그 글자.
  //    이름은 짧은 이름만("골드"). 옛 이름 머리말(「카드 스킨 · 골드」)은 이 칸이 비어 있는 동안 분류로 읽는다 — 규칙은 lib/itemCategory.js resolveCategory 한 곳.
  //    연결 상품은 이 값을 따른다(상품에 복사하지 않는다 — 그룹과 같다). 상품 · 구매 스냅샷에 들지 않는 표시 칸. 정리는 lib/items.js normalizeItemCategory
  category: { type: String, default: "", maxlength: 20 },
  // 📌 아이템 효과 —이 아이템을 인벤토리에 가진 사람에게 봇이 적용한다(디스코드 역할 연결과 무관). 기프트카드(physical)는 항상 0 / [].
  //    보유 판정은 lib/ownedItems.js, 정의 · 문구 · 정리는 lib/itemEffects.js. 봇 사본(bot/src/itemEffects.js)과 같은 키 — 바꾸면 함께 고칠 것.
  chatBuffXp: { type: Number, default: 0, min: 0, max: 1_000_000 },   // 채팅 1회당 +N XP
  voiceBuffXp: { type: Number, default: 0, min: 0, max: 1_000_000 },  // 음성 1회당 +N XP
  attendBuffXp: { type: Number, default: 0, min: 0, max: 1_000_000 }, // 출석 시 +N XP
  //    조건 효과 한 칸: { id, on, mode: "add"|"percent", amount, minMinutes?, everyN?, days?, hourFrom?, hourTo?, channelIds? }
  //    저장 전에 normalizeEffects 로 정리하므로 스키마는 그대로 담기만 한다(`on` 경로가 문서의 on() 을 가리지 않게 Mixed).
  effects: { type: [mongoose.Schema.Types.Mixed], default: [] },
  // 📌 효과 문구 직접 쓰기(2026-10-18 운영자 "기본적으로 네가 적고 내가 수정을 할 수 있게") — 화면에 보일 효과 줄. [] = 자동(lib/itemEffects describeEffect).
  //    바꾸는 것은 표시뿐 — 지급(위 효과 칸 · 봇)은 그대로. 정리는 lib/itemEffects normalizeEffectText(최대 8줄 · 줄마다 60자), 보일 줄은 effectLinesOf
  effectText: { type: [String], default: [] },
  // 📌 적용 범위(2026-10-18 — 꾸미기만 뜻이 있다): 키 배열(dashboard · ranking · command · notice). [] = 자동(꾸미기 종류마다 — lib/itemEffects AUTO_SCOPE).
  //    표시만 — 실제로 어디에 입혀지는지는 그대로. 정리는 normalizeScope, 보일 값은 scopeOf · scopeLabelOf
  scope: { type: [String], default: [] },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.models.Item || mongoose.model("Item", ItemSchema);
