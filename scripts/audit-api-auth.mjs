#!/usr/bin/env node
// 📌 API 권한 점검 — app/**/route.{js,ts} 의 내보낸 핸들러(GET/POST/PUT/PATCH/DELETE)마다
//    서버 가드 호출이 있는지 정적으로 본다. 화면에서 버튼을 숨기는 것만으로는 API 가 열려 있다.
//    가드 없는 핸들러가 허용 목록 밖에 있으면 종료 코드 1.
//    사용법: npm run audit:api   (파일을 읽기만 한다 — DB·서버를 건드리지 않는다)
//
//    판정 방법: 핸들러 본문(안쪽 함수 포함)에서 아래 GUARDS 호출을 찾는다.
//    같은 파일의 최상위 함수가 가드를 부르면 그 함수도 가드로 친다(예: supporters/comments 의 gate()).
//    호출 여부만 보므로 "세션을 읽고 결과를 확인하는지"까지는 사람이 본다 — 새 라우트는 lib/apiAuth.js 가드를 쓸 것.

import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const ROOT = process.cwd();
// 📌 app/api 밖의 route 파일도 API 다(예: 예전 app/auth/[...nextauth]) — app 전체를 본다
const APP_DIR = path.join(ROOT, "app");
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];

// 가드로 치는 호출 — lib/apiAuth.js 공용 가드 + 세션을 읽어 권한을 가르는 공용 도우미
const GUARDS = new Set([
  "denyIfNotAdmin",
  "requireAdmin",
  "requireUser",
  "requireSelfOrAdmin",
  "getSession",
  "getServerSession",
  "getShopAccess", // lib/shopAccess — 세션으로 관리자·공개 여부를 가른다
]);

// 📌 가드 없이 공개가 맞는 핸들러 — "경로 메서드": "이유". 새로 넣을 때는 이유를 꼭 적는다.
const ALLOW = {
  "/api/auth/[...nextauth] GET": "next-auth 로그인·콜백 — 로그인 전 요청",
  "/api/auth/[...nextauth] POST": "next-auth 로그인·로그아웃 — 로그인 전 요청",
  "/api/discord-user GET": "디스코드 공개 프로필(이름·아바타)만 — 명예의 전당·경매 화면이 비로그인으로 읽음",
  "/api/honors GET": "명예의 전당 공개 페이지",
  "/api/referral POST": "종료된 초대 이벤트 — 항상 410, 아무것도 쓰지 않음",
  "/api/settings GET": "점검 여부 한 값만 — 비로그인 방문자도 점검 화면을 봐야 함",
  "/api/shop/skin-card GET": "카드 스킨 미리보기 PNG — 목록에 있는 스킨 키만 받고 예시 사람으로만 그림(사용자 데이터 없음) · 길게 캐시",
  "/api/stats GET": "홈 화면 멤버·온라인 수와 활동 그래프 — 공개 지표",
  "/api/xp/policy GET": "공개 XP 정책(관리 전용 값 제외) — 홈·레벨·상점이 비로그인으로 읽음",
};

// ── 파일 수집 ──
const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) return walk(p);
    return /^route\.(js|ts)$/.test(d.name) ? [p] : [];
  });

const routeOf = (file) =>
  "/" + path.relative(path.join(ROOT, "app"), path.dirname(file)).split(path.sep).join("/");

const hasExport = (node) => !!node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);

// 노드 아래에서 부르는 함수 이름(식별자 호출만)
const callsIn = (node) => {
  const out = new Set();
  const visit = (n) => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression)) out.add(n.expression.text);
    ts.forEachChild(n, visit);
  };
  if (node) visit(node);
  return out;
};

