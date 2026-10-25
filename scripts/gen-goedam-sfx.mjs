// 📌 괴담회 뽑기 효과음 — public/sfx/goedam-*.wav 14개를 합성해 굽는다(app/level/GoedamModal.js 가 lib/sfxFiles.js 로 튼다)
//    실행: node scripts/gen-goedam-sfx.mjs   (소리를 고치면 다시 돌려 WAV 를 커밋한다) · 약속: .claude/mockups/goedam/REVEAL-SPEC.md §3
//
//    2026-10-25 운영자 "뽑기 효과음 짜쳐 · 오히려 고티어 효과음이 별로": 톱니 버즈 · 네모파 · 칩튠 · 나팔(승급 팡파르) 대신
//    실제 물체 — 종이 · 벨벳 커튼 · 팀파니 · 교회종 · 유리 막대 — 를 고유 진동(모드) · 잡음 · 필터 · 잔향 겹으로 흉내 낸다.
//    DSP 도구는 scripts/gen-promo-sfx.mjs 에서 옮겨 왔다(그 파일은 승급 화면 소리라 건드리지 않는다). 외부 소리 · 패키지 없음.
//    톱니(polyBLEP Saw) · 삼각파는 옮기지 않았다 — 소리 재료로 쓰면 곧 '버즈'라서. 목소리도 배음을 하나씩 더해 만든다.
//    난수는 파일 이름으로 시드 고정 — 돌릴 때마다 같은 파일, 한 소리를 고쳐도 다른 소리는 그대로.
//    크기는 파일에 굽는다 — 소리마다 최고점을 표의 dBFS 로 맞춰 페이지는 거의 같은 vol 로 튼다.
//      tug · tear        표를 당김 · 찢음           shut · roll · roll-hi  커튼 닫힘 · 기다리는 팀파니 롤(큰 것: 거꾸로 심벌)
//      open · step       커튼 열림 · 등급 한 칸 '팅'  charge · flip          큰 것 직전 · 카드 뒤집힘
//      none · low · mid · high (+ myth)               결과 등급 소리 — high 는 묵직한 타격 + 교회종(운영자 고름)
//    모노 16bit 44.1kHz · 직류 0 · 앞뒤 페이드(딸깍 없음) · 때리는 소리는 파일 시작 3ms 에 첫 소리(화면과 안 어긋나게)
import { mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const SR = 44100;
const TAU = Math.PI * 2;
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "sfx");

// ── 기본 도구(gen-promo-sfx.mjs 와 같음) ───────────────────────────────
const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
// 시드 난수(mulberry32) — 0 이상 1 미만
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const len = (sec) => Math.round(sec * SR);
const midi = (m) => 440 * 2 ** ((m - 69) / 12);
const cents = (c) => 2 ** (c / 1200);
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const expTo = (a, b, t) => a * (b / a) ** clamp01(t); // a → b 지수 곡선(t 0~1)
const peakOf = (x) => { let p = 0; for (let i = 0; i < x.length; i++) p = Math.max(p, Math.abs(x[i])); return p; };
const rmsOf = (x) => { let s = 0; for (let i = 0; i < x.length; i++) s += x[i] * x[i]; return Math.sqrt(s / x.length); };
const scale = (x, g) => { for (let i = 0; i < x.length; i++) x[i] *= g; return x; };
const toPeak = (x, p = 1) => scale(x, p / (peakOf(x) || 1));
const toRms = (x, v) => scale(x, v / (rmsOf(x) || 1));
const mix = (dst, src, g = 1) => { for (let i = 0; i < dst.length && i < src.length; i++) dst[i] += src[i] * g; return dst; };

// 상태 변수 필터(TPT SVF) — 컷오프를 샘플마다 움직여도 안정적. lp · bp(가운데 이득 1) · hp
class SVF {
  constructor() { this.s1 = 0; this.s2 = 0; this.lp = 0; this.bp = 0; this.hp = 0; }
  tick(x, fc, q = Math.SQRT1_2) {
    const g = Math.tan((Math.PI * Math.min(fc, SR * 0.45)) / SR), k = 1 / q;
    const a1 = 1 / (1 + g * (g + k)), a2 = g * a1, a3 = g * a2;
    const v3 = x - this.s2, v1 = a1 * this.s1 + a2 * v3, v2 = this.s2 + a2 * this.s1 + a3 * v3;
    this.s1 = 2 * v1 - this.s1;
    this.s2 = 2 * v2 - this.s2;
    this.lp = v2; this.bp = k * v1; this.hp = x - k * v1 - v2;
    return this;
  }
}
// 분홍 잡음(Paul Kellet 근사) — 흰 잡음보다 아래가 두꺼워 천 · 바람 소리가 덜 '쉬익'
function pinkNoise(r) {
  let b0 = 0, b1 = 0, b2 = 0;
  return () => { const w = r() * 2 - 1; b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913; return (b0 + b1 + b2 + w * 0.1848) * 0.25; };
}

// 잔향 — Freeverb 짜임(병렬 빗살 8 + 직렬 올패스 4)을 간격을 조금 달리해 두 벌 겹침(모노라 밀도를 올림).
//    빗살마다 되먹임을 잔향 시간(RT60)에 맞추고, 되먹임 안 low-pass(damp)로 꼬리가 갈수록 어두워진다. 들어가는 소리는 hp ~ lp 만
const COMBS = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617], APS = [556, 441, 341, 225];
function reverb(x, { rt = 1.5, size = 1, damp = 0.3, pre = 0.02, hp = 150, lp = 9000 } = {}) {
  const n = x.length, inp = new Float64Array(n), out = new Float64Array(n), pn = len(pre);
  const h = new SVF(), l = new SVF();
  let ein = 0;
  for (let i = 0; i < n; i++) { inp[i] = l.tick(h.tick(i >= pn ? x[i - pn] : 0, hp).hp, lp).lp; ein += inp[i] * inp[i]; }
  for (const spread of [0, 23]) {
    const cs = COMBS.map((d) => { const L = Math.round((d + spread) * size); return { b: new Float64Array(L), L, i: 0, z: 0, g: 10 ** ((-3 * L) / (SR * rt)) }; });
    const as = APS.map((d) => { const L = Math.max(1, Math.round((d + spread) * size)); return { b: new Float64Array(L), L, i: 0 }; });
    for (let i = 0; i < n; i++) {
      const s = inp[i];
      let acc = 0;
      for (const c of cs) { const y = c.b[c.i]; c.z = y * (1 - damp) + c.z * damp; c.b[c.i] = s + c.z * c.g; if (++c.i >= c.L) c.i = 0; acc += y; }
      for (const a of as) { const bo = a.b[a.i]; a.b[a.i] = acc + bo * 0.5; if (++a.i >= a.L) a.i = 0; acc = bo - acc; }
      out[i] += acc;
    }
  }
  return { out, ein };
}
// 마른 소리에 잔향을 섞는다 — wet 는 잔향에 들어간 소리 대비 에너지 비(0.5 = -6dB)
function withVerb(dry, opts, wet) {
  const { out, ein } = reverb(dry, opts);
  let ew = 0; for (let i = 0; i < out.length; i++) ew += out[i] * out[i];
  return mix(dry, out, wet * Math.sqrt(ein / (ew || 1)));
}

// 마무리 — gen-promo-sfx.mjs 의 finish 에 peak(dBFS) 하나만 더함: 소리마다 최고점을 약속 표대로 굽는다.
//    앞 3ms 비움(때리는 소리의 첫 순간이 페이드에 깎이지 않게) · 18Hz 하이패스 · 앞뒤 코사인 페이드 ·
//    남은 평균을 페이드 창 모양으로 빼 직류 0(끝은 그대로 0) · TPDF 디더 16bit(페이드 끝은 정확히 0)
function finish(name, src, { lead = 0.003, fadeIn = 0.003, fadeOut = 0.05, peak = -1 } = {}) {
  const x = new Float64Array(len(lead) + src.length), n = x.length, h = new SVF();
  x.set(src, len(lead));
  for (let i = 0; i < n; i++) x[i] = h.tick(x[i], 18).hp;
  const fi = Math.max(len(0.002) + 1, len(fadeIn)), fo = len(fadeOut);
  const fade = (i) => (i < fi ? 0.5 - 0.5 * Math.cos((Math.PI * i) / fi) : 1) * (i >= n - fo ? 0.5 - 0.5 * Math.cos((Math.PI * (n - 1 - i)) / fo) : 1);
  let sx = 0, sw = 0;
  for (let i = 0; i < n; i++) { x[i] *= fade(i); sx += x[i]; sw += fade(i); }
  for (let i = 0; i < n; i++) x[i] -= (sx / sw) * fade(i);
  const g = (10 ** (peak / 20) * 32767) / (peakOf(x) || 1);
  const r = rng(hash(name + ":dither")), pcm = new Int16Array(n);
  for (let i = 0; i < n; i++) pcm[i] = Math.max(-32767, Math.min(32767, Math.round(x[i] * g + (r() - r()) * fade(i))));
  return pcm;
}

