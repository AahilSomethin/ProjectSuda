use crate::github::api::GitHubClient;
use crate::github::types::{GitHubActivity, GitHubMonitorState};

const MAX_PROCESSED_IDS: usize = 500;

pub async fn poll_repository(
    client: &GitHubClient,
    repo: &str,
    notify_pull_requests: bool,
    state: &GitHubMonitorState,
) -> Result<
    (
        Vec<GitHubActivity>,
        std::collections::HashMap<String, String>,
    ),
    crate::github::api::GitHubApiError,
> {
    let mut activities = Vec::new();
    let mut branch_heads = state.branch_heads.clone();

    let events_url = client.repo_url(repo, "/events?per_page=30");
    let events = client.get_json(&events_url).await?;
    if let Some(items) = events.as_array() {
        for event in items {
            if let Some(activity) = activity_from_event(repo, event) {
                activities.push(activity);
            }
        }
    }

    let branches_url = client.repo_url(repo, "/branches?per_page=100");
    let branches = client.get_json(&branches_url).await?;
    if let Some(items) = branches.as_array() {
        for branch in items {
            let name = branch
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or_default()
                .to_string();
            let sha = branch
                .get("commit")
                .and_then(|c| c.get("sha"))
                .and_then(|v| v.as_str())
                .unwrap_or_default()
                .to_string();
            if name.is_empty() || sha.is_empty() {
                continue;
            }

            let key = branch_key(repo, &name);
            if !state.baseline_established {
                branch_heads.insert(key, sha);
                continue;
            }

            if let Some(previous) = state.branch_heads.get(&key) {
                if previous == &sha {
                    continue;
                }
                if !activities
                    .iter()
                    .any(|a| matches!(a, GitHubActivity::Push { branch, .. } if branch == &name))
                {
                    // Branch head changed without a recent push event in feed — treat as push
                    activities.push(GitHubActivity::Push {
                        id: format!("{repo}:sha:{sha}"),
                        repository: repo.to_string(),
                        branch: name.clone(),
                        actor: "Someone".to_string(),
                        commit_count: 1,
                        commit_messages: vec![],
                        forced: false,
                        occurred_at: chrono::Utc::now().to_rfc3339(),
                        url: None,
                    });
                }
            } else {
                activities.push(GitHubActivity::BranchCreated {
                    id: format!("{repo}:branch:{name}"),
                    repository: repo.to_string(),
                    branch: name.clone(),
                    actor: "Someone".to_string(),
                    occurred_at: chrono::Utc::now().to_rfc3339(),
                    url: None,
                });
            }
            branch_heads.insert(key, sha);
        }
    }

    if notify_pull_requests {
        let pulls_url = client.repo_url(
            repo,
            "/pulls?state=all&sort=updated&direction=desc&per_page=20",
        );
        let pulls = client.get_json(&pulls_url).await?;
        if let Some(items) = pulls.as_array() {
            for pull in items {
                if let Some(activity) = activity_from_pull(repo, pull, &state.pr_snapshots) {
                    activities.push(activity);
                }
            }
        }
    }

    Ok((activities, branch_heads))
}

fn branch_key(repo: &str, branch: &str) -> String {
    format!("{repo}:{branch}")
}

