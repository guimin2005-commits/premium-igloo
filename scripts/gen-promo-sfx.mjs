// 📌 등급 승급 화면 효과음 — public/sfx/promo-*.wav 6개를 합성해 굽는다(app/level/PromoOverlay.js 가 lib/sfxFiles.js 로 튼다)
//    실행: node scripts/gen-promo-sfx.mjs   (소리를 고치면 다시 돌려 WAV 를 커밋한다)
//
//    2026-10-08 운영자 "합성 소리를 제대로": 오실레이터 한 번 울리는 "뽀롱 띠롱" 대신 잡음 · 배음 · 필터 · 잔향을 여러 겹 쌓아 미리 굽는다.
//    외부 소리 · 패키지 없이 순수 JS DSP. 난수는 파일 이름으로 시드를 고정 — 돌릴 때마다 같은 파일, 한 소리를 고쳐도 다른 소리는 그대로.
//      rise          받침이 올라올 때 — 위로 쓸려 올라가는 바람 + 낮은 울림
//      lock          부품이 맞춰질 때마다 — 금속 조각이 찰칵 끼워지는 소리(페이지에서 0.85~1.35 배속으로 차례로 높아짐)
//      boom          다 맞춰졌을 때 — 쿵 + 반짝이 꼬리 + 잔향
//      fanfare(-hi)  등급 이름 — C 장조 add9 화음. 마스터부터 -hi: 종소리 아르페지오 · 합창 패드를 더 얹는다
//      click         확인 버튼
//    모노 16bit 44.1kHz · 파일마다 최고점 -1 dBFS · 직류 제거 · 앞뒤 페이드(딸깍 없음)
import { mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const SR = 44100;
const TAU = Math.PI * 2;
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "sfx");

// ── 기본 도구 ──────────────────────────────────────────────────────────
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

// 톱니(polyBLEP 로 꺾이는 곳을 다듬어 접힘 잡음 없음) · 삼각파
const blep = (t, dt) => (t < dt ? ((t /= dt), t + t - t * t - 1) : t > 1 - dt ? ((t = (t - 1) / dt), t * t + t + t + 1) : 0);
class Saw {
  constructor(p = 0) { this.p = p; }
  tick(f) { const dt = f / SR, v = 2 * this.p - 1 - blep(this.p, dt); this.p += dt; if (this.p >= 1) this.p -= 1; return v; }
}
class Tri {
  constructor(p = 0) { this.p = p; }
  tick(f) { const v = 1 - 4 * Math.abs(this.p - 0.5); this.p += f / SR; if (this.p >= 1) this.p -= 1; return v; }
}
// 분홍 잡음(Paul Kellet 근사) — 흰 잡음보다 아래가 두꺼워 바람 소리가 덜 '쉬익'
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

// 마무리 — 앞 3ms 비움(때리는 소리의 첫 순간이 페이드에 깎이지 않게) · 18Hz 하이패스 · 앞뒤 코사인 페이드 ·
//    남은 평균을 페이드 창 모양으로 빼 직류 0(끝은 그대로 0) · 최고점 -1 dBFS · TPDF 디더 16bit(페이드 끝은 정확히 0)
function finish(name, src, { lead = 0.003, fadeIn = 0.003, fadeOut = 0.05 } = {}) {
  const x = new Float64Array(len(lead) + src.length), n = x.length, h = new SVF();
  x.set(src, len(lead));
  for (let i = 0; i < n; i++) x[i] = h.tick(x[i], 18).hp;
  const fi = Math.max(len(0.002) + 1, len(fadeIn)), fo = len(fadeOut);
  const fade = (i) => (i < fi ? 0.5 - 0.5 * Math.cos((Math.PI * i) / fi) : 1) * (i >= n - fo ? 0.5 - 0.5 * Math.cos((Math.PI * (n - 1 - i)) / fo) : 1);
  let sx = 0, sw = 0;
  for (let i = 0; i < n; i++) { x[i] *= fade(i); sx += x[i]; sw += fade(i); }
  for (let i = 0; i < n; i++) x[i] -= (sx / sw) * fade(i);
  const g = (10 ** (-1 / 20) * 32767) / (peakOf(x) || 1);
  const r = rng(hash(name + ":dither")), pcm = new Int16Array(n);
  for (let i = 0; i < n; i++) pcm[i] = Math.max(-32767, Math.min(32767, Math.round(x[i] * g + (r() - r()) * fade(i))));
  return pcm;
}