// ── 이 파일에서 더한 재료 ─────────────────────────────────────────────
// 감쇠 사인 한 줄 — t0 초부터 a · sin · exp(-t/dec), 처음 att 초는 반 코사인으로 올림(딸깍 없이 또렷하게).
//    1/10000 로 줄면 멈춘다. 17.5kHz 넘는 부분음은 버림(접힘 잡음 방지)
function ring(x, t0, f, a, dec, { att = 0.0005, p0 = 0 } = {}) {
  if (!a || !(f > 0) || f >= 17500) return x;
  const s = len(t0), na = Math.max(1, len(att)), end = Math.min(x.length, s + na + len(dec * 9.2));
  const w = (TAU * f) / SR, d = Math.exp(-1 / (SR * dec));
  for (let i = s, e = 1; i < end; i++) {
    const k = i - s;
    x[i] += a * e * (k < na ? 0.5 - 0.5 * Math.cos((Math.PI * k) / na) : 1) * Math.sin(p0 + w * k);
    e *= d;
  }
  return x;
}
// 잡음 터짐 — t0 초부터 흰 잡음을 SVF(lp · bp · hp)로 걸러 exp(-t/dec) 로 줄인다. fc 는 숫자나 (t) → Hz
function burst(r, x, t0, { fc, q = Math.SQRT1_2, type = "bp", dec, amp = 1, att = 0 }) {
  const s = len(t0), m = Math.min(x.length - s, len(dec * 9) + len(att)), f = new SVF(), na = len(att);
  const fcAt = typeof fc === "function" ? fc : () => fc;
  for (let k = 0; k < m; k++) {
    const t = k / SR;
    x[s + k] += amp * f.tick(r() * 2 - 1, fcAt(t), q)[type] * Math.exp(-t / dec) * (k < na ? 0.5 - 0.5 * Math.cos((Math.PI * k) / na) : 1);
  }
  return x;
}
// 봉우리 누르개 — 앞 look 초 안의 최고값이 thr 를 넘는 만큼만 이득을 내리고(바로) rel 초에 걸쳐 풂, 다시 look 길이로 평균해 계단 없이.
//    타격 첫 봉우리만 눌러 종 · 꼬리가 최고점 맞춤에 묻히지 않게(tanh 처럼 소리를 찌그러뜨리지 않음)
function limit(x, thr, { look = 0.0015, rel = 0.08 } = {}) {
  const n = x.length, L = Math.max(1, len(look)), rc = Math.exp(-1 / (SR * rel)), gr = new Float64Array(n), out = new Float64Array(n);
  let g = 1;
  for (let i = 0; i < n; i++) {
    let m = 0;
    for (let j = i, e = Math.min(n, i + L); j < e; j++) { const v = Math.abs(x[j]); if (v > m) m = v; }
    const want = m > thr ? thr / m : 1;
    g = want < g ? want : want - (want - g) * rc;
    gr[i] = g;
  }
  let acc = 0;
  for (let i = 0; i < n; i++) { acc += gr[i]; if (i >= L) acc -= gr[i - L]; out[i] = x[i] * (acc / Math.min(i + 1, L)); }
  return out;
}
// 4차 low-pass(버터워스 — SVF 두 단 q 0.541 · 1.307). 📌 2026-10-25 검토: hp 로 거른 흰 잡음이 나이퀴스트(22kHz)까지 평평해
//    종이 '탁' · '착'에 디지털 지글거림('칙' — 16kHz 위 6%, 이웃 샘플 차가 최고점보다 큼) → 종이 소리 고역 끝만 둥글게 깎는다
function lp4(x, fc) {
  const a = new SVF(), b = new SVF();
  for (let i = 0; i < x.length; i++) x[i] = b.tick(a.tick(x[i], fc, 0.541).lp, fc, 1.307).lp;
  return x;
}

// 자유-자유 막대 고유 진동(1 · 2.756 · 5.404 · 8.933 배 — 정수배가 아니라 '삑' 이 아닌 '팅') — [배수, 세기, 감쇠 배수]
const GLASS = [[1, 1, 1], [2.756, 0.5, 0.38], [5.404, 0.28, 0.16], [8.933, 0.12, 0.08]]; // 유리 — 위 모드도 또렷
const GLOCK = [[1, 1, 1], [2.756, 0.42, 0.3], [5.404, 0.2, 0.12], [8.933, 0.08, 0.05]]; // 글로켄 — 쇠 막대, 기본음이 길게
// 📌 2026-10-25 검토: low 의 첫 40ms 날이 무뎌(2k 위 3.5%) 2.756 모드 0.2 → 0.32
const CELESTA = [[1, 1, 1], [2, 0.1, 0.45], [2.756, 0.32, 0.28], [5.404, 0.07, 0.1], [8.933, 0.025, 0.05]]; // 공명통이 기본음을 키워 둥글고 맑음
function bar(r, x, t0, f, { amp = 1, dec = 0.5, modes = GLASS, click = 0.15, att = 0.0003 } = {}) {
  for (const [ratio, a, dm] of modes) ring(x, t0, f * ratio * (1 + (r() - 0.5) * 0.0015), amp * a, dec * dm, { att, p0: r() * TAU });
  if (click) burst(r, x, t0, { fc: Math.min(8000, f * 3.2), q: 0.9, dec: 0.0005, amp: amp * click }); // 채가 닿는 아주 짧은 '틱'
  return x;
}

// 교회종 배음(단3도 종) — [배수, 세기, 감쇠 초]. 허밍이 가장 오래 남고 높은 배음일수록 빨리 사라진다.
//    2.52 는 두 옥타브 위 장3도(종 안에 단3도 · 장3도가 같이 있어 '종' 결 + 장화음에 잘 섞임)
const BELL = [
  [0.5, 0.5, 3.0], // 허밍(hum)
  [1, 0.5, 1.9], // 기본(prime)
  [1.2, 0.34, 1.4], // 단3도(tierce)
  [1.5, 0.17, 1.0], // 5도(quint)
  [2, 0.8, 1.05], // 명목(nominal) — 때릴 때 귀에 꽂히는 음
  [2.52, 0.3, 0.62],
  [3, 0.27, 0.46],
  [4.2, 0.2, 0.28],
  [5.4, 0.14, 0.18],
  [6.8, 0.08, 0.11],
];
function bell(r, x, t0, f, { amp = 1, size = 1, hum = 1, tierce = 1, bright = 1, strike = 0.3 } = {}) {
  for (const [ratio, a0, d0] of BELL) {
    const a = amp * a0 * (ratio === 0.5 ? hum : ratio === 1.2 ? tierce : ratio > 2.5 ? bright : 1), dec = d0 * size;
    const att = ratio < 1 ? 0.008 : ratio < 2 ? 0.0015 : 0.0004; // 허밍은 살짝 늦게 피어남
    const beat = 0.4 + 1.4 * r(); // 종이 완전히 둥글지 않아 부분음이 둘로 갈라짐 — 초당 0.4~1.8번 '웅웅' 출렁
    ring(x, t0, f * ratio - beat / 2, a * 0.56, dec, { att, p0: r() * TAU });
    ring(x, t0, f * ratio + beat / 2, a * 0.44, dec * (0.85 + 0.3 * r()), { att, p0: r() * TAU });
  }
  if (strike) {
    // 때리는 순간 — 쇠 추가 닿는 잡음 한 겹 + 금방 사라지는 높은 쨍 부분음 셋
    burst(r, x, t0, { fc: Math.min(6500, f * 6), q: 0.8, dec: 0.004, amp: amp * strike });
    for (const q of [7.3, 9.1, 11.6]) ring(x, t0, f * q * (1 + (r() - 0.5) * 0.03), amp * strike * 0.25, 0.015 + 0.02 * r(), { att: 0.0003, p0: r() * TAU });
  }
  return x;
}

// 하프 줄 — Karplus-Strong(지연 줄 + 두 칸 평균으로 갈수록 어두워짐), 남는 소수 지연은 1차 올패스로 맞춰 높은 음도 음정이 정확.
//    튕김은 부드러운(1극 lp) 잡음 한 주기 + 튕기는 자리 빗살(줄 13% 지점) — 쇳소리 없이 둥근 하프 결
function pluck(r, x, t0, f, { amp = 1, dec = 1.5, soft = 0.5, pos = 0.13 } = {}) {
  const P = SR / f, L = Math.max(2, Math.floor(P - 0.6)), d = P - 0.5 - L, C = (1 - d) / (1 + d), g = Math.exp(-1 / (f * dec));
  const s = len(t0), N = Math.min(x.length - s, len(dec * 7));
  if (N <= 0) return x;
  const E = Math.round(P), exc = new Float64Array(E), y = new Float64Array(N), B = Math.max(1, Math.round(pos * P));
  let lp = 0, mean = 0;
  for (let k = 0; k < E; k++) { lp += (1 - soft) * (r() * 2 - 1 - lp); exc[k] = lp; mean += lp / E; }
  const ex = (k) => (k < E ? exc[k] - mean : 0) - (k >= B && k - B < E ? exc[k - B] - mean : 0);
  let ax = 0, ay = 0;
  for (let i = 0; i < N; i++) {
    const v = 0.5 * ((i >= L ? y[i - L] : 0) + (i > L ? y[i - L - 1] : 0));
    const ap = C * v + ax - C * ay; ax = v; ay = ap;
    y[i] = ex(i) + g * ap;
  }
  toPeak(y, amp);
  const fo = Math.min(N, len(0.01));
  for (let k = 0; k < fo; k++) y[N - 1 - k] *= 0.5 - 0.5 * Math.cos((Math.PI * k) / fo); // 잘리는 끝 딸깍 없게
  for (let i = 0; i < N; i++) x[s + i] += y[i];
  return x;
}