fn activity_from_event(repo: &str, event: &serde_json::Value) -> Option<GitHubActivity> {
    let event_id = event.get("id")?.as_u64()?;
    let event_type = event.get("type")?.as_str()?;
    let actor = event
        .get("actor")
        .and_then(|a| a.get("login"))
        .and_then(|v| v.as_str())
        .unwrap_or("Someone")
        .to_string();
    let occurred_at = event
        .get("created_at")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let unique_id = format!("{repo}:{event_id}");

    match event_type {
        "PushEvent" => {
            let payload = event.get("payload")?;
            let forced = payload
                .get("forced")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            let ref_name = payload.get("ref").and_then(|v| v.as_str()).unwrap_or("");
            let branch = ref_name
                .strip_prefix("refs/heads/")
                .unwrap_or(ref_name)
                .to_string();
            let commits = payload
                .get("commits")
                .and_then(|v| v.as_array())
                .cloned()
                .unwrap_or_default();
            let commit_count = payload
                .get("size")
                .and_then(|v| v.as_u64())
                .unwrap_or(commits.len() as u64) as u32;
            let commit_messages: Vec<String> = commits
                .iter()
                .filter_map(|c| c.get("message").and_then(|m| m.as_str()))
                .map(str::to_string)
                .collect();
            Some(GitHubActivity::Push {
                id: unique_id,
                repository: repo.to_string(),
                branch,
                actor,
                commit_count: commit_count.max(1),
                commit_messages,
                forced,
                occurred_at,
                url: event
                    .get("repo")
                    .and_then(|r| r.get("url"))
                    .and_then(|v| v.as_str())
                    .map(str::to_string),
            })
        }
        "PullRequestEvent" => {
            let payload = event.get("payload")?;
            let action = payload.get("action").and_then(|v| v.as_str()).unwrap_or("");
            let pull = payload.get("pull_request")?;
            let number = pull.get("number").and_then(|v| v.as_u64()).unwrap_or(0) as u32;
            let title = pull
                .get("title")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let merged = pull
                .get("merged")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            let base_branch = pull
                .get("base")
                .and_then(|b| b.get("ref"))
                .and_then(|v| v.as_str())
                .unwrap_or("main")
                .to_string();
            let head_branch = pull
                .get("head")
                .and_then(|h| h.get("ref"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let url = pull
                .get("html_url")
                .and_then(|v| v.as_str())
                .map(str::to_string);
            let merge_commit_sha = pull
                .get("merge_commit_sha")
                .and_then(|v| v.as_str())
                .map(str::to_string);

            if action == "closed" && merged {
                Some(GitHubActivity::PullRequestMerged {
                    id: format!("{repo}:pr:{number}:merged"),
                    repository: repo.to_string(),
                    pull_request_number: number,
                    title,
                    actor,
                    base_branch,
                    head_branch,
                    occurred_at,
                    url,
                    merge_commit_sha,
                })
            } else if matches!(action, "opened" | "reopened" | "synchronize" | "edited") {
                Some(GitHubActivity::PullRequestUpdated {
                    id: unique_id,
                    repository: repo.to_string(),
                    pull_request_number: number,
                    title,
                    actor,
                    action: action.to_string(),
                    occurred_at,
                    url,
                })
            } else {
                None
            }
        }
        "CreateEvent" => {
            let payload = event.get("payload")?;
            let ref_type = payload
                .get("ref_type")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            if ref_type != "branch" {
                return None;
            }
            let branch = payload
                .get("ref")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            Some(GitHubActivity::BranchCreated {
                id: unique_id,
                repository: repo.to_string(),
                branch,
                actor,
                occurred_at,
                url: None,
            })
        }
        _ => None,
    }
}

fn activity_from_pull(
    repo: &str,
    pull: &serde_json::Value,
    pr_snapshots: &std::collections::HashMap<String, String>,
) -> Option<GitHubActivity> {
    let number = pull.get("number").and_then(|v| v.as_u64()).unwrap_or(0) as u32;
    let title = pull
        .get("title")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let merged_at = pull.get("merged_at").and_then(|v| v.as_str());
    let updated_at = pull
        .get("updated_at")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let state = pull.get("state").and_then(|v| v.as_str()).unwrap_or("");
    let url = pull
        .get("html_url")
        .and_then(|v| v.as_str())
        .map(str::to_string);
    let base_branch = pull
        .get("base")
        .and_then(|b| b.get("ref"))
        .and_then(|v| v.as_str())
        .unwrap_or("main")
        .to_string();
    let head_branch = pull
        .get("head")
        .and_then(|h| h.get("ref"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let merge_commit_sha = pull
        .get("merge_commit_sha")
        .and_then(|v| v.as_str())
        .map(str::to_string);

    if merged_at.is_some() {
        return Some(GitHubActivity::PullRequestMerged {
            id: format!("{repo}:pr:{number}:merged"),
            repository: repo.to_string(),
            pull_request_number: number,
            title: title.clone(),
            actor: pull
                .get("user")
                .and_then(|u| u.get("login"))
                .and_then(|v| v.as_str())
                .unwrap_or("Someone")
                .to_string(),
            base_branch,
            head_branch,
            occurred_at: merged_at.unwrap_or(&updated_at).to_string(),
            url,
            merge_commit_sha,
        });
    }

    if state == "open" {
        let snapshot_key = pr_snapshot_key(repo, number);
        if pr_snapshots.get(&snapshot_key) == Some(&updated_at) {
            return None;
        }

        return Some(GitHubActivity::PullRequestUpdated {
            id: format!("{repo}:pr:{number}:updated:{updated_at}"),
            repository: repo.to_string(),
            pull_request_number: number,
            title,
            actor: pull
                .get("user")
                .and_then(|u| u.get("login"))
                .and_then(|v| v.as_str())
                .unwrap_or("Someone")
                .to_string(),
            action: "updated".to_string(),
            occurred_at: updated_at,
            url,
        });
    }

    None
}

pub fn filter_and_update_state(
    state: &GitHubMonitorState,
    mut activities: Vec<GitHubActivity>,
    branch_heads: std::collections::HashMap<String, String>,
) -> (Vec<GitHubActivity>, GitHubMonitorState) {
    activities.sort_by(|a, b| b.occurred_at().cmp(a.occurred_at()));
    activities = dedupe_merge_and_push(activities);

    let mut processed = state.processed_event_ids.clone();
    let mut pr_snapshots = state.pr_snapshots.clone();
    let mut notify = Vec::new();

    if !state.baseline_established {
        for activity in &activities {
            processed.push(activity.id().to_string());
            update_pr_snapshot(&mut pr_snapshots, activity);
        }
        processed = trim_processed_ids(processed);
        return (
            vec![],
            GitHubMonitorState {
                version: 1,
                processed_event_ids: processed,
                branch_heads,
                pr_snapshots,
                last_successful_poll_at: Some(chrono::Utc::now().to_rfc3339()),
                baseline_established: true,
            },
        );
    }

    for activity in activities {
        let id = activity.id().to_string();
        if processed.contains(&id) {
            continue;
        }
        if is_stale_pr_activity(&pr_snapshots, &activity) {
            processed.push(id);
            update_pr_snapshot(&mut pr_snapshots, &activity);
            continue;
        }
        processed.push(id);
        update_pr_snapshot(&mut pr_snapshots, &activity);
        notify.push(activity);
    }

    processed = trim_processed_ids(processed);

    (
        notify,
        GitHubMonitorState {
            version: 1,
            processed_event_ids: processed,
            branch_heads,
            pr_snapshots,
            last_successful_poll_at: Some(chrono::Utc::now().to_rfc3339()),
            baseline_established: true,
        },
    )
}

fn pr_snapshot_key(repository: &str, pull_request_number: u32) -> String {
    format!("{repository}:pr:{pull_request_number}")
}

fn update_pr_snapshot(
    snapshots: &mut std::collections::HashMap<String, String>,
    activity: &GitHubActivity,
) {
    match activity {
        GitHubActivity::PullRequestUpdated {
            repository,
            pull_request_number,
            occurred_at,
            ..
        }
        | GitHubActivity::PullRequestMerged {
            repository,
            pull_request_number,
            occurred_at,
            ..
        } => {
            snapshots.insert(
                pr_snapshot_key(repository, *pull_request_number),
                occurred_at.clone(),
            );
        }
        _ => {}
    }
}

fn is_stale_pr_activity(
    snapshots: &std::collections::HashMap<String, String>,
    activity: &GitHubActivity,
) -> bool {
    match activity {
        GitHubActivity::PullRequestUpdated {
            repository,
            pull_request_number,
            occurred_at,
            action,
            ..
        } if action == "updated" => {
            snapshots.get(&pr_snapshot_key(repository, *pull_request_number)) == Some(occurred_at)
        }
        _ => false,
    }
}

fn dedupe_merge_and_push(activities: Vec<GitHubActivity>) -> Vec<GitHubActivity> {
    let merge_shas: std::collections::HashSet<String> = activities
        .iter()
        .filter_map(|a| match a {
            GitHubActivity::PullRequestMerged {
                merge_commit_sha, ..
            } => merge_commit_sha.clone(),
            _ => None,
        })
        .collect();

    let has_merge: std::collections::HashSet<String> = activities
        .iter()
        .filter_map(|a| match a {
            GitHubActivity::PullRequestMerged {
                repository,
                base_branch,
                ..
            } => Some(format!("{repository}:{base_branch}")),
            _ => None,
        })
        .collect();

    activities
        .into_iter()
        .filter(|activity| match activity {
            GitHubActivity::Push {
                repository,
                branch,
                forced,
                ..
            } => {
                if *forced {
                    return true;
                }
                let key = format!("{repository}:{branch}");
                if has_merge.contains(&key) {
                    return false;
                }
                true
            }
            GitHubActivity::PullRequestMerged {
                merge_commit_sha: _,
                ..
            } => true,
            _ => true,
        })
        .filter(|activity| {
            if let GitHubActivity::Push { id, .. } = activity {
                if id.contains(":sha:") {
                    let sha = id.split(":sha:").nth(1).unwrap_or("");
                    return !merge_shas.contains(sha);
                }
            }
            true
        })
        .collect()
}

fn trim_processed_ids(mut ids: Vec<String>) -> Vec<String> {
    if ids.len() > MAX_PROCESSED_IDS {
        ids = ids.split_off(ids.len() - MAX_PROCESSED_IDS);
    }
    ids
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn merge_suppresses_base_branch_push() {
        let activities = vec![
            GitHubActivity::PullRequestMerged {
                id: "suda:pr:42:merged".to_string(),
                repository: "MINDCrew".to_string(),
                pull_request_number: 42,
                title: "Feature".to_string(),
                actor: "Aahil".to_string(),
                base_branch: "main".to_string(),
                head_branch: "feature".to_string(),
                occurred_at: "2026-07-13T10:00:00Z".to_string(),
                url: None,
                merge_commit_sha: Some("abc".to_string()),
            },
            GitHubActivity::Push {
                id: "MINDCrew:123".to_string(),
                repository: "MINDCrew".to_string(),
                branch: "main".to_string(),
                actor: "Aahil".to_string(),
                commit_count: 3,
                commit_messages: vec![],
                forced: false,
                occurred_at: "2026-07-13T10:00:00Z".to_string(),
                url: None,
            },
        ];

        let deduped = dedupe_merge_and_push(activities);
        assert_eq!(deduped.len(), 1);
        assert!(matches!(
            deduped[0],
            GitHubActivity::PullRequestMerged { .. }
        ));
    }

    #[test]
    fn baseline_establishes_without_notifications() {
        let state = GitHubMonitorState {
            version: 1,
            processed_event_ids: vec![],
            branch_heads: std::collections::HashMap::new(),
            pr_snapshots: std::collections::HashMap::new(),
            last_successful_poll_at: None,
            baseline_established: false,
        };
        let activities = vec![GitHubActivity::Push {
            id: "suda:1".to_string(),
            repository: "suda".to_string(),
            branch: "main".to_string(),
            actor: "Aahil".to_string(),
            commit_count: 1,
            commit_messages: vec![],
            forced: false,
            occurred_at: "2026-07-13T10:00:00Z".to_string(),
            url: None,
        }];
        let (notify, next) =
            filter_and_update_state(&state, activities, std::collections::HashMap::new());
        assert!(notify.is_empty());
        assert!(next.baseline_established);
        assert!(next.processed_event_ids.contains(&"suda:1".to_string()));
    }

    #[test]
    fn duplicate_event_id_is_filtered() {
        let state = GitHubMonitorState {
            version: 1,
            processed_event_ids: vec!["suda:1".to_string()],
            branch_heads: std::collections::HashMap::new(),
            pr_snapshots: std::collections::HashMap::new(),
            last_successful_poll_at: Some("2026-07-13T10:00:00Z".to_string()),
            baseline_established: true,
        };
        let activities = vec![GitHubActivity::Push {
            id: "suda:1".to_string(),
            repository: "suda".to_string(),
            branch: "main".to_string(),
            actor: "Aahil".to_string(),
            commit_count: 1,
            commit_messages: vec![],
            forced: false,
            occurred_at: "2026-07-13T10:00:00Z".to_string(),
            url: None,
        }];
        let (notify, _) =
            filter_and_update_state(&state, activities, std::collections::HashMap::new());
        assert!(notify.is_empty());
    }

    #[test]
    fn empty_activities_after_baseline_notify_nothing() {
        let state = GitHubMonitorState {
            version: 1,
            processed_event_ids: vec![],
            branch_heads: std::collections::HashMap::new(),
            pr_snapshots: std::collections::HashMap::new(),
            last_successful_poll_at: Some("2026-07-13T10:00:00Z".to_string()),
            baseline_established: true,
        };
        let (notify, _) = filter_and_update_state(&state, vec![], std::collections::HashMap::new());
        assert!(notify.is_empty());
    }

    #[test]
    fn pull_request_opened_from_event() {
        let event = serde_json::json!({
            "id": 99,
            "type": "PullRequestEvent",
            "actor": { "login": "Aahil" },
            "created_at": "2026-07-13T10:00:00Z",
            "payload": {
                "action": "opened",
                "pull_request": {
                    "number": 42,
                    "title": "Add feature",
                    "html_url": "https://github.com/org/MINDCrew/pull/42"
                }
            }
        });

        let activity = activity_from_event("MINDCrew", &event);
        assert!(matches!(
            activity,
            Some(GitHubActivity::PullRequestUpdated {
                pull_request_number: 42,
                action,
                ..
            }) if action == "opened"
        ));
    }
}