// ── rise: 받침이 올라올 때 ─────────────────────────────────────────────
//    분홍 잡음을 대역 필터 2단으로 300Hz → 6kHz 까지 쓸어 올리고(위쪽 숨결 · 아래 두께 · 휘파람 같은 좁은 띠 세 겹 더),
//    플랜저 홈도 같이 올라가 "슈우웅". 밑에는 40 → 70Hz 낮은 울림이 천천히 차오른다. 0.8초쯤 정점, 1초 안에 사라짐
function rise(name) {
  const r = rng(hash(name)), pink = pinkNoise(r), n = len(1.05);
  const air = new Float64Array(n), rum = new Float64Array(n), dl = new Float64Array(1024);
  const f1 = new SVF(), f1b = new SVF(), f2 = new SVF(), f3 = new SVF(), f4 = new SVF();
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR, u = t / 0.92, sw = clamp01(u) ** 1.7;
    const fc = 300 * 20 ** sw; // 300 → 6000Hz
    const p = pink(), w = r() * 2 - 1;
    let s = f1b.tick(f1.tick(p, fc, 1.4).bp, fc, 1.4).bp + 0.35 * sw * f2.tick(w, fc * 2.1, 1.2).bp + 0.3 * f3.tick(p, fc * 0.5, 0.7).lp + 0.22 * f4.tick(w, fc * 1.5, 9).bp;
    // 플랜저 — 지연 7ms → 0.6ms 로 줄며 빗살 홈이 위로 쓸려 올라감(제트기 지나가는 결)
    dl[i & 1023] = s;
    const rp = i - (0.0006 + 0.0064 * (1 - sw)) * SR, i0 = Math.floor(rp), fr = rp - i0;
    s += 0.7 * (dl[i0 & 1023] * (1 - fr) + dl[(i0 + 1) & 1023] * fr);
    air[i] = s * smooth(0, 0.86, u) ** 1.5 * (1 - smooth(0.86, 1.08, u));
    ph += (40 + 30 * sw) / SR;
    rum[i] = (Math.tanh(1.6 * Math.sin(TAU * ph)) / Math.tanh(1.6)) * smooth(0.05, 0.8, u) * (1 - smooth(0.86, 1.08, u));
  }
  const x = toRms(air, 0.2);
  mix(x, toRms(rum, 0.2 * 10 ** (-11 / 20)));
  return finish(name, withVerb(x, { rt: 0.9, size: 0.8, damp: 0.3, pre: 0.01, hp: 250 }, 0.4), { fadeOut: 0.04 });
}

// ── lock: 부품이 맞춰질 때마다 ─────────────────────────────────────────
//    3ms 잡음 딸깍 + 금속 막대 고유 진동(1 · 2.76 · 5.40 · 8.93 배 — 정수배가 아니라서 '삑' 이 아닌 '챙') + 둔탁한 '딱' + 작은 쿵.
//    고유 진동은 둘로 갈라 살짝 맥놀이, 9ms 뒤 걸쇠가 한 번 더 걸리는 작은 두 번째 타격
function lock(name) {
  const r = rng(hash(name)), n = len(0.3);
  const ring = new Float64Array(n), tick = new Float64Array(n), knock = new Float64Array(n), thump = new Float64Array(n);
  const F0 = 1200, MODES = [[1, 1, 0.15], [2.756, 0.62, 0.1], [5.404, 0.4, 0.06], [8.933, 0.24, 0.04]]; // 배수 · 세기 · 줄어드는 시간(s)
  const strike = (t0, amp, decMul) => {
    for (const [ratio, a, dec] of MODES) for (const det of [-0.0017, 0.0022]) {
      const f = F0 * ratio * (1 + det + (r() - 0.5) * 0.001), p0 = r() * TAU, d = dec * decMul;
      for (let i = len(t0); i < n; i++) { const t = i / SR - t0; ring[i] += amp * a * 0.5 * Math.sin(p0 + TAU * f * t) * Math.exp(-t / d) * Math.min(1, t / 0.0003); }
    }
  };
  strike(0, 1, 1);
  strike(0.009, 0.28, 0.45);
  const hA = new SVF(), bB = new SVF(), bK = new SVF();
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR, w = r() * 2 - 1;
    const e1 = t < 0.004 ? Math.exp(-t / 0.0008) * (1 - smooth(0.0025, 0.004, t)) : 0;
    const e2 = t >= 0.009 && t < 0.012 ? 0.35 * Math.exp(-(t - 0.009) / 0.0006) : 0;
    tick[i] = hA.tick(w, 2500).hp * e1 + bB.tick(w, 5200, 1.4).bp * e2;
    knock[i] = bK.tick(w, 650, 2.5).bp * Math.exp(-t / 0.012);
    ph += (65 + 95 * Math.exp(-t / 0.012)) / SR; // 160 → 65Hz
    thump[i] = Math.sin(TAU * ph) * Math.exp(-t / 0.03) * Math.min(1, t / 0.001);
  }
  const x = toPeak(ring, 1);
  mix(x, toPeak(tick, 0.7)); mix(x, toPeak(knock, 0.3)); mix(x, toPeak(thump, 0.45));
  return finish(name, withVerb(x, { rt: 0.35, size: 0.55, damp: 0.25, pre: 0.004, hp: 400 }, 0.25), { fadeOut: 0.07 });
}

