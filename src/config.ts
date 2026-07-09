export const config = {
  characterGifUrl: import.meta.env.VITE_CHARACTER_GIF_URL ?? "",
  // Linear is handled server-side via Tauri commands.
  googleCalendarEnabled: false,
  transmissionIntroMs: 3000,
  linearPollIntervalMs: 60_000,
};
