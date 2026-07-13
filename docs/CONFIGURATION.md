# Configuration

All integration secrets are read by the **Tauri/Rust backend**. Do **not** prefix them with `VITE_`.

Restart `npm run tauri dev` after changing backend env vars.

## Linear

| Variable | Default | Required | Read by |
|---|---|---|---|
| `LINEAR_API_KEY` | none | Yes (to enable) | Rust |
| `LINEAR_AUTH_TYPE` | personal key behavior when unset | No | Rust |

Values: `personal_api_key` or `oauth`

## GitHub

| Variable | Default | Required | Read by |
|---|---|---|---|
| `GITHUB_TOKEN` | none | Yes (to enable) | Rust |
| `GITHUB_OWNER` | none | Yes (to enable) | Rust |
| `GITHUB_REPOSITORIES` | empty | Yes (comma-separated) | Rust |
| `GITHUB_POLL_INTERVAL_SECONDS` | `60` (min 15) | No | Rust |
| `GITHUB_NOTIFY_PULL_REQUESTS` | `false` when unset | No | Rust |

Truthy values for PR notifications: `true`, `1`, `yes`

Repository names are trimmed, blank entries removed, duplicates deduplicated.

## ElevenLabs

| Variable | Default | Required | Read by |
|---|---|---|---|
| `ELEVENLABS_API_KEY` | none | Yes (with voice ID) | Rust |
| `ELEVENLABS_VOICE_ID` | none | Yes (with API key) | Rust |
| `ELEVENLABS_MODEL_ID` | `eleven_multilingual_v2` | No | Rust |
| `ELEVENLABS_STABILITY` | `0.5` | No | Rust |
| `ELEVENLABS_SIMILARITY_BOOST` | `0.75` | No | Rust |
| `ELEVENLABS_STYLE` | `0.0` | No | Rust |
| `ELEVENLABS_USE_SPEAKER_BOOST` | `true` | No | Rust |

## Other

| Variable | Default | Required | Read by |
|---|---|---|---|
| `SUDA_TIMEZONE` | `Indian/Maldives` | No | Rust |
| `VITE_CHARACTER_GIF_URL` | `/suda.gif` | No | Frontend |
| `VITE_CHARACTER_IDLE_IMAGE_URL` | `/suda-idle.png` | No | Frontend |

## Security

Tokens (`LINEAR_API_KEY`, `GITHUB_TOKEN`, `ELEVENLABS_API_KEY`) must remain on the Rust side and must not be exposed to the browser bundle.
