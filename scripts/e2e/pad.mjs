// 가상 Xbox(표준 매핑) 게임패드로 브라우저 자동 조작. navigator.getGamepads를 가짜 패드로 바꾼다.
// 사용: node scripts/e2e/pad.mjs 'http://localhost:5173/?seed=3' '[{"btn":0,"hold":150,"wait":500},{"axis":[1,0],"hold":300},{"eval":"..."}]' [스크린샷접두사]
// 단계 키: btn(버튼 번호, hold ms), axis([x,y] 왼쪽 스틱, hold ms), eval, shot(스크린샷), wait. 버튼: 0 A, 1 B, 2 X, 3 Y, 5 RB, 8 View, 9 Menu
// 창 크기: VIEWPORT=1024x768 (기본 960x540). 동시 입력: stick([x,y], 뗄 때까지 유지), btnDown/btnUp(버튼 번호). 단계 안 순서: 누르기/떼기 → eval → shot → wait
const { chromium } = await import(process.env.PLAYWRIGHT_PATH ?? '/opt/node22/lib/node_modules/playwright/index.mjs');
const [url, steps, out = 'pad'] = process.argv.slice(2);
let n = 0;
const b = await chromium.launch({ args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader'] });
const [vw, vh] = (process.env.VIEWPORT ?? '960x540').split('x').map(Number);
const p = await b.newPage({ viewport: { width: vw, height: vh } });
await p.addInitScript(() => {
  const pad = { id: 'Xbox Wireless Controller (STANDARD GAMEPAD)', index: 0, connected: true, mapping: 'standard', timestamp: 0,
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })), axes: [0, 0, 0, 0] };
  window.__pad = pad;
  navigator.getGamepads = () => { pad.timestamp = performance.now(); return [pad, null, null, null]; };
  window.addEventListener('load', () => setTimeout(() => { const e = new Event('gamepadconnected'); e.gamepad = pad; window.dispatchEvent(e); }, 500));
});
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
await p.goto(url); await p.waitForTimeout(2000);
for (const s of JSON.parse(steps)) {
  if (s.btn !== undefined) { await p.evaluate(i => { const bt = window.__pad.buttons[i]; bt.pressed = true; bt.value = 1; }, s.btn); await p.waitForTimeout(s.hold ?? 120); await p.evaluate(i => { const bt = window.__pad.buttons[i]; bt.pressed = false; bt.value = 0; }, s.btn); }
  if (s.axis) { await p.evaluate(a => { window.__pad.axes[0] = a[0]; window.__pad.axes[1] = a[1]; }, s.axis); await p.waitForTimeout(s.hold ?? 300); await p.evaluate(() => { window.__pad.axes[0] = 0; window.__pad.axes[1] = 0; }); }
  if (s.stick) await p.evaluate(a => { window.__pad.axes[0] = a[0]; window.__pad.axes[1] = a[1]; }, s.stick);
  if (s.btnDown !== undefined) await p.evaluate(i => { const bt = window.__pad.buttons[i]; bt.pressed = true; bt.value = 1; }, s.btnDown);
  if (s.btnUp !== undefined) await p.evaluate(i => { const bt = window.__pad.buttons[i]; bt.pressed = false; bt.value = 0; }, s.btnUp);
  if (s.eval) console.log('EVAL', JSON.stringify(await p.evaluate(s.eval)));
  if (s.shot) await p.screenshot({ path: `${out}-${n++}.png` });
  if (s.wait) await p.waitForTimeout(s.wait);
}
console.log('errors', JSON.stringify(errs));
await b.close();
