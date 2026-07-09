/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CHARACTER_GIF_URL: string;
  readonly VITE_CHARACTER_IDLE_IMAGE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
