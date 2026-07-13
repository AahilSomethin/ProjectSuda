# Testing

## Commands

```bash
# Frontend unit tests
npm test

# Frontend watch mode
npm run test:watch

# Frontend production build
npm run build

# Rust tests
cd src-tauri
cargo test

# Rust format check
cargo fmt --check

# Rust compile check
cargo check
```

## Frontend test files

| File | Coverage |
|---|---|
| `notificationGuards.test.ts` | Central guard predicates |
| `integrationMonitor.test.ts` | Polling, auth, backoff, dedup, combined transmission |
| `taskChanges.test.ts` | Baseline, updates, updatedAt noise, pruning |
| `briefingCoordinator.test.ts` | Event ordering, 5-event cap |
| `githubChanges.test.ts` | Message formatting, force-push wording |
| `githubMonitorState.test.ts` | Invalid JSON, migration, ID cap |
| `transmissions.test.ts` | Payload kind assignment |
| `voice.test.ts` | `canInvokeElevenLabs`, voice dedup |
| `voiceSafety.test.ts` | Voice text length limits |
| `linearAuth.test.ts` | Auth header rules |
| `timezone.test.ts` | Maldives timezone helpers |

## Rust test files

| Module | Coverage |
|---|---|
| `github/detect.rs` | Baseline, merge/push dedup, duplicate ID, empty result |
| `github/types.rs` | Force-push wording |
| `briefing/mod.rs` | Briefing content |
| `briefing/linear.rs` | Sort, parsing |
| `integrations/linear_auth.rs` | Bearer rules |
| `elevenlabs.rs` | Error parsing |

## Manual verification matrix

| Scenario | Expected |
|---|---|
| First launch | Baseline only, no transmission |
| Linear status change | Combined update transmission |
| GitHub push | Combined update transmission |
| Muted voice | Text only |
| Auth failure | Settings warning, no transmission |
| Manual refresh, no changes | Silent |
| Summon SUDA idle | Text only, no voice |

## Test hygiene

- `integrationMonitor.__resetForTests()` between monitor tests
- Fake timers restored in `afterEach`
- localStorage cleaned in state tests
- No real Linear, GitHub, or ElevenLabs API calls
