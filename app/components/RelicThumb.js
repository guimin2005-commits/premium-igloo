"use client";

// 📌 유물 멈춘 그림 칸(인벤토리 칸 · 상세 아이콘 · 장착 칸) — 미리보기 카드 한 장을 w 폭으로(글자 없음). 그림은 화면에서 한 번 그려 둔다(lib/relic/thumb)
import { useEffect, useState } from "react";
import { relicCardThumb } from "@/lib/relic/thumb";

export default function RelicThumb({ pick, w = 60 }) {
  const [url, setUrl] = useState("");
  const key = JSON.stringify(pick || {});
  useEffect(() => { setUrl(relicCardThumb(pick || {}, w)); }, [key, w]); // eslint-disable-line react-hooks/exhaustive-deps
  const h = Math.round((556 * w) / 360);
  return (
    <span className="relative block overflow-hidden shrink-0" style={{ width: w, height: h, borderRadius: Math.max(3, (24 * w) / 360), boxShadow: "0 0 0 1px rgba(255,255,255,0.12)" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {url && <img src={url} alt="" draggable={false} className="block w-full h-full" />}
    </span>
  );
}
