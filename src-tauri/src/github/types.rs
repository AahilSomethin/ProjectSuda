use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubMonitorState {
    pub processed_event_ids: Vec<String>,
    pub branch_heads: std::collections::HashMap<String, String>,
    pub last_successful_poll_at: Option<String>,
    #[serde(default)]
    pub baseline_established: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum GitHubActivity {
    Push {
        id: String,
        repository: String,
        branch: String,
        actor: String,
        commit_count: u32,
        commit_messages: Vec<String>,
        forced: bool,
        occurred_at: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        url: Option<String>,
    },
    PullRequestMerged {
        id: String,
        repository: String,
        pull_request_number: u32,
        title: String,
        actor: String,
        base_branch: String,
        head_branch: String,
        occurred_at: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        url: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        merge_commit_sha: Option<String>,
    },
    BranchCreated {
        id: String,
        repository: String,
        branch: String,
        actor: String,
        occurred_at: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        url: Option<String>,
    },
    PullRequestUpdated {
        id: String,
        repository: String,
        pull_request_number: u32,
        title: String,
        actor: String,
        action: String,
        occurred_at: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        url: Option<String>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubPollResponse {
    pub activities: Vec<GitHubActivity>,
    pub updated_state: GitHubMonitorState,
    pub poll_interval_seconds: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubStatus {
    pub configured: bool,
    pub owner: Option<String>,
    pub repositories: Vec<String>,
    pub poll_interval_seconds: u64,
    pub notify_pull_requests: bool,
}

impl GitHubActivity {
    pub fn id(&self) -> &str {
        match self {
            GitHubActivity::Push { id, .. } => id,
            GitHubActivity::PullRequestMerged { id, .. } => id,
            GitHubActivity::BranchCreated { id, .. } => id,
            GitHubActivity::PullRequestUpdated { id, .. } => id,
        }
    }

    pub fn occurred_at(&self) -> &str {
        match self {
            GitHubActivity::Push { occurred_at, .. } => occurred_at,
            GitHubActivity::PullRequestMerged { occurred_at, .. } => occurred_at,
            GitHubActivity::BranchCreated { occurred_at, .. } => occurred_at,
            GitHubActivity::PullRequestUpdated { occurred_at, .. } => occurred_at,
        }
    }
}

pub fn format_activity_message(activity: &GitHubActivity) -> String {
    match activity {
        GitHubActivity::Push {
            actor,
            commit_count,
            repository,
            branch,
            forced,
            ..
        } => {
            if *forced {
                format!(
                    "The {branch} branch was force-pushed, likely following a rebase or history rewrite."
                )
            } else {
                let commit_word = if *commit_count == 1 {
                    "commit".to_string()
                } else {
                    format!("{commit_count} commits")
                };
                format!("{actor} pushed {commit_word} to {repository} on {branch}.")
            }
        }
        GitHubActivity::PullRequestMerged {
            pull_request_number,
            base_branch,
            ..
        } => format!("Pull request #{pull_request_number} was merged into {base_branch}."),
        GitHubActivity::BranchCreated { branch, .. } => {
            format!("A new branch named {branch} was pushed.")
        }
        GitHubActivity::PullRequestUpdated {
            pull_request_number,
            title,
            action,
            ..
        } => format!("Pull request #{pull_request_number} was {action}: {title}."),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn force_push_wording_does_not_claim_confirmed_rebase() {
        let activity = GitHubActivity::Push {
            id: "1".to_string(),
            repository: "suda".to_string(),
            branch: "feature/messages".to_string(),
            actor: "Aahil".to_string(),
            commit_count: 1,
            commit_messages: vec![],
            forced: true,
            occurred_at: "2026-07-13T10:00:00Z".to_string(),
            url: None,
        };
        let message = format_activity_message(&activity);
        assert!(message.contains("likely following a rebase or history rewrite"));
        assert!(!message.contains("was rebased"));
    }

    #[test]
    fn merge_message_format() {
        let activity = GitHubActivity::PullRequestMerged {
            id: "1".to_string(),
            repository: "MINDCrew".to_string(),
            pull_request_number: 42,
            title: "Add feature".to_string(),
            actor: "Aahil".to_string(),
            base_branch: "main".to_string(),
            head_branch: "feature".to_string(),
            occurred_at: "2026-07-13T10:00:00Z".to_string(),
            url: None,
            merge_commit_sha: Some("abc123".to_string()),
        };
        let message = format_activity_message(&activity);
        assert_eq!(message, "Pull request #42 was merged into main.");
    }
}