// ── boom: 다 맞춰졌을 때 ───────────────────────────────────────────────
//    120 → 38Hz 로 떨어지는 바닥 울림(살짝 찌그러뜨려 작은 스피커에도 배음이 들림) + 220 → 70Hz 펀치 + 크랙 + low-pass 가 닫히는 잡음 폭발.
//    뒤로 화음(C add9)과 같은 높은 음들이 반짝이며 흩어지는 꼬리 · 공기 잡음, 큰 홀 잔향
function boom(name) {
  const r = rng(hash(name)), n = len(2.4);
  const sub = new Float64Array(n), punch = new Float64Array(n), crack = new Float64Array(n), burst = new Float64Array(n);
  const lpA = new SVF(), lpB = new SVF(), hpC = new SVF();
  let p1 = 0, p2 = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR, w = r() * 2 - 1;
    p1 += (38 + 82 * Math.exp(-t / 0.075)) / SR;
    sub[i] = (Math.tanh(2 * Math.sin(TAU * p1)) / Math.tanh(2)) * Math.min(1, t / 0.0015) * (t < 0.12 ? 1 : Math.exp(-(t - 0.12) / 0.32));
    p2 += (70 + 160 * Math.exp(-t / 0.018)) / SR;
    punch[i] = Math.sin(TAU * p2) * Math.exp(-t / 0.045) * Math.min(1, t / 0.0008);
    crack[i] = hpC.tick(w, 1800).hp * Math.exp(-t / 0.0016);
    const fc = expTo(6000, 140, t / 0.4);
    burst[i] = lpB.tick(lpA.tick(w, fc, 0.8).lp, fc, 0.6).lp * Math.min(1, t / 0.0008) * Math.exp(-t / 0.12);
  }
  // 반짝이 — 화음 음 높은 옥타브 부분음 다발(음마다 둘, 떨림 · 줄어드는 시간 제각각)
  const shim = new Float64Array(n), grains = new Float64Array(n), air = new Float64Array(n);
  const NOTES = [79, 84, 86, 88, 91, 96, 98, 100, 103, 108]; // G5 C6 D6 E6 G6 C7 D7 E7 G7 C8
  for (const m of NOTES) for (let k = 0; k < 2; k++) {
    const f = midi(m) * cents((r() - 0.5) * 14), p0 = r() * TAU, dec = 0.55 + r() * 1.0, a = (0.5 + 0.5 * r()) * (m >= 100 ? 0.55 : 1);
    const tr = 5 + r() * 7, tp = r() * TAU, td = 0.25 + 0.35 * r(), t0 = 0.008 + r() * 0.05;
    for (let i = len(t0); i < n; i++) {
      const t = i / SR - t0;
      shim[i] += a * (1 - Math.exp(-t / 0.05)) * Math.exp(-t / dec) * (1 - td * (0.5 + 0.5 * Math.sin(tp + TAU * tr * t))) * Math.sin(p0 + TAU * f * t);
    }
  }
  // 흩뿌린 방울 — 처음엔 촘촘, 갈수록 드물고 작게
  const GN = [91, 96, 98, 100, 103, 108];
  for (let g = 0; g < 46; g++) {
    const t0 = 0.02 + 1.75 * r() ** 2.2, f = midi(GN[Math.floor(r() * GN.length)]) * cents((r() - 0.5) * 10);
    const dec = 0.05 + 0.15 * r(), a = (1 - t0 / 1.9) * (0.4 + 0.6 * r()), p0 = r() * TAU;
    for (let i = len(t0), end = Math.min(n, len(t0 + dec * 7)); i < end; i++) {
      const t = i / SR - t0;
      const s = Math.sin(p0 + TAU * f * t) + (f * 2.76 < 17000 ? 0.3 * Math.sin(TAU * f * 2.76 * t) * Math.exp(-t / (dec * 0.4)) : 0);
      grains[i] += a * Math.min(1, t / 0.001) * Math.exp(-t / dec) * s;
    }
  }
  const bA = new SVF();
  for (let i = 0; i < n; i++) { const t = i / SR; air[i] = bA.tick(r() * 2 - 1, 7500, 0.8).bp * (1 - Math.exp(-t / 0.03)) * Math.exp(-t / 0.5); }
  const x = toPeak(sub, 0.75);
  mix(x, toPeak(punch, 0.55)); mix(x, toPeak(crack, 0.35)); mix(x, toPeak(burst, 0.5));
  mix(x, toPeak(shim, 0.26)); mix(x, toPeak(grains, 0.2)); mix(x, toPeak(air, 0.1));
  // 맨 앞 쿵 봉우리만 tanh 로 눌러(작은 소리는 그대로) 꼬리 · 반짝이가 묻히지 않게
  toPeak(x, 1);
  for (let i = 0; i < n; i++) x[i] = Math.tanh(1.5 * x[i]) / Math.tanh(1.5);
  return finish(name, withVerb(x, { rt: 2.0, size: 1.15, damp: 0.25, pre: 0.025, hp: 220, lp: 10000 }, 0.55), { fadeOut: 0.4 });
}

