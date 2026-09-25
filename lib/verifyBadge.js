// 📌 인증 상태 배지 — 헤더·모바일 서랍·내 정보에서 같은 색을 쓰도록 한 곳에 모은다
//    500 계열이라 어두운 배경과 밝은 배경 모두에서 읽힌다.
//    text 는 아이콘만 쓸 때(헤더 이름 옆)의 색, kind 는 아이콘 모양(app/components/VerifyMark)
export function verifyBadge(isVerified, hasScrimRole) {
  if (isVerified && hasScrimRole) {
    return { kind: "ok", label: "인증", text: "text-emerald-500", cls: "bg-emerald-500/12 text-emerald-500 border-emerald-500/30" };
  }
  if (isVerified) {
    return { kind: "partial", label: "일부 인증", text: "text-amber-500", cls: "bg-amber-500/12 text-amber-500 border-amber-500/30" };
  }
  return { kind: "none", label: "미인증", text: "text-red-500", cls: "bg-red-500/12 text-red-500 border-red-500/30" };
}