// 팀파니 막 모드 — [배수, 세기, 감쇠 초]. (0,1) 모드(0.63)는 공기에 눌려 금방 죽는 '둥' 바닥, 1 · 1.5 · 1.98 · 2.44 · 2.94 가 음높이를 만든다.
//    그 위 비정수 가죽 모드(3.4~5.9)는 금방 사라지는 '가죽 결' — 이게 없으면 300Hz 위가 비어 폰 스피커에서 롤이 안 들린다(1차 측정: 중심 103Hz)
//    📌 2026-10-25 검토: 그래도 500Hz 위가 0.3% · 폰(300Hz hp)에서 RMS 13dB 빠짐 · 22Hz 타격 결이 안 섬('드르르'가 아니라 '웅') →
//    가죽 모드 세기 3배, 기본음 감쇠 0.75 → 0.45s(타격 사이를 덜 메움). 측정: 폰(300Hz hp) RMS 빠짐 13.2 → 7.3dB · 22Hz 결 +0.2 → +7.4dB
const TIMP = [[0.63, 0.5, 0.05], [1, 1, 0.45], [1.5, 0.6, 0.5], [1.98, 0.42, 0.36], [2.44, 0.3, 0.26], [2.94, 0.22, 0.19],
  [3.42, 0.48, 0.12], [3.88, 0.39, 0.09], [4.41, 0.3, 0.07], [5.1, 0.24, 0.05], [5.93, 0.18, 0.04]];
//    부드러운 말렛 롤 — 초당 rate 번, 타격마다 시각 ±4.5ms · 세기 ±12% 흔들림 + 두 손 차이, 점점 크게.
//    세게 칠수록 위 모드가 더 열리고(밝아짐), 말렛 펠트가 닿는 '퍽'(480Hz 아래) + 가죽에 닿는 '톡'(900Hz 언저리) 잡음
function timpaniRoll(r, n, { f0 = 98, rate = 22, end, a0 = 0.28 }) {
  const x = new Float64Array(n);
  let t = 0;
  for (let k = 0; t < end; k++) {
    // 첫 타격은 살짝 힘줘서(롤을 시작하는 손) — 첫 소리가 5ms 안에 또렷하게
    const u = t / end, a = k ? (a0 + (1 - a0) * u ** 1.5) * (0.88 + 0.24 * r()) * (k % 2 ? 0.93 : 1) : 0.55;
    for (const [ratio, m, dec] of TIMP) ring(x, t, f0 * ratio * (1 + (r() - 0.5) * 0.002), a * m * (ratio > 1.2 ? 0.55 + 0.45 * a : 1), dec, { att: k ? 0.0025 : 0.0015, p0: r() * TAU });
    burst(r, x, t, { fc: 480, type: "lp", dec: 0.006, amp: 0.35 * a, att: 0.0006 });
    // 📌 2026-10-25 검토: '톡'을 키우고(0.6 → 3 · 6 → 10ms) 1.4kHz 한 겹 더 — 타격마다 폰 스피커에 닿는 결
    burst(r, x, t, { fc: 900, q: 0.7, dec: 0.01, amp: 3.0 * a, att: 0.0006 });
    burst(r, x, t, { fc: 1400, q: 0.8, dec: 0.008, amp: 1.8 * a, att: 0.0006 });
    t = (k + 1) / rate + (r() - 0.5) * 0.009;
  }
  return x;
}
// 크기 다듬기 — 무작위 위상으로 겹친 타격은 서로 지워져 크기가 들쭉날쭉(1차 측정: 끝에서 7dB 꺼짐 → '정점에서 끊김'이 안 됨).
//    tau 로 부드럽게 잰 크기(앞 → 뒤, 뒤 → 앞 한 번씩 걸러 늦음 없음)로 나눠 원하는 곡선 target(t) 에 맞춘다. 타격마다의 '드르르' 결은 남음
function levelTo(x, target, tau = 0.04) {
  const n = x.length, p = new Float64Array(n), a = Math.exp(-1 / (SR * tau));
  let s = 0;
  for (let i = 0; i < n; i++) { s = a * s + (1 - a) * x[i] * x[i]; p[i] = s; }
  for (let i = n - 1; i >= 0; i--) { s = a * s + (1 - a) * p[i]; p[i] = s; }
  const floor = Math.sqrt(peakOf(p)) * 0.05;
  for (let i = 0; i < n; i++) x[i] *= target(i / SR) / Math.max(Math.sqrt(p[i]), floor);
  return x;
}

// 반짝이 알갱이 — 높은 오음 유리 방울. curve 가 클수록 앞쪽에 몰림(처음엔 촘촘 · 크게, 갈수록 드물고 작게)
function sparkle(r, x, { count, from, span, notes, amp = 1, dec = [0.06, 0.2], curve = 2 }) {
  for (let k = 0; k < count; k++) {
    const t0 = from + span * r() ** curve, m = notes[Math.floor(r() * notes.length)];
    const a = amp * (1 - (t0 - from) / (span * 1.1)) ** 1.5 * (0.4 + 0.6 * r());
    bar(r, x, t0, midi(m) * cents((r() - 0.5) * 8), { amp: a, dec: dec[0] + (dec[1] - dec[0]) * r(), modes: GLASS, click: 0 });
  }
  return x;
}

// ── tug: 표를 당김 ─────────────────────────────────────────────────────
//    종이가 팽팽해지는 미세한 끼익 — 2~5kHz 작은 '틱' 알갱이가 초당 40 → 250 개로 점점 촘촘(간격은 Poisson) + 아주 작은 낮은 삐걱
function tug(name) {
  const r = rng(hash(name)), n = len(0.217), T = 0.205;
  const grains = new Float64Array(n), bed = new Float64Array(n), pulses = new Float64Array(n), creak = new Float64Array(n);
  // 알갱이 하나 = 2~5kHz 감쇠 사인(0.2~0.6ms) — 섬유가 하나씩 버티다 미끄러지는 '틱', 갈수록 조금씩 세짐
  let t = 0, first = true;
  while (t < T) {
    const u = t / T, a = first ? 0.75 : (0.3 + 0.7 * r() ** 1.6) * (0.6 + 0.4 * u);
    ring(grains, t, 2000 * 2.5 ** r(), a * (r() < 0.5 ? -1 : 1), 0.0002 + 0.0004 * r(), { att: 0.00007 });
    t += -Math.log(1 - r()) / (40 * 6.25 ** u);
    first = false;
  }
  // 늘어나는 종이 결 — 3.5kHz 언저리 아주 작은 쉬익이 당길수록 차오름
  const bb = new SVF();
  for (let i = 0; i < n; i++) { const u = i / SR / T; bed[i] = bb.tick(r() * 2 - 1, 3500, 0.7).bp * (0.15 + 0.85 * clamp01(u) ** 2) * (1 - smooth(0.95, 1.05, u)); }
  // 낮은 삐걱 — 마찰이 붙었다 미끄러지는 펄스(초당 70 → 120)를 공명 둘(380 · 820Hz)로.
  //    📌 2026-10-25 검토: 간격 ±20% 흔들림으론 80~100Hz 주기가 남아 버즈 기미(엔벌로프 자기상관 0.4) → 간격을 알갱이처럼 Poisson 으로,
  //    공명 Q 9 · 7 → 5 · 4(펄스 사이를 덜 이음), 세기 0.14 → 0.09('아주 작게')
  for (let tp = 0.015; tp < T - 0.01;) { const u = tp / T; pulses[len(tp)] += (0.5 + 0.5 * r()) * Math.sin(Math.PI * u) ** 0.7; tp += -Math.log(1 - r()) / (70 + 50 * u); }
  const c1 = new SVF(), c2 = new SVF();
  for (let i = 0; i < n; i++) creak[i] = c1.tick(pulses[i], 380, 5).bp + 0.55 * c2.tick(pulses[i], 820, 4).bp;
  const x = toPeak(grains, 1);
  mix(x, toPeak(creak, 0.09)); mix(x, toPeak(bed, 0.07));
  return finish(name, withVerb(x, { rt: 0.16, size: 0.35, damp: 0.3, pre: 0.002, hp: 600 }, 0.12), { fadeOut: 0.03, peak: -12 });
}

