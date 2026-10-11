// 브라우저 자동 조작 (키보드). 개발 서버를 먼저 띄운다: npx vite --port 5173
// 사용: node scripts/e2e/play.mjs 'http://localhost:5173/?seed=3' 출력접두사 '[{"press":"Enter","wait":600},{"eval":"window.__game.scene.getScenes(true).map(s=>s.scene.key)"},{"shot":1}]'
// 단계 키: viewport('1024x768', 창 크기 변경), down/up/press(키), eval(페이지에서 실행, 결과 출력), shot(스크린샷), wait(ms, 마지막에 대기)
// 창 크기: VIEWPORT=1024x768 (기본 960x540). 디버그 빌드는 window.__game(Phaser.Game)을 노출한다. PLAYWRIGHT_PATH로 playwright 위치를 바꿀 수 있다.
const { chromium } = await import(process.env.PLAYWRIGHT_PATH ?? '/opt/node22/lib/node_modules/playwright/index.mjs');
const [url, out, steps] = process.argv.slice(2);
const b = await chromium.launch({ args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader','--disable-renderer-backgrounding','--disable-background-timer-throttling','--disable-backgrounding-occluded-windows','--disable-features=CalculateNativeWinOcclusion'] });
const [vw, vh] = (process.env.VIEWPORT ?? '960x540').split('x').map(Number);
const p = await b.newPage({ viewport: { width: vw, height: vh } });
const errs = [];
p.on('pageerror', e => errs.push('PAGEERROR ' + String(e.stack || e)));
p.on('console', m => { if (m.type()==='error' && !m.text().includes('404') && !m.text().includes('Failed to load resource')) errs.push(m.text()); });
await p.goto(url);
await p.waitForTimeout(2000);
let n = 0;
for (const s of JSON.parse(steps)) {
  if (s.viewport) { const [w, h] = s.viewport.split('x').map(Number); await p.setViewportSize({ width: w, height: h }); }
  if (s.down) await p.keyboard.down(s.down);
  if (s.up) await p.keyboard.up(s.up);
  if (s.press) await p.keyboard.press(s.press);
  if (s.eval) console.log('EVAL', JSON.stringify(await p.evaluate(s.eval)));
  if (s.shot) await p.screenshot({ path: `${out}-${n++}.png` });
  if (s.wait) await p.waitForTimeout(s.wait);
}
console.log('errors:', JSON.stringify(errs));
await b.close();