// ── 화음 재료 ──────────────────────────────────────────────────────────
// 금관 같은 화음 — 음마다 톱니 3개(살짝 어긋난 음높이) + 삼각파, 살짝 아래에서 밀어 올리는 시작, 늦게 드는 비브라토, 낮은 음부터 차례로.
//    다 더한 뒤 low-pass 2단(24dB/oct)의 컷오프가 열리며 "빠-앙", 놓으면 다시 닫힌다. 마지막에 tanh 로 살짝 데움
function brass(r, n, notes, { at = 0, hold, rel, open = 3200, sus = 2300, base = 380 }) {
  const x = new Float64Array(n);
  const envAt = (t) => { const tt = Math.min(t, hold); let a = (1 - Math.exp(-tt / 0.03)) * (0.82 + 0.18 * smooth(0.15, hold, tt)); if (t > hold) a *= Math.exp(-(t - hold) / (rel / 5)); return a; };
  notes.forEach(([m, gain], vi) => {
    const f = midi(m), t0 = at + vi * 0.008 + r() * 0.006;
    const saws = [-9, -2, 6].map((c) => [new Saw(r()), cents(c + (r() - 0.5) * 3)]);
    const tri = new Tri(r()), vr = 4.8 + r() * 0.8, vp = r() * TAU;
    for (let i = len(t0); i < n; i++) {
      const t = i / SR - t0;
      const ff = f * cents(-45 * Math.exp(-t / 0.03)) * (1 + 0.0016 * smooth(0.3, 0.8, t) * Math.sin(vp + TAU * vr * t));
      let s = 0;
      for (const [o, d] of saws) s += o.tick(ff * d);
      x[i] += gain * envAt(t) * (s / 3 + 0.5 * tri.tick(ff));
    }
  });
  const fa = new SVF(), fb = new SVF();
  for (let i = 0; i < n; i++) {
    const t = Math.max(0, i / SR - at);
    let fc = base + (sus + (open - sus) * Math.exp(-t / 0.4) - base) * (1 - Math.exp(-t / 0.05));
    if (t > hold) fc = Math.max(base, fc * expTo(1, 0.25, (t - hold) / rel));
    x[i] = fb.tick(fa.tick(x[i], fc, 0.8).lp, fc * 1.2, 0.6).lp;
  }
  toPeak(x, 1);
  for (let i = 0; i < n; i++) x[i] = Math.tanh(1.5 * x[i]) / Math.tanh(1.5);
  return x;
}

