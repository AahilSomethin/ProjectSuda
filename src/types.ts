export type IntegrationStatus =
  | "disabled"
  | "connecting"
  | "connected"
  | "temporarily_unavailable"
  | "authentication_failed";

export interface IntegrationError {
  httpStatus: number;
  message: string;
}

export interface IntegrationResult<T> {
  status: IntegrationStatus;
  data?: T | null;
  error?: IntegrationError | null;
}

export type GitHubActivity =
  | {
      id: string;
      type: "push";
      repository: string;
      branch: string;
      actor: string;
      commitCount: number;
      commitMessages: string[];
      forced: boolean;
      occurredAt: string;
      url?: string;
    }
  | {
      id: string;
      type: "pull_request_merged";
      repository: string;
      pullRequestNumber: number;
      title: string;
      actor: string;
      baseBranch: string;
      headBranch: string;
      occurredAt: string;
      url?: string;
      mergeCommitSha?: string;
    }
  | {
      id: string;
      type: "branch_created";
      repository: string;
      branch: string;
      actor: string;
      occurredAt: string;
      url?: string;
    }
  | {
      id: string;
      type: "pull_request_updated";
      repository: string;
      pullRequestNumber: number;
      title: string;
      actor: string;
      action: string;
      occurredAt: string;
      url?: string;
    };

export interface GitHubMonitorState {
  processedEventIds: string[];
  branchHeads: Record<string, string>;
  lastSuccessfulPollAt: string | null;
  baselineEstablished?: boolean;
}

export interface GitHubPollResponse {
  activities: GitHubActivity[];
  updatedState: GitHubMonitorState;
  pollIntervalSeconds: number;
}

export interface GitHubStatus {
  configured: boolean;
  owner?: string | null;
  repositories: string[];
  pollIntervalSeconds: number;
  notifyPullRequests: boolean;
}

export interface IntegrationViewStatus {
  name: "linear" | "github";
  status: IntegrationStatus;
  lastSuccessfulPollAt: string | null;
  message?: string;
}

export type TransmissionType = "task" | "meeting" | "update" | "info" | "briefing" | "github";

export type TransmissionPhase = "idle" | "intro" | "message";

export interface LinearTask {
  id: string;
  linearId: string;
  title: string;
  description?: string;
  status: string;
  priority?: string;
  dueDate?: string | null;
  assignee?: string | null;
  updatedAt: string;
}

export interface BriefingFocusTask {
  title: string;
  reason: string;
  url?: string | null;
}

export interface BriefingRawTask {
  identifier: string;
  linearId: string;
  title: string;
  url: string;
  state: string;
  priority: number;
  dueDate?: string | null;
  updatedAt?: string | null;
  project?: string | null;
  team?: string | null;
  description?: string | null;
  assignee?: string | null;
}

export interface BriefingStats {
  urgentOrHigh: number;
  dueToday: number;
  dueThisWeek: number;
  overdue: number;
  noDueDate: number;
}

export interface LinearBriefingResponse {
  source: "linear";
  generatedAt: string;
  taskCount: number;
  summary: string;
  focusTasks: BriefingFocusTask[];
  warnings: string[];
  firstAction: string;
  stats: BriefingStats;
  rawTasks: BriefingRawTask[];
}

export interface TransmissionPayload {
  title: string;
  message: string;
  /** Optional shorter text for TTS; defaults to message when omitted */
  voiceMessage?: string;
  type: TransmissionType;
  voiceEnabled?: boolean;
  characterVisible?: boolean;
  /** Skip the 3s GIF intro — used for idle/empty status messages */
  skipIntro?: boolean;
  /** Keep visible until user explicitly dismisses (no auto-hide) */
  persistUntilDismissed?: boolean;
}

export interface WidgetSettings {
  muteVoice: boolean;
  disableText: boolean;
  hideCharacter: boolean;
}

export interface ActiveTransmission extends TransmissionPayload {
  phase: TransmissionPhase;
}
