import mongoose from "mongoose";

// 📌 방구석 심야 괴담회 설정 — 관리자가 등록하는 단일 문서(key: 이벤트 키 "goedam-2026" — lib/goedamRules.js GOEDAM_KEY). 이벤트 패스(models/EventPass)와 같은 방식.
//    디스코드 스테이지 채널에서 회차(screenings)마다 영화를 틀고, 회차 시간 중 머문 시간 합이 완청 비율 이상이면 봇이 회차 끝에 「할로윈 추첨권」 N장을 준다(models/GoedamWatch).
//    📌 2026-10-24 추첨권을 받는 길은 상영(screenings) · 음성 활동(voice) · 상점 판매(상점 관리에서 그 아이템으로 만든 상품) 셋 — 추첨권 수는 그 아이템을 가진 개수
//    추첨권 1장 = 즉석 뽑기 1번(lib/goedam.js drawGoedam) — 상품(prizes) · 수량 · 비중은 관리자가 등록한다. 다 나간 상품은 안 나온다(models/GoedamStock · GoedamCode)
//    📌 이 문서는 늘 .lean() 으로 읽고 lib/goedamRules.js 의 normalizeGoedamConfig 를 거친다(스키마로 되살려 쓰지 않는다 — 이벤트 패스와 같은 규칙)
//    ⚠️ 봇 bot/src/db.js 에 같은 칸이 있어야 한다(봇은 60초마다 이 문서를 다시 읽어 채널 · 회차를 안다)
//    ⚠️ 테스트 사이트(localhost)도 같은 DB 를 읽는다 — 모델을 불러오기만 해도 컬렉션 · 인덱스를 만들지 않게 autoCreate · autoIndex 를 끄고,
//       저장(쓰기) 직전에 createIndexes() 를 한 번 부른다(lib/goedam.js ensureGoedamIndexes — models/EventPassClaim 과 같은 방식)
const ScreeningSchema = new mongoose.Schema(
  {
    // 📌 sid — 회차의 안정 식별자("s1", "s2" …). 머문 시간 기록(GoedamWatch.sid)이 이 값을 담는다.
    //    한 번 붙은 sid 는 바꾸지도 다시 쓰지도 않는다(lib/goedamRules.js normalizeScreenings — 이벤트 패스 tid 와 같은 이유)
    sid: { type: String, default: "" },
    title: { type: String, default: "" },   // 상영작 · 회차 이름(「파묘」)
    startsAt: { type: Date, default: null }, // 회차 창 [시작, 끝] — 이 안에서 머문 초만 센다
    endsAt: { type: Date, default: null },
    tickets: { type: Number, default: 1 },  // 완청하면 주는 추첨권 장 수(1~10)
    ratio: { type: Number, default: 0.8 },  // 완청 비율(0.1~1) — 머문 초 합 ≥ 비율 × 회차 길이
  },
  { _id: false }
);

const PrizeSchema = new mongoose.Schema(
  {
    // 📌 pid — 상품의 안정 식별자("p1" …). 추첨 기록 · 나간 수 · 코드 풀이 이 값을 담는다(sid 와 같은 규칙)
    pid: { type: String, default: "" },
    name: { type: String, default: "" },
    kind: { type: String, default: "none", enum: ["xp", "point", "item", "role", "code", "none"] },
    amount: { type: Number, default: 0 },    // xp · point 일 때 지급량
    itemId: { type: String, default: "" },   // item 일 때 지급할 아이템(models/Item)
    itemName: { type: String, default: "" }, // 표시용 스냅샷(관리자 저장 때 실사이트 이름 — 없으면 초안 이름)
    count: { type: Number, default: 1 },     // item 일 때 개수(1~99 — 여러 개는 쌓이는 아이템만, lib/goedamRules.js PRIZE_COUNT). 기간은 없다(늘 무기한)
    roleId: { type: String, default: "" },   // role 일 때 지급할 역할
    roleName: { type: String, default: "" }, // 표시용 스냅샷
    qty: { type: Number, default: null },    // 전체 수량 — null = 무제한. code 는 코드 수가 곧 수량(이 칸을 쓰지 않는다)
    weight: { type: Number, default: 1 },    // 비중(1~1,000,000) — 남은 상품의 비중 합 중 이 상품의 몫이 확률
    rarity: { type: String, default: "" },   // 표시용 희귀도(lib/rarity 키, "" = 일반)
  },
  { _id: false }
);

// 📌 2026-10-24 운영자 「받는 법」 확장 — 음성 활동: 하루(KST 자정 기준) 음성 minutes 분을 채우면 추첨권 tickets 장(하루 한 번, 봇이 5분마다 XpLog 로 판정).
//    기본 꺼짐 — 어느 채널을 셀지는 추후(그때 channels 칸을 더한다 — lib/goedamRules.js normalizeVoice · 봇 사본과 같이). 범위 · 기본값은 lib/goedamRules.js 와 같다
const VoiceSchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: false },
    minutes: { type: Number, default: 60 }, // 하루 음성 분(10~1440)
    tickets: { type: Number, default: 1 },  // 채우면 주는 장 수(1~10)
    // 기간 [시작, 끝) — 끝은 들어가지 않는다
    startsAt: { type: Date, default: () => new Date("2026-10-30T00:00:00+09:00") },
    endsAt: { type: Date, default: () => new Date("2026-11-06T00:00:00+09:00") },
  },
  { _id: false }
);

const GoedamSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    // 관리자가 켜기 전에는 운영진 미리보기만(봇도 켜져 있을 때만 기록 · 지급한다)
    enabled: { type: Boolean, default: false },
    title: { type: String, default: "방구석 심야 괴담회" },
    // 스테이지 채널 ID — "" 이면 봇이 기록하지 않는다
    channelId: { type: String, default: "" },
    // 추첨권 아이템(models/Item id — 관리자가 등록한 「할로윈 추첨권」) · 표시 스냅샷
    ticketItemId: { type: String, default: "" },
    ticketItemName: { type: String, default: "" },
    // 추첨 기간 [열림, 닫힘) — 기본값은 lib/goedamRules.js GOEDAM_DEFAULTS 와 같다(봇 bot/src/db.js 도 같은 기본값 · 비어 있는 옛 문서는 정리 함수가 채운다)
    drawOpensAt: { type: Date, default: () => new Date("2026-10-26T00:00:00+09:00") },
    drawClosesAt: { type: Date, default: () => new Date("2026-11-06T00:00:00+09:00") },
    // 회차는 시작 순으로만 저장된다(정렬 · 검증은 lib/goedamRules.js · app/api/admin/goedam)
    screenings: { type: [ScreeningSchema], default: [] },
    // 음성 활동(2026-10-24) — 위 VoiceSchema. 칸이 없는 옛 문서는 정리 함수가 기본값(꺼짐)으로 읽는다
    voice: { type: VoiceSchema, default: () => ({}) },
    prizes: { type: [PrizeSchema], default: [] },
    // 다음에 발급할 번호 — 지운 회차 · 상품의 id 를 다시 쓰지 않으려고 문서에 들고 다닌다(EventPass.nextTid 와 같은 이유)
    nextSid: { type: Number, default: 1 },
    nextPid: { type: Number, default: 1 },
    updatedAt: { type: Date, default: Date.now },
  },
  { autoCreate: false, autoIndex: false }
);

export default mongoose.models.Goedam || mongoose.model("Goedam", GoedamSchema);
