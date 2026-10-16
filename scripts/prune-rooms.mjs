// 방 템플릿 정리: node scripts/prune-rooms.mjs [파일...]
// 넝쿨/단방향 발판 중 지워도 검증을 통과하는 것을 지우고, 몬스터 표식(M)을 지우고, 막다른 구석/튀어나온 턱을 다듬는다 (src/core/generation/prune.ts).
// 손으로 쓴 방(src/rooms/*.txt)과 자동 생성 방(src/rooms/gen/*.txt)을 제자리에서 고친다. 여러 번 돌려도 결과가 같다.
// 방 생성기(scripts/gen-rooms.mjs)를 다시 돌린 뒤에는 이것도 다시 돌린다.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'vite';

const root = new URL('../', import.meta.url);
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error', root: root.pathname });
try {
  const T = await server.ssrLoadModule('/src/core/generation/template.ts');
  const P = await server.ssrLoadModule('/src/core/generation/prune.ts');
  const { REACH_PARAMS } = await server.ssrLoadModule('/src/core/generation/params.ts');
  const files = process.argv.slice(2).length
    ? process.argv.slice(2)
    : [
        ...readdirSync(new URL('src/rooms/', root)).filter((f) => f.endsWith('.txt') && f !== 'arena.txt').map((f) => `src/rooms/${f}`),
        ...readdirSync(new URL('src/rooms/gen/', root)).filter((f) => f.endsWith('.txt')).map((f) => `src/rooms/gen/${f}`),
      ];
  let vine = 0;
  let oneWay = 0;
  let filled = 0;
  let shaved = 0;
  for (const file of files) {
    const t0 = Date.now();
    const text = readFileSync(new URL(file, root), 'utf8');
    const pruned = new Map();
    for (const t of T.parseTemplateFile(text, file)) {
      if (t.arena) continue;
      const r = P.pruneTemplate(t, REACH_PARAMS);
      if (!r.ok) console.log(`  ${t.id}: 검증 실패 상태라 건너뜀`);
      pruned.set(t.id, r.template.rows);
      vine += r.removedVine;
      oneWay += r.removedOneWay;
      filled += r.filled;
      shaved += r.shaved;
    }
    // 본문 행만 바꾸고 주석/빈 줄은 그대로 둔다
    let id = null;
    let row = 0;
    const out = text.split('\n').map((line) => {
      const l = line.trimEnd();
      if (l.startsWith('@')) {
        id = l.slice(1).trim().split(/\s+/)[0];
        row = 0;
        return line;
      }
      if (l === '' || l.startsWith(';') || !id || !pruned.has(id)) return line;
      return pruned.get(id)[row++];
    });
    writeFileSync(new URL(file, root), out.join('\n'));
    console.log(`${file}: ${((Date.now() - t0) / 1000).toFixed(1)}초`);
  }
  console.log(`지운 넝쿨 ${vine}칸, 단방향 발판 ${oneWay}칸, 메운 구석 ${filled}칸, 깎은 턱 ${shaved}칸`);
} finally {
  await server.close();
}
