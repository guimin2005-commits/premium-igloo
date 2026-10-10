// 📌 미리 구운 효과음 파일 재생 — public/sfx/<이름>.wav(scripts/gen-promo-sfx.mjs 로 합성). 승급 화면(app/level/PromoOverlay.js)이 쓴다
//    AudioContext 는 playTone(lib/sfx.js)과 하나를 같이 쓴다(playTone.ctx) — 한 번 풀린 소리 잠금을 공유하고 컨텍스트가 늘지 않게.
//    겹쳐 울려도(쿵 + 화음) 깨지지 않게 끝에 리미터 한 단. 불러오기 · 재생 실패는 조용히 넘긴다 — 소리가 없어도 화면은 그대로.
//    불러오는 시점에 window 를 건드리지 않는다(서버 렌더 안전) — 컨텍스트는 처음 preload / play 할 때 만든다
//    늦게 울리게 된 까닭을 나눈다:
//      · 잠긴 컨텍스트(손짓 전)가 늦게 풀려서 → LOCK_LATE_MAX 넘으면 버린다(풀리는 순간 밀린 소리가 한꺼번에 나는 것 방지)
//      · 파일을 불러오느라 → 버리지 않는다. 조금 늦으면 처음부터, 더 늦으면 지금 울리고 있어야 할 자리부터 이어서(화면과 박자 유지)
import { playTone } from "./sfx";

const buffers = new Map(); // 이름 → AudioBuffer
const pending = new Map(); // 이름 → 불러오는 중인 Promise<AudioBuffer|null>
const LOCK_LATE_MAX = 0.2; // s — 잠긴 컨텍스트가 풀리길 기다리느라 이만큼 넘게 늦으면 버린다
const SYNC_GRACE = 0.06; // s — 시간표 소리(delay > 0)가 이만큼까지 늦으면 처음부터. 찰칵 간격(0.12s)보다 짧아 두 번이 한꺼번에 나지 않는다
const ASAP_GRACE = 1.5; // s — 바로 울릴 소리(delay 0 — 움직임 줄이기 화음 · 확인)는 이만큼 늦어도 처음부터
const MIN_TAIL = 0.05; // s — 이어서 틀 때 남은 길이가 이보다 짧으면 안 튼다(이미 끝났을 소리)
const FADE_IN = 0.012; // s — 중간부터 틀 때 '틱' 없게
let bus = null; // { ctx, node } — 컨텍스트마다 리미터 하나

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now()) / 1000;

function audio() {
  if (typeof window === "undefined") return null;
  if (!playTone.ctx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    playTone.ctx = new Ctx();
  }
  return playTone.ctx;
}

// 리미터 — -2dB 위 봉우리만 누른다(없으면 바로 스피커로)
function out(ctx) {
  if (bus && bus.ctx === ctx) return bus.node;
  let node = ctx.destination;
  try {
    const c = ctx.createDynamicsCompressor();
    c.threshold.value = -2;
    c.knee.value = 1;
    c.ratio.value = 20;
    c.attack.value = 0.003;
    c.release.value = 0.25;
    c.connect(ctx.destination);
    node = c;
  } catch {}
  bus = { ctx, node };
  return node;
}

function load(name) {
  if (buffers.has(name)) return Promise.resolve(buffers.get(name));
  if (pending.has(name)) return pending.get(name);
  const ctx = audio();
  if (!ctx) return Promise.resolve(null);
  const p = fetch(`/sfx/${name}.wav`)
    .then((res) => { if (!res.ok) throw new Error(`sfx ${res.status}`); return res.arrayBuffer(); })
    .then((data) => new Promise((ok, fail) => { const q = ctx.decodeAudioData(data, ok, fail); if (q && q.then) q.then(ok, fail); })) // 옛 사파리는 콜백만
    .then((b) => { buffers.set(name, b); return b; })
    .catch(() => null)
    .finally(() => pending.delete(name)); // 실패하면 다음에 다시 시도
  pending.set(name, p);
  return p;
}

// 미리 불러오기 — 화면이 뜰 때 한 번. 실패는 무시
export function preloadSfx(names = []) {
  try { return Promise.all(names.map((n) => load(n))).then(() => undefined); } catch { return Promise.resolve(); }
}

// 재생 — delay 는 지금부터 몇 초 뒤. 아직 안 불러왔으면 불러와서 튼다(늦은 만큼은 위 규칙대로)
//    돌려주는 함수를 부르면 그 소리를 끈다(아직 안 울렸으면 안 울리고, 울리는 중이면 0.5초쯤에 걸쳐 잦아들게) — 화면을 일찍 닫을 때
export function playSfx(name, { rate = 1, vol = 1, delay = 0 } = {}) {
  let cancelled = false, live = null; // live: { src, g, ctx }
  const cancel = () => {
    cancelled = true;
    if (!live) return;
    try { const t = live.ctx.currentTime; live.g.gain.cancelScheduledValues(t); live.g.gain.setTargetAtTime(0, t, 0.12); live.src.stop(t + 0.6); } catch {}
  };
  try {
    const ctx = audio();
    if (!ctx) return cancel;
    if (ctx.state === "suspended") { const q = ctx.resume(); if (q && q.catch) q.catch(() => {}); }
    const d = Math.max(0, +delay || 0), r = +rate > 0 ? +rate : 1;
    const due = now() + d; // 울려야 할 벽시계 시각
    const go = (b) => {
      if (cancelled) return;
      try {
        const late = now() - due; // 음수면 아직 기다리는 중
        const offset = late > (d > 0 ? SYNC_GRACE : ASAP_GRACE) ? late * r : 0; // 버퍼 안 자리(재생 속도만큼 빨리 지나감)
        if (offset && (b.duration - offset) / r < MIN_TAIL) return;
        const src = ctx.createBufferSource(), g = ctx.createGain();
        const at = ctx.currentTime + Math.max(0, -late);
        src.buffer = b;
        src.playbackRate.value = r;
        if (offset) { g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(vol, at + FADE_IN); }
        else g.gain.value = vol;
        src.connect(g);
        g.connect(out(ctx));
        src.onended = () => { try { src.disconnect(); g.disconnect(); } catch {} };
        src.start(at, offset);
        live = { src, g, ctx };
      } catch {}
    };
    const fire = (b) => {
      if (!b) return;
      if (ctx.state === "running") return go(b);
      // 아직 잠김 — 울릴 수 있게 된 뒤(파일 도착 · 정한 시각 중 늦은 쪽) 풀리기까지 기다린 시간만 따져서 버린다
      const since = Math.max(due, now());
      const q = ctx.resume();
      if (q && q.then) q.then(() => { if (now() - since <= LOCK_LATE_MAX) go(b); }, () => {}); else go(b);
    };
    const b = buffers.get(name);
    if (b) fire(b); else load(name).then(fire, () => {});
  } catch {}
  return cancel;
}
