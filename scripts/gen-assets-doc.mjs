// docs/ASSETS.md의 에셋 표를 manifest에서 다시 만든다: node scripts/gen-assets-doc.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const m = JSON.parse(readFileSync(new URL('../src/assets/manifest.json', import.meta.url), 'utf8'));
const docPath = new URL('../docs/ASSETS.md', import.meta.url);
const doc = readFileSync(docPath, 'utf8');
const lines = [];
lines.push('### 스프라이트시트', '', '| 키 | 파일 | 프레임 크기 | 애니메이션 (프레임 / fps) |', '|---|---|---|---|');
for (const s of m.spritesheets) {
  const anims = Object.entries(s.animations)
    .map(([a, d]) => `\`${s.key}_${a}\` [${d.frames.join(',')}] ${d.fps}fps${d.repeat === -1 ? ' 반복' : ''}`)
    .join('<br>');
  lines.push(`| \`${s.key}\` | \`${s.file}\` | ${s.frameWidth}×${s.frameHeight} (가로로 ${s.frameCount}칸 이상) | ${anims || '-'} |`);
}
lines.push('', '### 타일셋', '', '| 키 | 파일 | 규격 |', '|---|---|---|');
for (const t of m.tilesets) {
  lines.push(`| \`${t.key}\` | \`${t.file}\` | ${t.tileSize}px 타일 6칸 가로: [빈칸, 벽, 단방향 발판, 가시, 부서지는 벽, 봉쇄] |`);
}
lines.push('', '### 이미지', '', '| 키 | 파일 | 크기 |', '|---|---|---|');
for (const i of m.images) lines.push(`| \`${i.key}\` | \`${i.file}\` | ${i.width}×${i.height} |`);
lines.push('', '### 오디오', '', '| 키 | 파일 |', '|---|---|');
for (const a of m.audio) lines.push(`| \`${a.key}\` | \`${a.file}\` |`);
const start = '<!-- ASSET-TABLE:START -->';
const end = '<!-- ASSET-TABLE:END -->';
const next = doc.replace(new RegExp(`${start}[\\s\\S]*${end}`), `${start}\n${lines.join('\n')}\n${end}`);
writeFileSync(docPath, next);