function auditFile(file) {
  const text = fs.readFileSync(file, "utf8");
  const kind = file.endsWith(".ts") ? ts.ScriptKind.TS : ts.ScriptKind.JS;
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);

  const locals = new Map(); // 최상위 함수 이름 → 본문 노드
  const handlers = new Map(); // 메서드 → 본문 노드
  const reexports = []; // export { x as GET }

  for (const st of sf.statements) {
    if (ts.isFunctionDeclaration(st) && st.name) {
      locals.set(st.name.text, st.body);
      if (hasExport(st) && METHODS.includes(st.name.text)) handlers.set(st.name.text, st.body);
    } else if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) {
        if (!ts.isIdentifier(d.name) || !d.initializer) continue;
        locals.set(d.name.text, d.initializer);
        if (hasExport(st) && METHODS.includes(d.name.text)) handlers.set(d.name.text, d.initializer);
      }
    } else if (ts.isExportDeclaration(st) && st.exportClause && ts.isNamedExports(st.exportClause)) {
      for (const el of st.exportClause.elements) {
        const exported = el.name.text;
        const local = (el.propertyName || el.name).text;
        if (METHODS.includes(exported)) reexports.push([exported, local]);
      }
    }
  }
  for (const [method, local] of reexports) handlers.set(method, locals.get(local) || null);

  // 같은 파일 도우미가 가드를 부르면 그 도우미도 가드 — 더 늘지 않을 때까지
  const guards = new Set(GUARDS);
  for (let grew = true; grew; ) {
    grew = false;
    for (const [name, body] of locals) {
      if (guards.has(name)) continue;
      if ([...callsIn(body)].some((c) => guards.has(c))) {
        guards.add(name);
        grew = true;
      }
    }
  }

  const route = routeOf(file);
  return METHODS.filter((m) => handlers.has(m)).map((method) => {
    const body = handlers.get(method);
    const found = body ? [...callsIn(body)].filter((c) => guards.has(c)) : [];
    return { route, method, file: path.relative(ROOT, file).split(path.sep).join("/"), guards: [...new Set(found)] };
  });
}

// ── 표 출력 (한글은 두 칸으로 센다) ──
const width = (s) => [...s].reduce((w, ch) => w + (/[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/.test(ch) ? 2 : 1), 0);
const pad = (s, n) => s + " ".repeat(Math.max(0, n - width(s)));

function printTable(rows) {
  const head = ["경로", "메서드", "판정", "가드 / 허용 이유"];
  const cols = rows.map((r) => [r.route, r.method, r.status, r.note]);
  const w = head.map((h, i) => Math.max(width(h), ...cols.map((c) => width(c[i]))));
  const line = (c) => c.map((v, i) => (i === c.length - 1 ? v : pad(v, w[i]))).join("  ");
  console.log(line(head));
  console.log(w.map((n, i) => "-".repeat(i === w.length - 1 ? Math.max(n, 10) : n)).join("  "));
  for (const c of cols) console.log(line(c));
}

// ── 실행 ──
if (!fs.existsSync(APP_DIR)) {
  console.error("app 을 찾지 못했습니다. 저장소 루트에서 실행해 주세요.");
  process.exit(2);
}

const all = walk(APP_DIR).sort().flatMap(auditFile);
const used = new Set();
const rows = all.map((r) => {
  const key = `${r.route} ${r.method}`;
  if (r.guards.length) return { ...r, status: "OK", note: r.guards.join(", ") };
  if (ALLOW[key]) {
    used.add(key);
    return { ...r, status: "공개", note: ALLOW[key] };
  }
  return { ...r, status: "누락", note: `가드 없음 — ${r.file}` };
});

printTable(rows);

const missing = rows.filter((r) => r.status === "누락");
const stale = Object.keys(ALLOW).filter((k) => !used.has(k));
console.log("");
console.log(`핸들러 ${rows.length}개 · 가드 ${rows.filter((r) => r.status === "OK").length} · 공개(허용 목록) ${used.size} · 누락 ${missing.length}`);
if (stale.length) {
  // 가드가 생겼거나 라우트가 사라진 항목 — 목록을 정리할 것 (실패로 치지는 않는다)
  console.log(`허용 목록 정리 필요(가드가 있거나 없는 핸들러): ${stale.join(" · ")}`);
}
if (missing.length) {
  console.log("가드 없는 핸들러가 있습니다 — lib/apiAuth.js 가드를 넣거나, 공개가 맞으면 ALLOW 에 이유와 함께 적어 주세요.");
  process.exit(1);
}
