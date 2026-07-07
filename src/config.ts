export const config = {
  characterGifUrl: import.meta.env.VITE_CHARACTER_GIF_URL ?? "",
  linearApiKey: import.meta.env.VITE_LINEAR_API_KEY ?? "",
  linearTeamId: import.meta.env.VITE_LINEAR_TEAM_ID ?? "",
  // Google Calendar — disabled for now (not using API yet)
  // googleCalendarApiKey: import.meta.env.VITE_GOOGLE_CALENDAR_API_KEY ?? "",
  // googleCalendarId: import.meta.env.VITE_GOOGLE_CALENDAR_ID ?? "",
  googleCalendarEnabled: false,
  openaiApiKey: import.meta.env.VITE_OPENAI_API_KEY ?? "",
  openaiModel: import.meta.env.VITE_OPENAI_MODEL ?? "gpt-4o-mini",
  elevenLabsApiKey: import.meta.env.VITE_ELEVENLABS_API_KEY ?? "",
  elevenLabsVoiceId: import.meta.env.VITE_ELEVENLABS_VOICE_ID ?? "",
  transmissionIntroMs: 3000,
  linearPollIntervalMs: 60_000,
};