// ── tear: 표를 절취선대로 찢음 ─────────────────────────────────────────
//    촘촘한 바스락(초당 600 → 1500 임펄스, 3k → 5k 로 쓸리는 대역) + 800~1800Hz 섬유 결(빠른 떨림) + 절취선 다리 14개 '틱' +
//    0.33초 마지막 '탁'(다 떨어지며 종이가 튕김) + 짧은 방 잔향
function tear(name) {
  const r = rng(hash(name)), n = len(0.497), T = 0.33;
  const imp = new Float64Array(n), rustle = new Float64Array(n), fiber = new Float64Array(n), ticks = new Float64Array(n), tak = new Float64Array(n);
  // 1) 바스락 — 섬유가 끊기는 임펄스(대부분 작고 가끔 큼)
  for (let t = 0.0005; t < T; t += -Math.log(1 - r()) / (600 + 900 * (t / T))) imp[len(t)] += (r() < 0.5 ? -1 : 1) * (0.12 + 0.88 * r() ** 3);
  const fb = new SVF(), fh = new SVF();
  for (let i = 0; i < n; i++) rustle[i] = fb.tick(imp[i], expTo(3000, 5000, i / SR / T), 1.3).bp + 0.3 * fh.tick(imp[i], 7000).hp;
  // 2) 섬유 결 — 800~1800Hz 잡음을 빠르게 떨리는 세기(140Hz 아래로 걸러진 무작위 값의 크기)로 — 거친 '드드득'
  const h1 = new SVF(), l1 = new SVF(), m1 = new SVF();
  for (let i = 0; i < n; i++) {
    const t = i / SR, band = l1.tick(h1.tick(r() * 2 - 1, 800).hp, 1800).lp, fl = Math.abs(m1.tick(r() * 2 - 1, 140, 0.9).lp);
    fiber[i] = band * fl * smooth(0, 0.006, t) * (0.7 + 0.3 * t / T) * (1 - smooth(T - 0.006, T, t));
  }
  // 3) 절취선 — 구멍 사이 다리 14개가 차례로 '틱'(거의 같은 간격 · 살짝 흔들림). 첫 다리는 바로(첫 소리)
  for (let j = 0; j < 14; j++) {
    const t0 = j ? 0.004 + j * (0.305 / 13) + (r() - 0.5) * 0.004 : 0.0005, a = 0.7 + 0.3 * r();
    burst(r, ticks, t0, { fc: 2700 + 600 * r(), q: 2.2, dec: 0.0012, amp: a });
    burst(r, ticks, t0, { fc: 1250, q: 1.8, dec: 0.0022, amp: 0.45 * a });
  }
  // 4) 마지막 '탁' — 넓은 딸깍 + 700Hz 종이 몸통 + 낮은 '툭', 떨어져 나간 표가 작게 펄럭
  burst(r, tak, T, { fc: 1200, type: "hp", dec: 0.0016, amp: 1 });
  burst(r, tak, T, { fc: 700, q: 1.6, dec: 0.008, amp: 0.7 });
  ring(tak, T, 210, 0.2, 0.014, { att: 0.0005 });
  burst(r, tak, T + 0.004, { fc: 2300, q: 0.8, dec: 0.025, amp: 0.1, att: 0.003 });
  // 📌 1차 측정: 찢는 몸통이 '탁'보다 23dB 작아 묻힘 → 바스락 · 섬유 결을 키움
  const x = toPeak(tak, 1);
  mix(x, toPeak(ticks, 0.58)); mix(x, toPeak(rustle, 0.64)); mix(x, toPeak(fiber, 0.54));
  lp4(x, 11000); // 지글거림 깎기(lp4 주석)
  return finish(name, withVerb(x, { rt: 0.35, size: 0.6, damp: 0.3, pre: 0.005, hp: 300 }, 0.22), { fadeOut: 0.08, peak: -4 });
}

// ── shut: 무거운 벨벳 커튼이 닫힘 ──────────────────────────────────────
//    낮게 걸러진 분홍 잡음이 부풀며(주름이 접혔다 펴지는 8~14Hz 펄럭임, 빨라질수록 밝아짐) 0.41초에 만나는 묵직한 '툭'(70 → 45Hz)
//    📌 2026-10-25 검토: 커튼(GoedamModal gdShutL/R — 45% → 72% 구간)이 실제로 가운데서 만나는 때는 닫힘 시작 뒤 ~405(아래 자락) ~ 418ms(위)인데
//    '툭'이 0.55초(거의 멈춘 86% → 100%)라 145ms 늦었다 → 커튼 움직임은 그대로 두고 '툭'을 0.41초(lead 3ms 포함)로 당김. 부풀기도 그 앞으로 줄어든다
function shut(name) {
  const r = rng(hash(name)), pink = pinkNoise(r), n = len(0.747), TH = 0.407;
  const cloth = new Float64Array(n), thud = new Float64Array(n), slap = new Float64Array(n);
  const l1 = new SVF(), l2 = new SVF(), b1 = new SVF(), hc = new SVF();
  let fp = 0, ff = 10, dp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR, u = t / TH;
    ff = Math.max(8, Math.min(14, ff + (r() - 0.5) * 0.03)); // 펄럭임 속도가 8~14Hz 사이를 떠돎
    fp += ff / SR; dp += 1.3 / SR;
    const flut = 1 + (0.26 + 0.12 * Math.sin(TAU * dp)) * Math.sin(TAU * fp);
    // 📌 1 · 2차 측정에서 쓸림의 절반이 100Hz 아래(폰에선 안 들림) → 컷오프를 320 → 1100Hz 로 올리고 천 결(1.7kHz)을 키우고 160Hz 아래는 덜어 냄
    const env = (t < TH ? 0.38 + 0.62 * smooth(0, 1, u) ** 1.3 : Math.exp(-(t - TH) / 0.045)) * smooth(0, 0.0015, t);
    const fc = 320 + 780 * smooth(0, 1, u);
    cloth[i] = hc.tick((l2.tick(l1.tick(pink(), fc, 0.6).lp, fc * 1.4, 0.6).lp + 0.16 * b1.tick(r() * 2 - 1, 1700, 0.8).bp) * env * flut, 160).hp;
  }
  // 커튼을 잡아당기는 첫 '스윽' — 천이 움직이기 시작하는 순간(첫 소리가 5ms 안에 오게), 부풀기와 끊기지 않게 80ms 에 걸쳐 잦아듦
  mix(cloth, toPeak(burst(r, new Float64Array(n), 0, { fc: 900, type: "lp", dec: 0.08, amp: 1, att: 0.001 }), 0.35 * peakOf(cloth)));
  // 만나는 '툭' — 내려앉는 낮은 울림(살짝 찌그러뜨려 폰 스피커에도 배음이 들림) + 천이 부딪는 둔탁한 '퍽' + 130Hz 몸통, 뒤로 천이 가라앉음
  let ph = 0; const s0 = len(TH);
  //    📌 2차 측정: '툭'이 거의 45~70Hz 라 폰에선 안 들림 → 더 찌그러뜨려 배음을 늘리고, 천끼리 부딪는 300Hz '텁' 한 겹
  for (let i = s0; i < n; i++) { const t = (i - s0) / SR; ph += (45 + 25 * Math.exp(-t / 0.035)) / SR; thud[i] = (Math.tanh(2.6 * Math.sin(TAU * ph)) / Math.tanh(2.6)) * Math.min(1, t / 0.0015) * Math.exp(-t / 0.11); }
  burst(r, slap, TH, { fc: 520, type: "lp", dec: 0.028, amp: 1, att: 0.001 });
  burst(r, slap, TH, { fc: 300, q: 1, dec: 0.026, amp: 2.0, att: 0.001 });
  burst(r, slap, TH, { fc: 130, q: 1.2, dec: 0.06, amp: 1.0, att: 0.002 });
  burst(r, slap, TH + 0.01, { fc: 700, type: "lp", dec: 0.1, amp: 0.15, att: 0.02 });
  //    📌 2026-10-25 검토: 폰(300Hz 위)에선 '툭'이 쓸림보다 2dB 밖에 안 솟음 → '텁'(300Hz)을 키우고 천끼리 부딪는 1.1kHz 짧은 '탁'을 더함
  burst(r, slap, TH, { fc: 1100, q: 1.2, dec: 0.008, amp: 0.5, att: 0.0005 });
  //    📌 3차 측정: 최고점을 45~70Hz 가 차지해 폰에서 들리는 몫(300Hz 위)이 최고점보다 27dB 작음 → 낮은 울림을 줄이고 '텁' · 쓸림을 키움
  //    (낮은 울림 0.48 → 0.4 · '텁' 0.9 → 1.2 — 측정: 폰에서 '툭'이 쓸림보다 2.8 → 4.7dB 솟음)
  const x = toPeak(thud, 0.4);
  mix(x, toPeak(slap, 1.2)); mix(x, toPeak(cloth, 0.6));
  //    끝 페이드 0.1 → 0.15초 — '툭' 뒤 잔향 · 천 가라앉음이 잘리지 않게(툭을 당겨 뒤가 0.34초 남는다)
  return finish(name, withVerb(x, { rt: 0.55, size: 0.75, damp: 0.4, pre: 0.008, hp: 120, lp: 6000 }, 0.2), { fadeOut: 0.15, peak: -6 });
}

// ── open: 커튼이 열림 ─────────────────────────────────────────────────
//    shut 보다 가볍고 밝은 쓸림 — 800 → 2400Hz 로 열리는 대역 잡음 + 4.8kHz 결 + 위로 쓸리는 '휙', 220Hz 아래는 덜어 냄. 툭 없음
function open(name) {
  const r = rng(hash(name)), pink = pinkNoise(r), n = len(0.697), x = new Float64Array(n);
  const b1 = new SVF(), b2 = new SVF(), hs = new SVF(), sw = new SVF(), hp = new SVF();
  let fp = 0, ff = 12;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    ff = Math.max(10, Math.min(16, ff + (r() - 0.5) * 0.04));
    fp += ff / SR;
    const flut = 1 + 0.24 * Math.sin(TAU * fp);
    // 바로 갈라지며(첫 소리) 0.15초쯤 가장 세고, 커튼이 멈추듯 0.68초에 걸쳐 잦아듦
    const env = smooth(0, 0.002, t) * (0.25 + 0.75 * smooth(0, 0.07, t)) * (1 - smooth(0.15, 0.68, t)) ** 1.2;
    const fc = expTo(800, 2400, smooth(0, 0.35, t)), w = r() * 2 - 1;
    const s = b2.tick(b1.tick(pink(), fc, 0.8).bp, fc * 1.3, 0.7).lp + 0.22 * hs.tick(w, 4800, 0.7).bp + 0.25 * sw.tick(w, expTo(1500, 4200, t / 0.3), 1.6).bp * (1 - smooth(0.1, 0.4, t));
    x[i] = hp.tick(s * env * flut, 220).hp;
  }
  return finish(name, withVerb(x, { rt: 0.7, size: 0.8, damp: 0.3, pre: 0.01, hp: 250 }, 0.28), { fadeOut: 0.12, peak: -8 });
}

