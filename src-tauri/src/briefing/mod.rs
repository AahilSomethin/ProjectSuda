mod linear;

use chrono::{Datelike, Duration, NaiveDate, Utc};
use chrono_tz::Tz;
use serde::Serialize;

use crate::integrations::{
    logging::{log_integration, log_once},
    IntegrationError, IntegrationResult, IntegrationStatus,
};

pub use linear::RawLinearTask;

const DEFAULT_TIMEZONE: &str = "Indian/Maldives";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BriefingFocusTask {
    pub title: String,
    pub reason: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BriefingRawTask {
    pub identifier: String,
    pub linear_id: String,
    pub title: String,
    pub url: String,
    pub state: String,
    pub priority: i32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub due_date: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub team: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub assignee: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BriefingStats {
    pub urgent_or_high: usize,
    pub due_today: usize,
    pub due_this_week: usize,
    pub overdue: usize,
    pub no_due_date: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LinearBriefingDiagnostics {
    pub linear_key_present: bool,
    pub can_reach_linear_viewer: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub linear_viewer_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub linear_error: Option<String>,
}

#[derive(Debug, Clone)]
pub struct BriefingContent {
    pub summary: String,
    pub focus_tasks: Vec<BriefingFocusTask>,
    pub warnings: Vec<String>,
    pub first_action: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LinearBriefingResponse {
    pub source: String,
    pub generated_at: String,
    pub task_count: usize,
    pub summary: String,
    pub focus_tasks: Vec<BriefingFocusTask>,
    pub warnings: Vec<String>,
    pub first_action: String,
    pub stats: BriefingStats,
    pub raw_tasks: Vec<BriefingRawTask>,
}


fn key_present(key: &str) -> bool {
    std::env::var(key)
        .map(|value| !value.trim().is_empty())
        .unwrap_or(false)
}


fn briefing_timezone() -> String {
    std::env::var("SUDA_TIMEZONE").unwrap_or_else(|_| DEFAULT_TIMEZONE.to_string())
}

pub fn today_in_timezone(tz_name: &str) -> NaiveDate {
    let tz: Tz = tz_name
        .parse()
        .unwrap_or(chrono_tz::Indian::Maldives);
    Utc::now().with_timezone(&tz).date_naive()
}

fn today_for_briefing() -> NaiveDate {
    today_in_timezone(&briefing_timezone())
}

fn format_due_label(due_date: &str, today: NaiveDate) -> String {
    let Some(due) = parse_due_date(due_date) else {
        return format!("due {due_date}");
    };

    if due < today {
        "overdue".to_string()
    } else if due == today {
        "due today".to_string()
    } else if due == today + Duration::days(1) {
        "due tomorrow".to_string()
    } else {
        format!("due {} {}", due.format("%b"), due.day())
    }
}

fn map_raw_tasks(tasks: &[RawLinearTask]) -> Vec<BriefingRawTask> {
    tasks
        .iter()
        .map(|task| BriefingRawTask {
            identifier: task.identifier.clone(),
            linear_id: task.id.clone(),
            title: task.title.clone(),
            url: task.url.clone(),
            state: task.state.clone(),
            priority: task.priority,
            due_date: task.due_date.clone(),
            updated_at: task.updated_at.clone(),
            project: task.project.clone(),
            team: task.team.clone(),
            description: task.description.clone(),
            assignee: task.assignee.clone(),
        })
        .collect()
}

fn priority_label(priority: i32) -> &'static str {
    match priority {
        1 => "Urgent",
        2 => "High",
        3 => "Normal",
        4 => "Low",
        _ => "Unprioritized",
    }
}

fn parse_due_date(due_date: &str) -> Option<NaiveDate> {
    NaiveDate::parse_from_str(due_date, "%Y-%m-%d").ok()
}

pub fn compute_stats(tasks: &[RawLinearTask]) -> BriefingStats {
    let today = today_for_briefing();
    let week_end = today + Duration::days(7);

    let mut stats = BriefingStats {
        urgent_or_high: 0,
        due_today: 0,
        due_this_week: 0,
        overdue: 0,
        no_due_date: 0,
    };

    for task in tasks {
        if task.priority == 1 || task.priority == 2 {
            stats.urgent_or_high += 1;
        }

        match task.due_date.as_deref().and_then(parse_due_date) {
            None => stats.no_due_date += 1,
            Some(due) if due < today => stats.overdue += 1,
            Some(due) if due == today => stats.due_today += 1,
            Some(due) if due > today && due <= week_end => stats.due_this_week += 1,
            Some(_) => {}
        }
    }

    stats
}

fn build_focus_reason(task: &RawLinearTask) -> String {
    let today = today_for_briefing();
    let mut parts = vec![priority_label(task.priority).to_string()];

    if let Some(due_date) = &task.due_date {
        parts.push(format_due_label(due_date, today));
    }

    parts.push(task.state.clone());

    if let Some(project) = &task.project {
        parts.push(project.clone());
    }

    if let Some(team) = &task.team {
        parts.push(team.clone());
    }

    parts.join(" · ")
}

fn build_empty_briefing() -> BriefingContent {
    BriefingContent {
        summary: "No active Linear tasks right now. You're clear.".to_string(),
        focus_tasks: vec![],
        warnings: vec![],
        first_action: "Enjoy the clear runway, or pick up something new when you're ready."
            .to_string(),
    }
}

pub fn build_deterministic_briefing(tasks: &[RawLinearTask]) -> BriefingContent {
    if tasks.is_empty() {
        return build_empty_briefing();
    }

    let stats = compute_stats(tasks);
    let count = tasks.len();
    let due_soon_count = stats.due_today + stats.due_this_week;

    let mut summary = format!(
        "You have {count} active Linear task{}. {} urgent/high priority. {} due soon.",
        if count == 1 { "" } else { "s" },
        stats.urgent_or_high,
        due_soon_count,
    );

    if stats.no_due_date == count {
        summary.push_str(" No due dates are set yet.");
    }

    if stats.urgent_or_high == 0 {
        summary.push_str(" No priority tasks detected.");
    }

    let focus_tasks: Vec<BriefingFocusTask> = tasks
        .iter()
        .take(3)
        .map(|task| BriefingFocusTask {
            title: task.title.clone(),
            reason: build_focus_reason(task),
            url: Some(task.url.clone()),
        })
        .collect();

    let today = today_for_briefing();
    let warnings: Vec<String> = tasks
        .iter()
        .filter_map(|task| {
            let due_date = task.due_date.as_ref()?;
            let parsed = parse_due_date(due_date)?;
            if parsed < today {
                Some(format!("{} ({}) is overdue.", task.title, task.identifier))
            } else if parsed == today {
                Some(format!("{} ({}) is due today.", task.title, task.identifier))
            } else {
                None
            }
        })
        .take(3)
        .collect();

    let first_action = if let Some(top) = tasks.first() {
        format!("Start with {} ({}).", top.title, top.identifier)
    } else {
        "Review your Linear board and pick the highest-impact task.".to_string()
    };

    BriefingContent {
        summary,
        focus_tasks,
        warnings,
        first_action,
    }
}


fn linear_api_key() -> Option<String> {
    std::env::var("LINEAR_API_KEY")
        .ok()
        .filter(|value| !value.trim().is_empty())
}

pub async fn poll_linear_briefing() -> IntegrationResult<LinearBriefingResponse> {
    let Some(linear_key) = linear_api_key() else {
        return IntegrationResult::disabled("LINEAR_API_KEY is not set");
    };

    match linear::fetch_my_issues(&linear_key).await {
        Ok(tasks) => {
            let stats = compute_stats(&tasks);
            let content = build_deterministic_briefing(&tasks);
            let response = LinearBriefingResponse {
                source: "linear".to_string(),
                generated_at: Utc::now().to_rfc3339(),
                task_count: tasks.len(),
                summary: content.summary,
                focus_tasks: content.focus_tasks,
                warnings: content.warnings,
                first_action: content.first_action,
                stats,
                raw_tasks: map_raw_tasks(&tasks),
            };
            IntegrationResult::connected(response)
        }
        Err(error) => {
            let status = if error.http_status == 401 || error.http_status == 403 {
                IntegrationStatus::AuthenticationFailed
            } else if error.http_status == 429 || error.http_status >= 500 || error.http_status == 0
            {
                IntegrationStatus::TemporarilyUnavailable
            } else {
                IntegrationStatus::TemporarilyUnavailable
            };

            if status == IntegrationStatus::AuthenticationFailed {
                log_once(
                    "linear-auth-failed",
                    format!(
                        "[Linear] Authentication failed: {}. Polling paused.",
                        error.message
                    ),
                );
            } else {
                log_integration(
                    "Linear",
                    format!("Request failed ({}): {}", error.http_status, error.message),
                );
            }

            IntegrationResult {
                status,
                data: None,
                error: Some(IntegrationError {
                    http_status: error.http_status,
                    message: error.message,
                }),
            }
        }
    }
}

pub async fn generate_linear_briefing() -> Result<LinearBriefingResponse, String> {
    let result = poll_linear_briefing().await;
    match result.status {
        IntegrationStatus::Connected => result
            .data
            .ok_or_else(|| "Linear briefing missing data".to_string()),
        IntegrationStatus::Disabled => Err(result
            .error
            .map(|e| e.message)
            .unwrap_or_else(|| "LINEAR_API_KEY is not set".to_string())),
        _ => Err(result
            .error
            .map(|e| {
                if e.http_status > 0 {
                    format!("Linear API error ({}) {}", e.http_status, e.message)
                } else {
                    e.message
                }
            })
            .unwrap_or_else(|| "Linear request failed".to_string())),
    }
}

pub async fn build_diagnostics() -> LinearBriefingDiagnostics {
    let linear_key_present = key_present("LINEAR_API_KEY");

    if !linear_key_present {
        return LinearBriefingDiagnostics {
            linear_key_present,
            can_reach_linear_viewer: false,
            linear_viewer_name: None,
            linear_error: Some("LINEAR_API_KEY is not set".to_string()),
        };
    }

    let linear_key = match std::env::var("LINEAR_API_KEY") {
        Ok(value) if !value.trim().is_empty() => value,
        _ => {
            return LinearBriefingDiagnostics {
                linear_key_present: false,
                can_reach_linear_viewer: false,
                linear_viewer_name: None,
                linear_error: Some("LINEAR_API_KEY is empty".to_string()),
            };
        }
    };

    match linear::fetch_viewer(&linear_key).await {
        Ok(viewer) => LinearBriefingDiagnostics {
            linear_key_present,
            can_reach_linear_viewer: true,
            linear_viewer_name: Some(viewer.name),
            linear_error: None,
        },
        Err(error) => LinearBriefingDiagnostics {
            linear_key_present,
            can_reach_linear_viewer: false,
            linear_viewer_name: None,
            linear_error: Some(if error.http_status > 0 {
                format!("{} {}", error.http_status, error.message)
            } else {
                error.message
            }),
        },
    }
}

#[tauri::command]
pub async fn linear_poll() -> IntegrationResult<LinearBriefingResponse> {
    poll_linear_briefing().await
}

#[tauri::command]
pub async fn linear_briefing_configured() -> LinearBriefingDiagnostics {
    build_diagnostics().await
}

#[tauri::command]
pub async fn linear_briefing() -> Result<LinearBriefingResponse, String> {
    generate_linear_briefing().await
}

#[cfg(test)]
mod tests {
    use super::*;
    use linear::RawLinearTask;

    fn sample_task(
        id: &str,
        priority: i32,
        due_date: Option<&str>,
        project: Option<&str>,
        team: Option<&str>,
    ) -> RawLinearTask {
        RawLinearTask {
            id: id.to_string(),
            identifier: id.to_string(),
            title: format!("Task {id}"),
            url: format!("https://linear.app/issue/{id}"),
            state: "In Progress".to_string(),
            priority,
            due_date: due_date.map(str::to_string),
            project: project.map(str::to_string),
            team: team.map(str::to_string),
            updated_at: Some("2026-07-08T10:00:00Z".to_string()),
            description: None,
            assignee: None,
        }
    }

    #[test]
    fn deterministic_briefing_lists_top_three_tasks() {
        let tasks = vec![
            sample_task("ENG-1", 1, Some("2026-07-08"), Some("SUDA"), Some("Core")),
            sample_task("ENG-2", 2, Some("2026-07-10"), None, Some("Core")),
            sample_task("ENG-3", 3, None, None, None),
            sample_task("ENG-4", 4, None, None, None),
        ];

        let briefing = build_deterministic_briefing(&tasks);
        assert!(briefing.summary.contains("4 active Linear tasks"));
        assert!(briefing.summary.contains("urgent/high priority"));
        assert!(briefing.summary.contains("due soon"));
        assert_eq!(briefing.focus_tasks.len(), 3);
        assert!(briefing.first_action.contains("ENG-1"));
        assert!(briefing.focus_tasks[0].reason.contains("SUDA"));
    }

    #[test]
    fn empty_briefing_is_calm() {
        let briefing = build_deterministic_briefing(&[]);
        assert!(briefing.summary.contains("You're clear"));
        assert!(briefing.focus_tasks.is_empty());

        let stats = compute_stats(&[]);
        assert_eq!(stats.urgent_or_high, 0);
        assert_eq!(stats.overdue, 0);
    }

    #[test]
    fn summary_appends_no_due_date_and_no_priority_messages() {
        let tasks = vec![
            sample_task("ENG-1", 3, None, None, None),
            sample_task("ENG-2", 4, None, None, None),
        ];

        let briefing = build_deterministic_briefing(&tasks);
        assert!(briefing.summary.contains("No due dates are set yet."));
        assert!(briefing.summary.contains("No priority tasks detected."));
    }

    #[test]
    fn compute_stats_counts_buckets() {
        let today = today_for_briefing();
        let today_str = today.format("%Y-%m-%d").to_string();
        let tomorrow = (today + Duration::days(1)).format("%Y-%m-%d").to_string();
        let last_week = (today - Duration::days(3)).format("%Y-%m-%d").to_string();
        let next_week = (today + Duration::days(5)).format("%Y-%m-%d").to_string();

        let tasks = vec![
            sample_task("ENG-1", 1, Some(&last_week), None, None),
            sample_task("ENG-2", 2, Some(&today_str), None, None),
            sample_task("ENG-3", 3, Some(&tomorrow), None, None),
            sample_task("ENG-4", 4, Some(&next_week), None, None),
            sample_task("ENG-5", 0, None, None, None),
        ];

        let stats = compute_stats(&tasks);
        assert_eq!(stats.urgent_or_high, 2);
        assert_eq!(stats.overdue, 1);
        assert_eq!(stats.due_today, 1);
        assert_eq!(stats.due_this_week, 2);
        assert_eq!(stats.no_due_date, 1);
    }

    #[test]
    fn format_due_label_uses_maldives_today() {
        let today = NaiveDate::from_ymd_opt(2026, 7, 9).expect("date");
        assert_eq!(format_due_label("2026-07-08", today), "overdue");
        assert_eq!(format_due_label("2026-07-09", today), "due today");
        assert_eq!(format_due_label("2026-07-10", today), "due tomorrow");
    }

    #[test]
    fn today_in_timezone_defaults_to_maldives() {
        let today = today_in_timezone("Indian/Maldives");
        assert!(today.year() >= 2026);
    }
}
