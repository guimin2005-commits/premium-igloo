// 📌 "언제 왔는지" — 알림 · 문의 답변 등 목록 오른쪽에 붙이는 짧은 시각 표기.
//    방금 · N분 전 · N시간 전 · N일 전(일주일 안), 그보다 오래되면 날짜(올해는 M월 D일, 지난해는 YYYY. M. D.)
export function agoLabel(v?: string | number | Date | null): string {
  if (!v) return "";
  const t = new Date(v).getTime();
  if (isNaN(t)) return "";
  const diff = Date.now() - t;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "방금";
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}일 전`;
  const date = new Date(t);
  const kst = { timeZone: "Asia/Seoul" } as const;
  return date.getFullYear() === new Date().getFullYear()
    ? date.toLocaleDateString("ko-KR", { ...kst, month: "long", day: "numeric" })
    : date.toLocaleDateString("ko-KR", { ...kst, year: "numeric", month: "numeric", day: "numeric" });
}