// ── roll · roll-hi: 닫힌 채 기다림 ────────────────────────────────────
//    부드러운 말렛 팀파니 롤(G2 — 결과의 C 장조로 풀리는 딸림음) 초당 22번 · 점점 크게, 마지막 타격 없이 정점에서 끊김(결과 소리가 받음)
//    roll-hi 는 같은 롤에 거꾸로 심벌(밝은 금속 쉬익이 끝으로 차오름)을 더함 — 두 파일의 롤은 같은 시드라 똑같다
function rollCore() {
  const r = rng(hash("goedam-roll")), n = len(0.617);
  // 크레셴도 — 0.3 에서 0.56초에 1 까지 오르고 끝까지 그대로(끝이 정점)
  const x = levelTo(timpaniRoll(r, n, { end: 0.585 }), (t) => 0.3 + 0.7 * clamp01(t / 0.56) ** 1.4);
  // 📌 2차 측정: 300Hz 위가 RMS 보다 22dB 작음(폰 스피커는 300Hz 아래를 거의 못 냄) → 막 소리 언저리(250~1200Hz)를 한 겹 더 얹어 +6dB 쯤
  //    📌 2026-10-25 검토: 600Hz Q 0.5 × 1.1 로도 모자람 → 900Hz Q 0.7 × 2.6
  const pres = new SVF();
  for (let i = 0; i < n; i++) x[i] += 2.6 * pres.tick(x[i], 900, 0.7).bp;
  return withVerb(x, { rt: 0.9, size: 0.85, damp: 0.35, pre: 0.012, hp: 140, lp: 6000 }, 0.28);
}
const roll = (name) => finish(name, rollCore(), { fadeOut: 0.02, peak: -8 });
// 거꾸로 심벌 — 앞으로 친 심벌(2.2~13kHz 비정수 부분음 70개 + 5kHz 위 잡음, 높을수록 빨리 줄어듦)을 뒤집어 끝으로 차오르게.
//    친 순간(뒤집힌 정점)은 끝 12ms 앞에 둔다 — 끝 페이드에 정점이 깎이지 않게, 그 뒤는 원래 꼬리가 아주 잠깐
function reverseCymbal(r, n) {
  const x = new Float64Array(n), nz = new Float64Array(n), y = new Float64Array(n), k0 = n - 1 - len(0.012);
  for (let j = 0; j < 70; j++) { const f = 2200 * (13000 / 2200) ** r(); ring(x, 0, f, 0.3 + 0.7 * r(), (0.25 + 0.6 * r()) * Math.sqrt(5000 / f), { att: 0.0003, p0: r() * TAU }); }
  burst(r, nz, 0, { fc: 5200, type: "hp", dec: 0.3, amp: 1 });
  mix(toPeak(x, 1), toPeak(nz, 0.8));
  for (let i = 0; i < n; i++) y[i] = x[Math.abs(k0 - i)] * (i <= k0 ? smooth(0, 1, i / k0) ** 1.5 : 1);
  return y;
}
function rollHi(name) {
  const x = toPeak(rollCore(), 1);
  mix(x, toPeak(reverseCymbal(rng(hash(name)), x.length), 0.85));
  return finish(name, x, { fadeOut: 0.015, peak: -5 });
}

// ── step: 등급 사다리 한 칸 ────────────────────────────────────────────
//    맑은 유리 막대 '팅' — C6(1046.5Hz), 위 모드는 빨리 사라져 맑게 남음 + 채 '틱' + 짧은 잔향.
//    페이지가 rate 1~2.24 로 올려 트므로 9.5kHz 위는 미리 깎음(올려도 21kHz 아래 — 접힘 없음)
//    📌 1차 측정: 처음 40ms 중심 1.5kHz 로 둔함 → 위 모드(5.404 · 8.933)를 키우고 조금 더 남겨 '팅'의 날을 세움
//    📌 2026-10-25 검토: 기본음 감쇠 0.3s 에 파일 0.35s 라 끝 페이드(최고점 -17dB 에서 시작)가 울림을 툭 자름 — 페이지가 rate 로 올리면 더 일찍 잘려
//    마지막 단 뒤 멈춤(220ms)에 드러남 → 감쇠를 조금 줄이고(0.3 → 0.2) 파일을 늘려(0.35 → 0.5 · 페이드 0.08 → 0.2) 저절로 잦아들게. 2.756 모드 0.6 → 0.75(날)
const STEP_GLASS = [[1, 1, 1], [2.756, 0.75, 0.42], [5.404, 0.5, 0.22], [8.933, 0.28, 0.12]];
function step(name) {
  const r = rng(hash(name)), n = len(0.497), x = new Float64Array(n);
  bar(r, x, 0, midi(84), { amp: 1, dec: 0.2, modes: STEP_GLASS, click: 0 });
  burst(r, x, 0, { fc: 6000, q: 0.8, dec: 0.0005, amp: 0.35 }); // 유리에 닿는 '틱' — 높게
  const la = new SVF(), lb = new SVF();
  for (let i = 0; i < n; i++) x[i] = lb.tick(la.tick(x[i], 9500).lp, 9500).lp;
  return finish(name, withVerb(x, { rt: 0.45, size: 0.55, damp: 0.3, pre: 0.004, hp: 500, lp: 8000 }, 0.3), { fadeOut: 0.2, peak: -9 });
}

// ── charge: 큰 것 직전 ────────────────────────────────────────────────
//    낮은 울림(48 → 64Hz + 걸러진 분홍 잡음) 부풀기 + 위로 오르는 반짝 알갱이(1.2 → 6.5kHz, 끝으로 촘촘) + 열리는 '쉬익',
//    끝 30ms 는 잔향까지 빨려 들어가듯 비움 — 곧 타격이 들어올 자리
//    📌 2026-10-25 검토: 0.42s 로는 멈춤(한 장 380 · 10장 420ms) + 접힘(120ms) 뒤 high 첫 소리까지 83~123ms 빈틈('흡 … 쾅') + 비움이 뒤집기 소리 위에 떨어짐
//    → 0.5s(T 0.465)로 늘려 비움(0.468~0.496s)이 high 첫 소리(멈춤 시작 + 503ms) 바로 앞에 오게. 10장은 페이지가 40ms 늦게 튼다(GoedamModal revealPlan)
function charge(name) {
  const r = rng(hash(name)), pink = pinkNoise(r), n = len(0.497), T = 0.465;
  const rum = new Float64Array(n), whoosh = new Float64Array(n), gr = new Float64Array(n);
  const lA = new SVF(), bW = new SVF();
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR, u = clamp01(t / T), e = 0.14 + 0.86 * u ** 2;
    ph += (48 + 16 * u) / SR;
    // 📌 1차 측정: 울림이 거의 100Hz 아래라 폰에서 안 들림 → 더 찌그러뜨려 배음(150~320Hz)을 늘리고 잡음 컷오프를 올림
    rum[i] = ((Math.tanh(3 * Math.sin(TAU * ph)) / Math.tanh(3)) * 0.7 + 1.4 * lA.tick(pink(), 220 + 700 * u, 0.7).lp) * e * smooth(0, 0.003, t);
    whoosh[i] = bW.tick(r() * 2 - 1, expTo(500, 5500, u), 1.3).bp * u ** 2.2;
  }
  bar(r, gr, 0, 1250, { amp: 0.5, dec: 0.05, click: 0 }); // 첫 알갱이는 바로
  for (let k = 0; k < 38; k++) {
    const t0 = T * r() ** 0.55, u = t0 / T;
    bar(r, gr, t0, expTo(1200, 6500, u) * cents((r() - 0.5) * 300), { amp: (0.35 + 0.65 * u) * (0.5 + 0.5 * r()), dec: 0.025 + 0.04 * r(), click: 0 });
  }
  const x = toPeak(rum, 1);
  mix(x, toPeak(whoosh, 0.42)); mix(x, toPeak(gr, 0.45));
  const y = withVerb(x, { rt: 0.5, size: 0.6, damp: 0.3, pre: 0.006, hp: 300 }, 0.22);
  for (let i = 0; i < n; i++) y[i] *= 1 - smooth(T, T + 0.028, i / SR);
  return finish(name, y, { fadeOut: 0.01, peak: -6 });
}

