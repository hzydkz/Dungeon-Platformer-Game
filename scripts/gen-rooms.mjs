// 방 템플릿 자동 생성: node scripts/gen-rooms.mjs
// src/core/generation/roomgen.ts로 굴 모양 방을 만들고, 도달성 검증을 통과한 것만 src/rooms/gen/*.txt로 저장한다.
// 시드가 고정이라 같은 코드면 같은 결과. 생성기나 물리값을 바꾸면 다시 돌리고 npm test로 확인한다.
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const G = await server.ssrLoadModule('/src/core/generation/roomgen.ts');
  const { REACH_PARAMS } = await server.ssrLoadModule('/src/core/generation/params.ts');
  const { Rng } = await server.ssrLoadModule('/src/core/rng.ts');
  // [가로 칸, 세로 칸, 개수, 변마다 출입구가 있을 확률]
  const plan = [
    [1, 1, 64, 0.8],
    [2, 1, 22, 0.9],
    [3, 1, 14, 0.9],
    [1, 2, 22, 0.9],
    [2, 2, 16, 0.92],
  ];
  mkdirSync(new URL('../src/rooms/gen/', import.meta.url), { recursive: true });
  for (const [cw, ch, count, edge] of plan) {
    const out = [`; 자동 생성 (scripts/gen-rooms.mjs). 직접 고치지 말고 생성기를 고쳐 다시 만든다.\n`];
    let made = 0;
    let tries = 0;
    const t0 = Date.now();
    while (made < count && tries < count * 6) {
      const rng = new Rng(90000 + cw * 1000 + ch * 100 + tries++);
      const caps = G.randomCaps(rng, cw, ch, edge);
      if (caps.length < 2) continue;
      const t = G.generateRoom(rng, { id: `G${cw}x${ch}_${String(made + 1).padStart(2, '0')}`, cw, ch, caps }, REACH_PARAMS);
      if (!t) continue;
      out.push(G.formatTemplate(t));
      made++;
    }
    writeFileSync(new URL(`../src/rooms/gen/g${cw}x${ch}.txt`, import.meta.url), out.join('\n'));
    console.log(`${cw}x${ch}: ${made}/${count} (시도 ${tries}, ${((Date.now() - t0) / 1000).toFixed(1)}초)`);
  }
} finally {
  await server.close();
}
