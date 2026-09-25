// 📌 효과음 — 오실레이터 한 번 (경매 페이지 playTone 패턴). 레벨 · 내 정보 · ARCTIC 의 인벤토리 팝업이 같이 쓴다
export const playTone = (freq = 880, dur = 0.12, type = "sine", vol = 0.04) => {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!playTone.ctx) playTone.ctx = new Ctx();
    const ctx = playTone.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + dur);
  } catch {}
};
