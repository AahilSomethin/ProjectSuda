# SUDA Documentation

SUDA is a desktop overlay assistant (Tauri + React) that monitors Linear tasks and GitHub repository activity, then delivers combined text and voice transmissions.

## Main features

- Unified polling for Linear and GitHub integrations
- Change detection with baseline establishment and deduplication
- Combined briefing transmissions (up to five events per update)
- ElevenLabs TTS with optional browser speech fallback
- Settings panel with integration status and manual retry

## Where to begin

1. [ARCHITECTURE.md](./ARCHITECTURE.md) — system layout and state ownership
2. [NOTIFICATION_FLOW.md](./NOTIFICATION_FLOW.md) — end-to-end notification path
3. [INTEGRATIONS.md](./INTEGRATIONS.md) — Linear and GitHub behavior
4. [CONFIGURATION.md](./CONFIGURATION.md) — environment variables

## Documentation index

| Document | Description |
|---|---|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Components, dependency flow, state ownership |
| [NOTIFICATION_FLOW.md](./NOTIFICATION_FLOW.md) | Sequence diagram and decision tables |
| [INTEGRATIONS.md](./INTEGRATIONS.md) | Linear and GitHub polling details |
| [VOICE_SYSTEM.md](./VOICE_SYSTEM.md) | Voice eligibility and ElevenLabs flow |
| [STATE_AND_DEDUPLICATION.md](./STATE_AND_DEDUPLICATION.md) | Persistence and dedup keys |
| [CONFIGURATION.md](./CONFIGURATION.md) | Environment variables |
| [ERROR_HANDLING.md](./ERROR_HANDLING.md) | Errors, circuit breakers, backoff |
| [TESTING.md](./TESTING.md) | Test commands and matrix |
| [diagrams/README.md](./diagrams/README.md) | Diagram index |
| [AUDIT_REPORT.md](./AUDIT_REPORT.md) | Final audit report |

## Quick development setup

```bash
npm install
cp .env.example .env   # add LINEAR_API_KEY, GITHUB_TOKEN, etc.
npm run tauri dev
```

Run tests:

```bash
npm test
cd src-tauri && cargo test
```

## Documentation parity

The documentation in this folder was checked against:

- Final TypeScript implementation
- Final Rust implementation
- Environment examples
- Automated tests
- Runtime control flow