// ── flip: 카드 뒤집힘 ─────────────────────────────────────────────────
//    손끝이 튕기는 작은 '틱'(첫 소리) + 1 → 3.5kHz 로 쓸리는 종이 '휙'(0.1초) + 앞면이 펴질 때 또렷한 '착'(1.8kHz 위 딸깍 + 종이 몸통 + 작은 '톡')
//    📌 2026-10-25 검토: '착'이 파일 103ms 라 앞면이 펴지는 F+120(등급 소리 첫 타격 F+123)보다 20ms 앞서 두 번 치는 소리(플램) →
//    '착'을 117ms(lead 3ms 포함 120ms)로 미룸. 10장의 rate 차이는 페이지가 시작 시각으로 맞춘다(GoedamModal revealPlan)
function flip(name) {
  const r = rng(hash(name)), pink = pinkNoise(r), n = len(0.195), TC = 0.117;
  const tk = new Float64Array(n), sw = new Float64Array(n), ck = new Float64Array(n);
  burst(r, tk, 0, { fc: 2600, q: 1.2, dec: 0.0012, amp: 1 });
  const b = new SVF(), l = new SVF();
  for (let i = 0, m = len(TC + 0.01); i < m; i++) { const u = i / SR / TC; sw[i] = (b.tick(r() * 2 - 1, expTo(1000, 3500, u), 0.9).bp + 0.5 * l.tick(pink(), 1600, 0.7).lp) * Math.sin(Math.PI * clamp01(u) ** 0.8) ** 1.6; }
  burst(r, ck, TC, { fc: 1800, type: "hp", dec: 0.0018, amp: 1 });
  burst(r, ck, TC, { fc: 1100, q: 2, dec: 0.006, amp: 0.7 });
  ring(ck, TC, 190, 0.14, 0.01, { att: 0.0004 }); // 📌 1차 측정: '착' 구간 에너지 절반이 190Hz → 줄여 또렷하게
  const x = toPeak(ck, 1);
  mix(x, toPeak(sw, 0.36)); mix(x, toPeak(tk, 0.35));
  lp4(x, 11000); // 지글거림 깎기(lp4 주석) — 10장은 rate 1.225 까지 올려 18kHz 위가 접혀 내려오기도 한다
  return finish(name, withVerb(x, { rt: 0.18, size: 0.4, damp: 0.3, pre: 0.003, hp: 400 }, 0.18), { fadeOut: 0.03, peak: -10 });
}

// ── none: 꽝 ──────────────────────────────────────────────────────────
//    부드러운 펠트 '툭'(115 → 72Hz + 450Hz 아래 둔한 잡음) + 작게 내려가는 두 음 D5 → A4(뭉툭한 칼림바 — 쇠 혀 모드 1 · 5.9, 엄지로 퉁기듯 1.5ms 로 올림, 5kHz 위는 깎음)
function none(name) {
  const r = rng(hash(name)), n = len(0.597), th = new Float64Array(n), kl = new Float64Array(n);
  let ph = 0;
  for (let i = 0, m = len(0.4); i < m; i++) { const t = i / SR; ph += (72 + 43 * Math.exp(-t / 0.025)) / SR; th[i] = Math.sin(TAU * ph) * Math.min(1, t / 0.002) * Math.exp(-t / 0.07); }
  burst(r, th, 0, { fc: 450, type: "lp", dec: 0.018, amp: 0.5, att: 0.0008 });
  // 📌 2026-10-25 검토: 쇠 혀 모드(5.9)가 2.8kHz lp 두 단에 깎여 사인 두 음('뽀-옹' 오실레이터 블립)만 남음 →
  //    5.9 모드를 키우고 조금 더 남기고(0.1 → 0.3 · 0.05 → 0.08) lp 는 한 단 5kHz 로. 음마다 엄지가 혀에 닿는 짧은 잡음 + 3센트 어긋난 한 줄(칼림바 특유의 떨림)
  const KAL = [[1, 1, 1], [2, 0.06, 0.35], [5.9, 0.3, 0.08]];
  for (const [t0, m, a] of [[0.012, 74, 1], [0.165, 69, 0.85]]) {
    bar(r, kl, t0, midi(m), { amp: a, dec: 0.36, modes: KAL, click: 0, att: 0.0015 });
    bar(r, kl, t0, midi(m) * cents(3), { amp: a * 0.15, dec: 0.36, modes: [[1, 1, 1]], click: 0, att: 0.0015 });
    burst(r, kl, t0, { fc: 2200, q: 1, dec: 0.002, amp: 0.2 * a, att: 0.0003 });
  }
  const la = new SVF();
  for (let i = 0; i < n; i++) kl[i] = la.tick(kl[i], 5000).lp;
  const x = toPeak(th, 1);
  mix(x, toPeak(kl, 0.7));
  return finish(name, withVerb(x, { rt: 0.5, size: 0.6, damp: 0.4, pre: 0.006, hp: 250 }, 0.22), { fadeOut: 0.15, peak: -9 });
}

// ── low: 일반 · 고급 ──────────────────────────────────────────────────
//    맑은 첼레스타 꾸밈음 G5 → C6(70ms) + 옥타브 위 엷은 유리 + 아주 높은 반짝이 몇 알 + 잔향 1초
function low(name) {
  const r = rng(hash(name)), n = len(1.097), x = new Float64Array(n), sp = new Float64Array(n);
  //    📌 2026-10-25 검토: 끝 페이드(0.7s)가 아직 큰 C6 꼬리(최고점 -16.5dB)를 줄임 → C6 감쇠 0.8 → 0.62s · 파일 1.0 → 1.1s
  bar(r, x, 0, midi(79), { amp: 0.55, dec: 0.6, modes: CELESTA, click: 0.12 });
  bar(r, x, 0.07, midi(84), { amp: 1, dec: 0.62, modes: CELESTA, click: 0.15 });
  bar(r, x, 0.07, midi(96) * cents(3), { amp: 0.12, dec: 0.35, modes: GLASS, click: 0 });
  //    📌 2026-10-25 검토: 반짝이가 첼레스타보다 21~26dB 작아 안 들림(0.1~0.5s 2k~6k 4.6%) → 세기 2.2배 · 조금 더 길게
  for (const [t0, m, a] of [[0.11, 100, 0.48], [0.17, 103, 0.4], [0.25, 108, 0.36], [0.33, 105, 0.3], [0.44, 112, 0.22]]) bar(r, sp, t0 + (r() - 0.5) * 0.02, midi(m), { amp: a, dec: 0.12 + 0.08 * r(), modes: GLASS, click: 0 });
  mix(x, sp);
  return finish(name, withVerb(x, { rt: 1.0, size: 0.9, damp: 0.3, pre: 0.012, hp: 300, lp: 10000 }, 0.45), { fadeOut: 0.3, peak: -5 });
}

// ── mid: 희귀 · 영웅 ──────────────────────────────────────────────────
//    부드러운 중저음 '훔'(C3 펠트 말렛 막대 + C2 바닥, 처음 20ms 음높이가 살짝 내려앉음) + 글로켄 아르페지오(장9 C6 E6 G6 B6 D7 위로) +
//    따뜻한 패드(C4 E4 G4 B4 D5 · 배음 6개를 어둡게) 부풀기 + 반짝이, 잔향 1.6초
function mid(name) {
  const r = rng(hash(name)), n = len(1.697);
  const hum = new Float64Array(n), gl = new Float64Array(n), pad = new Float64Array(n), sp = new Float64Array(n);
  let p1 = 0, p2 = 0;
  // 📌 2026-10-25 검토: 사인 둘 + 2배음 + 3% 음높이 떨굼이라 합성기 '뿡/뽀롱'(전자음)으로 들림 → 실제 마림바 막대 모드(1 · 3.93 · 9.2 — 2배음 없음)로,
  //    떨굼 3% → 0.8%, C2 바닥 0.55 → 0.3 · 감쇠 0.3 → 0.2s, 펠트가 닿는 잡음은 키우고 조금 밝게(500 → 900Hz · 0.35 → 0.6 · 12 → 18ms)
  for (let i = 0, m = len(1.4); i < m; i++) {
    const t = i / SR, bend = 1 + 0.008 * Math.exp(-t / 0.02), at = 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, t / 0.002));
    p1 += (midi(48) * bend) / SR; p2 += (midi(36) * bend) / SR;
    hum[i] = at * (Math.sin(TAU * p1) * Math.exp(-t / 0.45) + 0.25 * Math.sin(TAU * 3.93 * p1 + 1) * Math.exp(-t / 0.06) + 0.08 * Math.sin(TAU * 9.2 * p1 + 2) * Math.exp(-t / 0.015) + 0.3 * Math.sin(TAU * p2) * Math.exp(-t / 0.2));
  }
  burst(r, hum, 0, { fc: 900, type: "lp", dec: 0.018, amp: 0.6, att: 0.0008 });
  [84, 88, 91, 95, 98].forEach((m, k) => bar(r, gl, k ? k * 0.055 + (r() - 0.5) * 0.004 : 0, midi(m), { amp: 1 - k * 0.07, dec: 0.85 - k * 0.07, modes: GLOCK, click: 0.2 }));
  for (const m of [60, 64, 67, 71, 74]) for (const c of [-6, 6]) {
    const f = midi(m) * cents(c + (r() - 0.5) * 3), ph0 = Array.from({ length: 6 }, () => r() * TAU), vr = 4.5 + r(), vp = r() * TAU;
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const t = i / SR, e = smooth(0, 0.45, t) ** 1.5 * (1 - smooth(0.8, 1.65, t));
      ph += (f * (1 + 0.0015 * Math.sin(vp + TAU * vr * t))) / SR; ph -= Math.floor(ph);
      let s = 0;
      for (let k = 1; k <= 6; k++) s += k ** -1.6 * Math.sin(TAU * k * ph + ph0[k - 1]);
      pad[i] += e * s;
    }
  }
  sparkle(r, sp, { count: 14, from: 0.1, span: 0.95, notes: [100, 103, 105, 108, 110, 112], dec: [0.06, 0.16], curve: 1.6 });
  const x = toPeak(gl, 1);
  mix(x, toPeak(hum, 0.75)); mix(x, toPeak(pad, 0.3)); mix(x, toPeak(sp, 0.22));
  return finish(name, withVerb(x, { rt: 1.6, size: 1.05, damp: 0.3, pre: 0.018, hp: 220, lp: 10000 }, 0.5), { fadeOut: 0.4, peak: -3 });
}

