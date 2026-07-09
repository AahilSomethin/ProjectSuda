export const config = {
  characterGifUrl: import.meta.env.VITE_CHARACTER_GIF_URL ?? "",
  characterIdleImageUrl:
    import.meta.env.VITE_CHARACTER_IDLE_IMAGE_URL ?? "/suda-idle.png",
  // Linear is handled server-side via Tauri commands.
  googleCalendarEnabled: false,
  transmissionIntroMs: 3000,
  linearPollIntervalMs: 60_000,
};