// 종소리 아르페지오 — FM(변조 2배, 지수가 빠르게 줄어 처음만 밝음) + 2.76배 부분음, 190ms 메아리(갈수록 어두워짐)
function bells(r, n, seq, { at, step }) {
  const x = new Float64Array(n);
  seq.forEach((m, k) => {
    const t0 = at + k * step + r() * 0.006, f = midi(m), fm = 2 * f, a = 1 - k * 0.055, dec = 0.9 - k * 0.06;
    const I0 = Math.min(1.8, Math.max(0, (17000 - f) / fm - 1)); // 옆띠가 17kHz 를 넘지 않게
    for (let i = len(t0), end = Math.min(n, len(t0 + dec * 7)); i < end; i++) {
      const t = i / SR - t0, idx = I0 * (0.15 + 0.85 * Math.exp(-t / 0.05));
      let s = Math.sin(TAU * f * t + idx * Math.sin(TAU * fm * t));
      if (f * 2.76 < 17000) s += 0.22 * Math.sin(TAU * f * 2.76 * t) * Math.exp(-t / 0.12);
      x[i] += a * Math.min(1, t / 0.0015) * Math.exp(-t / dec) * s;
    }
  });
  const d = len(0.19), lp = new SVF();
  for (let i = d; i < n; i++) x[i] += 0.32 * lp.tick(x[i - d], 5000).lp;
  return x;
}

// 합창 패드 — 음마다 톱니 3개(조금씩 다른 음높이 · 비브라토 · 느린 흔들림) + 숨소리를 모음 포먼트 대역 필터 3개로("아" → "오")
function choir(r, n, notes, { at, hold, rel }) {
  const src = new Float64Array(n);
  const envAt = (t) => { if (t < 0) return 0; const tt = Math.min(t, hold); let a = 1 - Math.exp(-tt / 0.18); if (t > hold) a *= Math.exp(-(t - hold) / (rel / 5)); return a; };
  for (const m of notes) for (let k = 0; k < 3; k++) {
    const f = midi(m) * cents((r() - 0.5) * 16), o = new Saw(r()), t0 = at + r() * 0.06;
    const vr = 5 + r() * 1.2, vp = r() * TAU, dr = 0.2 + r() * 0.3, dp = r() * TAU;
    for (let i = len(t0); i < n; i++) {
      const t = i / SR - t0;
      src[i] += envAt(t) * o.tick(f * (1 + 0.003 * smooth(0.2, 0.7, t) * Math.sin(vp + TAU * vr * t)) * cents(4 * Math.sin(dp + TAU * dr * t)));
    }
  }
  for (let i = 0; i < n; i++) src[i] += 0.35 * (r() * 2 - 1) * envAt(i / SR - at);
  const A = [[800, 80, 1], [1150, 90, 0.5], [2900, 120, 0.25]], O = [[500, 70, 1], [850, 80, 0.4], [2800, 100, 0.12]]; // 가운데 · 폭 · 세기
  const fs = [new SVF(), new SVF(), new SVF()], lp = new SVF(), x = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const v = smooth(0.2, hold + 0.5, i / SR - at);
    let s = 0;
    for (let j = 0; j < 3; j++) {
      const fc = A[j][0] + (O[j][0] - A[j][0]) * v, bw = A[j][1] + (O[j][1] - A[j][1]) * v, g = A[j][2] + (O[j][2] - A[j][2]) * v;
      s += g * fs[j].tick(src[i], fc, fc / bw).bp;
    }
    x[i] = lp.tick(s, 6000).lp;
  }
  return x;
}

