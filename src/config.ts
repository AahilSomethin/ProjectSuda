export const config = {
  characterGifUrl: import.meta.env.VITE_CHARACTER_GIF_URL ?? "",
  characterIdleImageUrl:
    import.meta.env.VITE_CHARACTER_IDLE_IMAGE_URL ?? "/suda-idle.png",
  transmissionIntroMs: 3000,
  linearPollIntervalMs: 60_000,
};
