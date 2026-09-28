import mongoose from "mongoose";

// 📌 봇 메시지 템플릿 — 키(levelUp · roleGrant · cmdLevel …)마다 한 문서. 관리자 화면에서 저장, 봇이 1분 주기로 읽는다.
//    문서가 없는 키는 lib/botMessages.js 의 기본 디자인을 쓴다. 저장된 문서가 있으면 그것이 전부다(비운 칸은 비운 그대로).
//    bot/src/botMessages.js 의 BotMessageSchema 와 이름 · 모양 · 기본값이 같아야 한다.
const FieldSchema = new mongoose.Schema(
  {
    name: { type: String, default: "" },
    value: { type: String, default: "" },
    inline: { type: Boolean, default: false },
  },
  { _id: false }
);

const BotMessageSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  enabled: { type: Boolean, default: true }, // 끄면 봇이 보내지 않는다
  card: { type: Boolean, default: true },    // 이미지 카드 — 카드 키(CARD_KEYS)만 쓴다. 다른 키는 저장할 때 false 로 정리된다
  content: { type: String, default: "" },    // 임베드 위 일반 글 (멘션은 여기 있어야 울린다)
  embed: {
    on: { type: Boolean, default: true },
    color: { type: String, default: "" },    // "#rrggbb" 또는 "tier"(레벨 등급 색)
    authorName: { type: String, default: "" },
    authorIcon: { type: String, default: "" },
    title: { type: String, default: "" },
    url: { type: String, default: "" },
    description: { type: String, default: "" },
    thumbnail: { type: String, default: "" },
    image: { type: String, default: "" },
    footerText: { type: String, default: "" },
    footerIcon: { type: String, default: "" },
    timestamp: { type: Boolean, default: false },
    fields: { type: [FieldSchema], default: [] },
  },
  updatedAt: { type: Date, default: Date.now },
  updatedBy: { type: String, default: "" },
});

export default mongoose.models.BotMessage || mongoose.model("BotMessage", BotMessageSchema);
