# Architecture

## High-level architecture

```mermaid
flowchart TD
  subgraph ui [React UI]
    SudaWidget["SudaWidget.tsx"]
    TransmissionPopup["TransmissionPopup.tsx"]
    SettingsPanel["SettingsPanel.tsx"]
  end

  subgraph hooks [Hooks]
    useTransmission["useTransmission.ts"]
    useChunkVoice["useChunkVoice.ts"]
    useSettings["useSettings.ts"]
    useSudaBriefing["useSudaBriefing.ts"]
  end

  subgraph orchestration [Orchestration]
    IntegrationMonitor["integrationMonitor.ts"]
    BriefingCoordinator["briefingCoordinator.ts"]
    NotificationGuards["notificationGuards.ts"]
  end

  subgraph detection [Detection and persistence]
    TaskChanges["taskChanges.ts"]
    TaskCache["taskCache.ts"]
    GitHubMonitorState["githubMonitorState.ts"]
    GitHubChanges["githubChanges.ts"]
  end

  subgraph services [Services]
    BriefingService["briefing.ts"]
    GitHubService["github.ts"]
    VoiceService["voice.ts"]
  end

  subgraph rust [Tauri Rust]
    LinearPoll["briefing/mod.rs linear_poll"]
    GitHubPoll["github/mod.rs github_poll"]
    ElevenLabs["elevenlabs.rs"]
  end

  SudaWidget --> IntegrationMonitor
  SudaWidget --> useTransmission
  TransmissionPopup --> useChunkVoice
  useChunkVoice --> VoiceService
  IntegrationMonitor --> BriefingCoordinator
  IntegrationMonitor --> NotificationGuards
  IntegrationMonitor --> TaskChanges
  IntegrationMonitor --> GitHubMonitorState
  BriefingService --> LinearPoll
  GitHubService --> GitHubPoll
  VoiceService --> ElevenLabs
  TaskChanges --> TaskCache
  GitHubPoll --> GitHubMonitorState
```

| Diagram node | Code mapping | Verification |
|---|---|---|
| `SudaWidget.tsx` | `src/components/SudaWidget.tsx` | Root widget component |
| `IntegrationMonitor` | `src/services/integrationMonitor.ts` | Singleton `integrationMonitor` |
| `BriefingCoordinator` | `src/lib/briefingCoordinator.ts` | `createBriefingEvents`, `buildCombinedBriefing` |
| `NotificationGuards` | `src/lib/notificationGuards.ts` | Central guard predicates |
| `TaskChanges` | `src/lib/taskChanges.ts` | `detectTaskChanges` |
| `GitHubMonitorState` | `src/lib/githubMonitorState.ts` | `load/saveGitHubMonitorState` |
| `VoiceService` | `src/services/voice.ts` | `speakText`, `canInvokeElevenLabs` |
| `LinearPoll` | `src-tauri/src/briefing/mod.rs` | Tauri `linear_poll` command |
| `GitHubPoll` | `src-tauri/src/github/mod.rs` | Tauri `github_poll` command |
| `ElevenLabs` | `src-tauri/src/elevenlabs.rs` | Tauri `elevenlabs_tts` command |

## Component ownership

| Layer | Responsibility | Key files |
|---|---|---|
| Rust | API calls, GitHub detection, TTS proxy | `src-tauri/src/briefing/`, `src-tauri/src/github/`, `elevenlabs.rs` |
| Services | Tauri invoke wrappers | `src/services/briefing.ts`, `github.ts`, `voice.ts` |
| Pure lib | Guards, detection, formatting, persistence | `src/lib/*` |
| Orchestration | Polling lifecycle, status, presentation gate | `src/services/integrationMonitor.ts` |
| React | Display, settings, user gestures | `src/components/`, `src/hooks/` |

## State ownership

| State | Owner | Persisted in | Main readers | Main writers |
|---|---|---|---|---|
| Linear task snapshots | `IntegrationMonitor.taskCache` via `taskCache.ts` | `localStorage` `suda-task-cache` | `detectTaskChanges` | successful Linear poll, `establishBaselineFromTasks` |
| GitHub processed events | `IntegrationMonitor.githubState` via `githubMonitorState.ts` | `localStorage` `suda-github-monitor-state` | Rust `filter_and_update_state` | successful GitHub poll |
| Integration status | `IntegrationMonitor` (`linear`, `github` runtime) | memory | `SettingsPanel` | poll and retry flows |
| Polling timer | `IntegrationMonitor.unifiedTimerId` | memory | `scheduleNext` | `initialize`, `stop`, `manualRetry` |
| Poll-in-flight flags | `IntegrationMonitor` per integration + `cycleInFlight` | memory | `pollLinear`, `pollGitHub` | same (`finally` release) |
| Retry/backoff | `IntegrationMonitor.failureCount` | memory | `getBackoffDelayMs` | `applyLinearResult`, `applyGitHubResult` |
| Transmission dedup IDs | `IntegrationMonitor.presentedTransmissionIds` | memory | `presentEvents` | successful presentation |
| Spoken voice keys | `voice.ts` `spokenVoiceKeys` | memory | `canInvokeElevenLabs` | successful speech |
| Voice settings | `useSettings` → `voice.ts` mute sync | `localStorage` `suda-settings` | `TransmissionPopup`, `voice.ts` | Settings panel |
| Current transmission | `useTransmission` state | memory | `TransmissionPopup` | `showTransmission` |

## Frontend dependency direction

```mermaid
flowchart TD
  types["types.ts / config.ts"]
  pure["taskCache, taskChanges, githubMonitorState, githubChanges, notificationGuards, transmissions, briefingCoordinator"]
  services["briefing.ts, github.ts, voice.ts"]
  monitor["integrationMonitor.ts"]
  hooks["useTransmission, useChunkVoice, useSettings, useSudaBriefing"]
  components["SudaWidget, TransmissionPopup, SettingsPanel"]

  types --> pure
  pure --> services
  services --> monitor
  monitor --> hooks
  hooks --> components
  pure --> monitor
```

Rules enforced:

- `voice.ts` does not import React components
- `briefingCoordinator.ts` does not call ElevenLabs
- Persistence modules do not open transmissions
- `notificationGuards.ts` has no service or UI imports

## State ownership flow

```mermaid
flowchart LR
  subgraph memory [In-memory owners]
    Monitor["IntegrationMonitor"]
    Voice["voice.ts"]
    UI["useTransmission"]
  end

  subgraph persist [localStorage]
    TaskLS["suda-task-cache"]
    GitHubLS["suda-github-monitor-state"]
    SettingsLS["suda-settings"]
  end

  Monitor -->|write| TaskLS
  Monitor -->|write| GitHubLS
  Monitor -->|read on retry| TaskLS
  Monitor -->|read on retry| GitHubLS
  Voice -->|spokenVoiceKeys| Voice
  UI -->|subscribe| Monitor
  SettingsLS -->|read/write| UI
```