// ── fanfare: 등급 이름 ─────────────────────────────────────────────────
const CHORD = [[48, 1], [55, 0.85], [60, 0.8], [64, 0.72], [67, 0.66], [74, 0.52], [76, 0.46]]; // C3 G3 C4 E4 G4 D5 E5 — C add9
function fanfare(name) {
  const r = rng(hash(name)), n = len(2.8);
  const x = brass(r, n, CHORD, { hold: 1.5, rel: 1.0 });
  return finish(name, withVerb(x, { rt: 2.0, size: 1.1, damp: 0.35, pre: 0.02, hp: 160 }, 0.5), { fadeOut: 0.35 });
}
// 마스터부터 — C2 · G5 · C6 를 더한 넓은 화음(필터도 더 열림) + 한 옥타브 위 종소리 아르페지오 + 합창 패드, 더 큰 잔향
function fanfareHi(name) {
  const r = rng(hash(name)), n = len(3.2);
  const x = brass(r, n, [[36, 0.7], ...CHORD, [79, 0.4], [84, 0.3]], { hold: 1.85, rel: 1.1, open: 3800, sus: 2700 });
  mix(x, toPeak(bells(r, n, [84, 88, 91, 96, 98, 100, 103, 108], { at: 0.1, step: 0.065 }), 0.48));
  mix(x, toRms(choir(r, n, [60, 67, 72, 76], { at: 0.05, hold: 1.9, rel: 1.1 }), rmsOf(x) * 0.5));
  return finish(name, withVerb(x, { rt: 2.6, size: 1.25, damp: 0.3, pre: 0.03, hp: 180 }, 0.55), { fadeOut: 0.4 });
}

// ── click: 확인 버튼 ──────────────────────────────────────────────────
//    C6 나무 · 유리 사이 짧은 '톡' — 부분음 1 · 2.32 · 4.25 배(살짝 내려앉는 음높이) + 4kHz 잡음 끝 + 300 → 220Hz 몸통, 아주 작은 방 잔향
function click(name) {
  const r = rng(hash(name)), n = len(0.12), f0 = midi(84);
  const tone = new Float64Array(n), tick = new Float64Array(n), body = new Float64Array(n);
  const P = [[1, 1, 0.028], [2.32, 0.28, 0.012], [4.25, 0.1, 0.006]], ph = [0, 0, 0], bp = new SVF();
  let pb = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR, bend = 1 + 0.025 * Math.exp(-t / 0.006), at = Math.min(1, t / 0.0004);
    for (let j = 0; j < 3; j++) { ph[j] += (f0 * P[j][0] * bend) / SR; tone[i] += at * P[j][1] * Math.exp(-t / P[j][2]) * Math.sin(TAU * ph[j]); }
    tick[i] = bp.tick(r() * 2 - 1, 4200, 1.2).bp * Math.exp(-t / 0.0006);
    pb += (220 + 80 * Math.exp(-t / 0.008)) / SR;
    body[i] = at * Math.sin(TAU * pb) * Math.exp(-t / 0.01);
  }
  const x = toPeak(tone, 1);
  mix(x, toPeak(tick, 0.35)); mix(x, toPeak(body, 0.4));
  return finish(name, withVerb(x, { rt: 0.25, size: 0.45, damp: 0.3, pre: 0.003, hp: 300 }, 0.2), { fadeOut: 0.02 });
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

const SOUNDS = { "promo-rise": rise, "promo-lock": lock, "promo-boom": boom, "promo-fanfare": fanfare, "promo-fanfare-hi": fanfareHi, "promo-click": click };
mkdirSync(OUT, { recursive: true });
let total = 0;
for (const [name, fn] of Object.entries(SOUNDS)) {
  const pcm = fn(name), file = wav(pcm);
  writeFileSync(join(OUT, `${name}.wav`), file);
  total += file.length;
  let pk = 0, ss = 0, sum = 0, clip = 0;
  for (const v of pcm) { pk = Math.max(pk, Math.abs(v)); ss += v * v; sum += v; if (Math.abs(v) >= 32767) clip++; }
  console.log(`${name.padEnd(17)} ${(pcm.length / SR).toFixed(3)}s  peak ${db(pk)} dBFS  rms ${db(Math.sqrt(ss / pcm.length))} dBFS  dc ${(sum / pcm.length / 32768).toExponential(1)}  clip ${clip}  ${(file.length / 1024).toFixed(0)} KB`);
}
console.log(`public/sfx — ${Object.keys(SOUNDS).length}개 · ${(total / 1024).toFixed(0)} KB`);
