/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CHARACTER_GIF_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
