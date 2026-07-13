mod api;
mod detect;
pub mod types;

use api::GitHubClient;
use detect::{filter_and_update_state, poll_repository};
use types::{GitHubMonitorState, GitHubPollResponse, GitHubStatus};

use crate::integrations::{
    logging::{log_integration, log_once},
    IntegrationError, IntegrationResult, IntegrationStatus,
};

fn github_token() -> Option<String> {
    std::env::var("GITHUB_TOKEN")
        .ok()
        .filter(|v| !v.trim().is_empty())
}

fn github_owner() -> Option<String> {
    std::env::var("GITHUB_OWNER")
        .ok()
        .filter(|v| !v.trim().is_empty())
}

fn github_repositories() -> Vec<String> {
    let mut repos: Vec<String> = std::env::var("GITHUB_REPOSITORIES")
        .unwrap_or_default()
        .split(',')
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();
    repos.sort();
    repos.dedup();
    repos
}

const MIN_POLL_INTERVAL_SECONDS: u64 = 15;

pub fn github_poll_interval_seconds() -> u64 {
    std::env::var("GITHUB_POLL_INTERVAL_SECONDS")
        .ok()
        .and_then(|v| v.parse::<u64>().ok())
        .map(|value| value.max(MIN_POLL_INTERVAL_SECONDS))
        .unwrap_or(60)
}

fn notify_pull_requests() -> bool {
    std::env::var("GITHUB_NOTIFY_PULL_REQUESTS")
        .map(|v| {
            let lower = v.trim().to_lowercase();
            lower == "true" || lower == "1" || lower == "yes"
        })
        .unwrap_or(false)
}

pub fn github_configured() -> bool {
    github_token().is_some() && github_owner().is_some() && !github_repositories().is_empty()
}

#[tauri::command]
pub fn github_status() -> GitHubStatus {
    GitHubStatus {
        configured: github_configured(),
        owner: github_owner(),
        repositories: github_repositories(),
        poll_interval_seconds: github_poll_interval_seconds(),
        notify_pull_requests: notify_pull_requests(),
    }
}

#[tauri::command]
pub async fn github_poll(state: GitHubMonitorState) -> IntegrationResult<GitHubPollResponse> {
    if !github_configured() {
        return IntegrationResult::disabled("GitHub is not configured");
    }

    let token = github_token().expect("checked");
    let owner = github_owner().expect("checked");
    let repos = github_repositories();
    let notify_prs = notify_pull_requests();

    let client = match GitHubClient::new(&token, &owner) {
        Ok(client) => client,
        Err(error) => {
            return IntegrationResult {
                status: IntegrationStatus::TemporarilyUnavailable,
                data: None,
                error: Some(IntegrationError {
                    http_status: error.http_status,
                    message: error.message,
                    rate_limit_reset_at: None,
                }),
            };
        }
    };

    let mut all_activities = Vec::new();
    let mut merged_branch_heads = state.branch_heads.clone();

    for repo in &repos {
        match poll_repository(&client, repo, notify_prs, &state).await {
            Ok((activities, branch_heads)) => {
                all_activities.extend(activities);
                merged_branch_heads.extend(branch_heads);
            }
            Err(error) => {
                let status = if error.http_status == 401 || error.http_status == 403 {
                    if error.message.contains("rate limit") {
                        IntegrationStatus::TemporarilyUnavailable
                    } else {
                        IntegrationStatus::AuthenticationFailed
                    }
                } else if error.http_status == 429
                    || error.http_status >= 500
                    || error.http_status == 0
                {
                    IntegrationStatus::TemporarilyUnavailable
                } else {
                    IntegrationStatus::TemporarilyUnavailable
                };

                if status == IntegrationStatus::AuthenticationFailed {
                    log_once(
                        "github-auth-failed",
                        format!(
                            "[GitHub] Authentication failed: {}. Polling paused.",
                            error.message
                        ),
                    );
                } else {
                    log_integration(
                        "GitHub",
                        format!("Request failed ({}): {}", error.http_status, error.message),
                    );
                }

                return IntegrationResult {
                    status,
                    data: None,
                    error: Some(IntegrationError {
                        http_status: error.http_status,
                        message: error.message,
                        rate_limit_reset_at: error.rate_limit_reset.map(|ts| ts * 1000),
                    }),
                };
            }
        }
    }

    let (activities, next_state) =
        filter_and_update_state(&state, all_activities, merged_branch_heads);

    if !state.baseline_established && next_state.baseline_established {
        log_integration(
            "GitHub",
            format!(
                "Monitoring {} repositories every {} seconds.",
                repos.len(),
                github_poll_interval_seconds()
            ),
        );
    } else if !activities.is_empty() {
        for activity in &activities {
            log_integration(
                "GitHub",
                format!("New event: {}", activity_summary(activity)),
            );
        }
    }

    IntegrationResult {
        status: IntegrationStatus::Connected,
        data: Some(GitHubPollResponse {
            activities,
            updated_state: next_state,
            poll_interval_seconds: github_poll_interval_seconds(),
        }),
        error: None,
    }
}

fn activity_summary(activity: &types::GitHubActivity) -> String {
    match activity {
        types::GitHubActivity::Push {
            repository,
            branch,
            commit_count,
            forced,
            ..
        } => {
            if *forced {
                format!("force-push {repository}/{branch}")
            } else {
                format!("push {repository}/{branch}, {commit_count} commits")
            }
        }
        types::GitHubActivity::PullRequestMerged {
            repository,
            pull_request_number,
            ..
        } => format!("merge {repository}#{pull_request_number}"),
        types::GitHubActivity::BranchCreated {
            repository, branch, ..
        } => {
            format!("branch {repository}/{branch}")
        }
        types::GitHubActivity::PullRequestUpdated {
            repository,
            pull_request_number,
            ..
        } => format!("pr-update {repository}#{pull_request_number}"),
    }
}
