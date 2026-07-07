/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CHARACTER_GIF_URL: string;
  readonly VITE_LINEAR_API_KEY: string;
  readonly VITE_LINEAR_TEAM_ID: string;
  readonly VITE_GOOGLE_CALENDAR_API_KEY: string;
  readonly VITE_GOOGLE_CALENDAR_ID: string;
  readonly VITE_ELEVENLABS_API_KEY: string;
  readonly VITE_ELEVENLABS_VOICE_ID: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
