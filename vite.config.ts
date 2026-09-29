import { readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { defineConfig, type Plugin } from 'vitest/config';

const ASSET_DIR = join(import.meta.dirname, 'public', 'assets');
const VIRTUAL_ID = 'virtual:asset-files';

function listFiles(dir: string): string[] {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  return names.flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? listFiles(path) : [relative(ASSET_DIR, path).split(sep).join('/')];
  });
}

/**
 * `public/assets/` 아래에 실제로 있는 파일 목록을 `virtual:asset-files`로 제공한다.
 * Preload는 목록에 있는 파일만 불러오고 나머지는 플레이스홀더로 채운다 (없는 파일 요청으로 인한 404/디코딩 오류 방지).
 */
function assetFilesPlugin(): Plugin {
  const resolved = '\0' + VIRTUAL_ID;
  return {
    name: 'asset-files',
    resolveId: (id) => (id === VIRTUAL_ID ? resolved : null),
    load: (id) => (id === resolved ? `export default ${JSON.stringify(listFiles(ASSET_DIR))};` : null),
    configureServer(server) {
      server.watcher.add(ASSET_DIR);
      const reload = (file: string) => {
        if (!file.startsWith(ASSET_DIR)) return;
        const mod = server.moduleGraph.getModuleById(resolved);
        if (mod) server.moduleGraph.invalidateModule(mod);
        server.ws.send({ type: 'full-reload' });
      };
      server.watcher.on('add', reload);
      server.watcher.on('unlink', reload);
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [assetFilesPlugin()],
  build: {
    target: 'es2022',
    // Phaser 번들 자체가 약 1.2MB라 기본 경고 한도(500kB)를 넘는다.
    chunkSizeWarningLimit: 1500,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