// ── high: 전설 ────────────────────────────────────────────────────────
//    묵직한 타격 + 종소리(운영자 고름). t≈0 에 서브 드롭(85 → 38Hz) + 큰 북 몸통(막 모드 6개) + 가죽 '퍽' + 또렷한 크랙,
//    진짜 교회종으로 밝은 장화음(+9: C4 G4 E5 D6)을 치고 0.18초 뒤 한 옥타브 위(C5 G5 E6) 한 번 더,
//    높은 반짝이 알갱이가 2초쯤 잦아들고, 큰 홀 잔향 2.6초. 낮은 쿵의 첫 봉우리만 눌러(limit) 종이 타격에 묻히지 않게
function high(name) {
  const r = rng(hash(name)), n = len(3.197);
  const sub = new Float64Array(n), body = new Float64Array(n), skin = new Float64Array(n), crack = new Float64Array(n);
  const DRUM = [[1, 1, 0.2], [1.594, 0.5, 0.11], [2.136, 0.32, 0.075], [2.296, 0.26, 0.065], [2.653, 0.16, 0.05], [2.918, 0.12, 0.04]]; // 원형 막(베셀 비)
  const dph = DRUM.map(() => r()), hC = new SVF(), bC = new SVF(), lS = new SVF(), bS = new SVF(), bS2 = new SVF();
  let p1 = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR, w = r() * 2 - 1;
    // 서브 드롭 — 살짝 찌그러뜨려(tanh) 폰 스피커에도 배음으로 들림
    //    📌 1차 측정: 꼬리(τ 0.5s)가 길어 0.55초 38Hz 웅웅이 최고점을 차지 → τ 0.32s 로 줄여 '쿵'은 맨 앞에만
    p1 += (38 + 47 * Math.exp(-t / 0.1)) / SR;
    sub[i] = (Math.tanh(2.2 * Math.sin(TAU * p1)) / Math.tanh(2.2)) * Math.min(1, t / 0.001) * (t < 0.05 ? 1 : Math.exp(-(t - 0.05) / 0.32));
    // 큰 북 몸통 — 92Hz 막, 처음 30ms 음높이가 내려앉음 + 700Hz 아래 가죽 잡음
    if (t < 1.2) {
      const bend = 1 + 0.22 * Math.exp(-t / 0.03);
      let s = 0;
      for (let j = 0; j < DRUM.length; j++) { dph[j] += (92 * DRUM[j][0] * bend) / SR; s += DRUM[j][1] * Math.exp(-t / DRUM[j][2]) * Math.sin(TAU * dph[j]); }
      body[i] = s * Math.min(1, t / 0.0006) + 0.45 * lS.tick(w, 700, 0.7).lp * Math.exp(-t / 0.03);
    }
    // 가죽 '퍽'(320 · 650Hz) — 따로 한 겹. 📌 4차 측정: 폰에서 들리는 몫(300Hz 위)이 타격 60ms 와 종 구간이 같아 '쿵'이 안 섬 → 타격 순간만 키움
    if (t < 0.3) skin[i] = Math.min(1, t / 0.0005) * (bS.tick(w, 320, 0.7).bp * Math.exp(-t / 0.03) + 0.6 * bS2.tick(w, 650, 1).bp * Math.exp(-t / 0.018));
    // 크랙 — 📌 2026-10-25 검토: 첫 샘플이 한 칸에 최고점 -9dB 로 뛰어 디지털 '틱' 위험 → 0.25ms(11샘플)에 걸쳐 올림(날은 그대로)
    crack[i] = (hC.tick(w, 2200).hp * Math.exp(-t / 0.0022) + 0.6 * bC.tick(w, 3400, 1.4).bp * Math.exp(-t / 0.006)) * Math.min(1, t / 0.00025);
  }
  // 📌 4차 측정: 전체를 눌렀더니 서브가 이득을 정해 가죽 · 크랙도 같이 눌림 → 낮은 쿵(서브 + 몸통)만 따로 누르고 위는 그대로 얹음
  const low = toPeak(sub, 1);
  mix(low, toPeak(body, 0.7));
  const imp = limit(toPeak(low, 1), 0.7, { rel: 0.12 });
  mix(imp, toPeak(skin, 0.55)); mix(imp, toPeak(crack, 0.55));
  // 종 — 아래 큰 종일수록 오래(size), 위 종은 허밍 · 단3도를 줄여 장화음이 탁해지지 않게. 몇 ms 씩 어긋나게(사람이 친 듯)
  //    📌 1차 측정: 3~8kHz 가 0.6% 로 어두움(전설인데 반짝임이 없음) → 위 종의 높은 배음(bright) · 반짝이 알갱이 · 공기를 키움
  //    📌 2026-10-25 검토: C 종의 단3도 부분음(Eb4 · Eb5)이 장3도 E5 보다 오래 남아 꼬리가 단조(C-Eb-G)로 흐려지고 반음 맥놀이로 탁함 →
  //    C 종 둘의 단3도만 줄이고(1 → 0.25 · 0.6 → 0.2) D6 종(F6)도 0.4 → 0.2, E5 종은 오래 남게(size 0.8 → 1.15). E 종의 단3도는 G(화음음)라 그대로
  const bl = new Float64Array(n);
  bell(r, bl, 0, midi(60), { amp: 1, size: 1.25, tierce: 0.25, strike: 0.35 });
  bell(r, bl, 0.006, midi(67), { amp: 0.62, size: 1.0, tierce: 0.6, hum: 0.7, bright: 1.15 });
  bell(r, bl, 0.011, midi(76), { amp: 0.45, size: 1.15, tierce: 0.45, hum: 0.08, bright: 1.35 });
  bell(r, bl, 0.016, midi(86), { amp: 0.3, size: 0.6, tierce: 0.2, hum: 0.15, bright: 1.5 });
  bell(r, bl, 0.18, midi(72), { amp: 0.6, size: 0.85, tierce: 0.2, hum: 0.5, bright: 1.2, strike: 0.3 });
  bell(r, bl, 0.186, midi(79), { amp: 0.4, size: 0.7, tierce: 0.45, hum: 0.25, bright: 1.35 });
  bell(r, bl, 0.192, midi(88), { amp: 0.3, size: 0.55, tierce: 0.4, hum: 0.1, bright: 1.5 });
  const sp = sparkle(r, new Float64Array(n), { count: 80, from: 0.02, span: 2.0, notes: [96, 98, 100, 103, 105, 108, 110, 112], dec: [0.1, 0.35], curve: 2 });
  const air = new Float64Array(n), bA = new SVF();
  for (let i = 0; i < n; i++) { const t = i / SR; air[i] = bA.tick(r() * 2 - 1, 7500, 0.8).bp * (1 - Math.exp(-t / 0.03)) * Math.exp(-t / 0.6); }
  const x = imp;
  mix(x, toPeak(bl, 0.6)); mix(x, toPeak(sp, 0.24)); mix(x, toPeak(air, 0.08));
  return finish(name, withVerb(x, { rt: 2.6, size: 1.25, damp: 0.3, pre: 0.03, hp: 200, lp: 9500 }, 0.5), { fadeOut: 0.6, peak: -1 });
}

