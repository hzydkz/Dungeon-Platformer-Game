/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 'true'면 프로덕션 빌드에서도 디버그 기능을 켠다 (`--mode preview`, `.env.preview`). */
  readonly VITE_DEBUG?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
