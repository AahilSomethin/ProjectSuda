import { invoke } from "@tauri-apps/api/core";
import type {
  GitHubMonitorState,
  GitHubPollResponse,
  GitHubStatus,
  IntegrationResult,
} from "../types";

function isTauriInvokeAvailable(): boolean {
  return (
    typeof window !== "undefined" &&
    ("__TAURI_INTERNALS__" in window || "__TAURI__" in window)
  );
}

export async function fetchGitHubPoll(
  state: GitHubMonitorState,
): Promise<IntegrationResult<GitHubPollResponse>> {
  if (!isTauriInvokeAvailable()) {
    return {
      status: "disabled",
      error: { httpStatus: 0, message: "GitHub requires the SUDA desktop app." },
    };
  }

  return invoke<IntegrationResult<GitHubPollResponse>>("github_poll", { state });
}

export async function fetchGitHubStatus(): Promise<GitHubStatus> {
  if (!isTauriInvokeAvailable()) {
    return {
      configured: false,
      repositories: [],
      pollIntervalSeconds: 60,
      notifyPullRequests: false,
    };
  }

  return invoke<GitHubStatus>("github_status");
}

export async function reloadIntegrationEnv(): Promise<void> {
  if (!isTauriInvokeAvailable()) return;
  await invoke("reload_integration_env_command");
}