// ── hit: 10장에서 마지막이 아닌 전설 이상 칸 ──────────────────────────
//    📌 2026-10-25 운영자 「높은 등급을 맨 뒤에」 — 10장에 전설 이상이 여러 장이면 마지막(가장 높은) 한 장만 high(+ myth) 전체,
//    그 앞 칸들은 「짧은 타격 + 고리」. high 의 짧은 판: 작은 서브 드롭 + 북 몸통 + 가죽 '퍽' + 크랙, 종은 한 번(C5 G5 E6 — 단3도 줄임),
//    반짝이 20알, 잔향 1.3초. 페이지가 칸마다 rate 를 조금씩 올려(한 장씩 오르는 느낌) 튼다
function hit(name) {
  const r = rng(hash(name)), n = len(1.297);
  const sub = new Float64Array(n), body = new Float64Array(n), skin = new Float64Array(n), crack = new Float64Array(n);
  const DRUM = [[1, 1, 0.12], [1.594, 0.5, 0.07], [2.136, 0.32, 0.05], [2.296, 0.26, 0.045]];
  const dph = DRUM.map(() => r()), hC = new SVF(), lS = new SVF(), bS = new SVF();
  let p1 = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR, w = r() * 2 - 1;
    p1 += (46 + 50 * Math.exp(-t / 0.07)) / SR;
    sub[i] = (Math.tanh(2 * Math.sin(TAU * p1)) / Math.tanh(2)) * Math.min(1, t / 0.001) * (t < 0.03 ? 1 : Math.exp(-(t - 0.03) / 0.16));
    if (t < 0.6) {
      const bend = 1 + 0.18 * Math.exp(-t / 0.025);
      let s = 0;
      for (let j = 0; j < DRUM.length; j++) { dph[j] += (104 * DRUM[j][0] * bend) / SR; s += DRUM[j][1] * Math.exp(-t / DRUM[j][2]) * Math.sin(TAU * dph[j]); }
      body[i] = s * Math.min(1, t / 0.0006) + 0.4 * lS.tick(w, 800, 0.7).lp * Math.exp(-t / 0.022);
    }
    if (t < 0.2) skin[i] = Math.min(1, t / 0.0005) * bS.tick(w, 380, 0.8).bp * Math.exp(-t / 0.025);
    crack[i] = hC.tick(w, 2400).hp * Math.exp(-t / 0.002) * Math.min(1, t / 0.00025);
  }
  const low = toPeak(sub, 1);
  mix(low, toPeak(body, 0.75));
  const imp = limit(toPeak(low, 1), 0.7, { rel: 0.1 });
  mix(imp, toPeak(skin, 0.5)); mix(imp, toPeak(crack, 0.4));
  const bl = new Float64Array(n);
  bell(r, bl, 0.004, midi(72), { amp: 0.8, size: 0.6, tierce: 0.2, hum: 0.4, bright: 1.25, strike: 0.3 });
  bell(r, bl, 0.009, midi(79), { amp: 0.5, size: 0.5, tierce: 0.4, hum: 0.2, bright: 1.35 });
  bell(r, bl, 0.014, midi(88), { amp: 0.35, size: 0.45, tierce: 0.35, hum: 0.1, bright: 1.5 });
  const sp = sparkle(r, new Float64Array(n), { count: 20, from: 0.02, span: 0.7, notes: [96, 100, 103, 105, 108], dec: [0.08, 0.25], curve: 2 });
  const x = imp;
  mix(x, toPeak(bl, 0.55)); mix(x, toPeak(sp, 0.2));
  return finish(name, withVerb(x, { rt: 1.3, size: 1, damp: 0.3, pre: 0.02, hp: 200, lp: 9500 }, 0.45), { fadeOut: 0.3, peak: -4 });
}

// ── myth: 신화 · 유물 덧소리(high 와 같이 울림) ───────────────────────
// 공기 같은 합창 '아' — 음마다 목소리 3개(조금씩 다른 음높이 · 늦게 드는 떨림 · 느린 흔들림)를 배음 하나씩 더해 만들고,
//    배음 세기를 모음 '아' 포먼트(700 · 1220 · 2600Hz) 봉우리 모양으로 준다(톱니를 거르는 것보다 깨끗 — 버즈 없음).
//    숨소리(잡음)를 같은 포먼트로 걸러 얹어 '공기' 결
const FORMANT_A = [[700, 130, 1], [1220, 150, 0.5], [2600, 240, 0.32]]; // 가운데 · 폭 · 세기
const formantGain = (fq) => { let g = 0.02; for (const [fc, bw, a] of FORMANT_A) g += a / (1 + ((fq - fc) / (bw / 2)) ** 2); return g; };
function choir(r, n, notes, { att = 0.55, hold = 1.35, rel = 1.1, breath = 0.3 }) {
  const x = new Float64Array(n), env = (t) => (t <= 0 ? 0 : smooth(0, att, t) ** 1.3 * (1 - smooth(hold, hold + rel, t)));
  for (const [m, gain] of notes) for (let v = 0; v < 3; v++) {
    const f = midi(m) * cents((v - 1) * 7 + (r() - 0.5) * 4), K = Math.max(1, Math.floor(7500 / f));
    const amps = [], phs = [];
    let norm = 0;
    for (let k = 1; k <= K; k++) { const a = formantGain(k * f) * k ** -0.2; amps.push(a); phs.push(r() * TAU); norm += a * a; }
    norm = 1 / Math.sqrt(norm);
    const vr = 5.2 + r(), vp = r() * TAU, dr = 0.15 + 0.25 * r(), dq = r() * TAU, t0 = r() * 0.05;
    let ph = 0;
    for (let i = len(t0); i < n; i++) {
      const t = i / SR - t0, e = env(t);
      if (t > hold + rel) break;
      ph += (f * (1 + 0.004 * smooth(0.25, 0.8, t) * Math.sin(vp + TAU * vr * t)) * cents(5 * Math.sin(dq + TAU * dr * t))) / SR;
      ph -= Math.floor(ph);
      let s = 0;
      for (let k = 0; k < K; k++) s += amps[k] * Math.sin(TAU * ph * (k + 1) + phs[k]);
      x[i] += gain * e * norm * s;
    }
  }
  // 숨 — 같은 포먼트(폭은 2.5배)로 거른 잡음 + 5.5kHz 위 '공기' 한 띠
  const lv = rmsOf(x), br = new Float64Array(n), fs = FORMANT_A.map(() => new SVF()), fa = new SVF();
  for (let i = 0; i < n; i++) {
    const w = r() * 2 - 1;
    let s = 0.35 * fa.tick(w, 5500, 0.7).bp;
    FORMANT_A.forEach(([fc, bw, a], j) => { s += a * fs[j].tick(w, fc, fc / (bw * 2.5)).bp; });
    br[i] = s * env(i / SR);
  }
  return mix(x, toRms(br, lv * breath));
}
//    + 위로 쓸리는 하프 글리산도(C4 → C7, C D E G 반복 13음 · 42ms 간격 — 높을수록 짧게) + 잔향 2.8초
function myth(name) {
  const r = rng(hash(name)), n = len(2.597), hp = new Float64Array(n);
  const HN = [];
  for (let o = 0; o < 3; o++) for (const s of [0, 2, 4, 7]) HN.push(60 + 12 * o + s);
  HN.push(96);
  HN.forEach((m, k) => pluck(r, hp, k ? k * 0.042 + (r() - 0.5) * 0.004 : 0, midi(m), { amp: 0.5 + 0.35 * (k / 12), dec: expTo(2.2, 0.8, k / 12), soft: 0.45 }));
  const ch = choir(r, n, [[60, 0.3], [67, 0.4], [72, 0.65], [76, 0.7], [79, 0.6], [86, 0.45]], { breath: 0.45 });
  const lc = new SVF();
  for (let i = 0; i < n; i++) ch[i] = lc.tick(ch[i], 7000).lp;
  const x = toPeak(hp, 0.8);
  mix(x, toPeak(ch, 0.75));
  return finish(name, withVerb(x, { rt: 2.8, size: 1.3, damp: 0.28, pre: 0.03, hp: 220, lp: 9500 }, 0.6), { fadeOut: 0.5, peak: -4 });
}

// ── 쓰기 ───────────────────────────────────────────────────────────────
function wav(pcm) {
  const b = Buffer.alloc(44 + pcm.length * 2);
  b.write("RIFF", 0, "ascii"); b.writeUInt32LE(36 + pcm.length * 2, 4); b.write("WAVE", 8, "ascii");
  b.write("fmt ", 12, "ascii"); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); // PCM · 모노
  b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write("data", 36, "ascii"); b.writeUInt32LE(pcm.length * 2, 40);
  for (let i = 0; i < pcm.length; i++) b.writeInt16LE(pcm[i], 44 + i * 2);
  return b;
}
const db = (v) => (v > 0 ? (20 * Math.log10(v / 32768)).toFixed(2) : "-inf");

const SOUNDS = {
  "goedam-tug": tug, "goedam-tear": tear, "goedam-shut": shut, "goedam-roll": roll, "goedam-roll-hi": rollHi, "goedam-open": open,
  "goedam-step": step, "goedam-charge": charge, "goedam-flip": flip, "goedam-none": none, "goedam-low": low, "goedam-mid": mid,
  "goedam-high": high, "goedam-myth": myth, "goedam-hit": hit,
};
mkdirSync(OUT, { recursive: true });
let total = 0;
console.log("name              len(s)  peak dBFS  rms dBFS  onset ms  dc       clip  size");
for (const [name, fn] of Object.entries(SOUNDS)) {
  const pcm = fn(name), file = wav(pcm);
  writeFileSync(join(OUT, `${name}.wav`), file);
  total += file.length;
  let pk = 0, ss = 0, sum = 0, clip = 0;
  for (const v of pcm) { pk = Math.max(pk, Math.abs(v)); ss += v * v; sum += v; if (Math.abs(v) >= 32767) clip++; }
  const on = pcm.findIndex((v) => Math.abs(v) >= pk * 10 ** (-30 / 20)); // 첫 소리 — 최고점 -30dB 를 처음 넘는 곳
  console.log(`${name.padEnd(17)} ${(pcm.length / SR).toFixed(3)}   ${db(pk).padStart(7)}   ${db(Math.sqrt(ss / pcm.length)).padStart(7)}   ${((on / SR) * 1000).toFixed(1).padStart(6)}   ${(sum / pcm.length / 32768).toExponential(1).padStart(8)}  ${clip}     ${(file.length / 1024).toFixed(0)} KB`);
}
console.log(`public/sfx — goedam ${Object.keys(SOUNDS).length}개 · ${(total / 1024).toFixed(0)} KB`);
