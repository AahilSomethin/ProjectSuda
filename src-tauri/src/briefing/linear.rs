use crate::integrations::linear_auth::build_linear_auth_header;
use serde::Deserialize;

const LINEAR_GRAPHQL_URL: &str = "https://api.linear.app/graphql";

#[derive(Debug, Clone)]
pub struct LinearApiError {
    pub http_status: u16,
    pub message: String,
}

const VIEWER_QUERY: &str = r#"
query {
  viewer {
    id
    name
    email
  }
}
"#;

const MY_ISSUES_QUERY: &str = r#"
query MyIssues {
  issues(
    filter: {
      assignee: { isMe: { eq: true } }
      state: { type: { nin: ["completed", "canceled"] } }
    }
    first: 25
    orderBy: updatedAt
  ) {
    nodes {
      id
      identifier
      title
      url
      priority
      dueDate
      updatedAt
      description
      assignee {
        name
      }
      state {
        name
        type
      }
      team {
        name
      }
      project {
        name
      }
    }
  }
}
"#;

#[derive(Debug, Clone, Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LinearViewer {
    pub id: String,
    pub name: String,
    pub email: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LinearState {
    name: String,
    #[allow(dead_code)]
    r#type: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct LinearTeam {
    name: String,
}

#[derive(Debug, Clone, Deserialize)]
struct LinearProject {
    name: String,
}

#[derive(Debug, Clone, Deserialize)]
struct LinearAssignee {
    name: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LinearIssueNode {
    id: String,
    identifier: String,
    title: String,
    url: String,
    priority: i32,
    due_date: Option<String>,
    updated_at: Option<String>,
    description: Option<String>,
    assignee: Option<LinearAssignee>,
    state: Option<LinearState>,
    team: Option<LinearTeam>,
    project: Option<LinearProject>,
}

#[derive(Debug, Deserialize)]
struct LinearIssuesData {
    nodes: Vec<LinearIssueNode>,
}

#[derive(Debug, Deserialize)]
struct LinearIssuesQueryData {
    issues: LinearIssuesData,
}

#[derive(Debug, Deserialize)]
struct LinearViewerQueryData {
    viewer: LinearViewer,
}

#[derive(Debug, Deserialize)]
struct LinearGraphQlError {
    message: String,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RawLinearTask {
    pub id: String,
    pub identifier: String,
    pub title: String,
    pub url: String,
    pub state: String,
    pub priority: i32,
    pub due_date: Option<String>,
    pub project: Option<String>,
    pub team: Option<String>,
    pub updated_at: Option<String>,
    pub description: Option<String>,
    pub assignee: Option<String>,
}


pub fn truncate_body(body: &str, max_len: usize) -> String {
    if body.len() <= max_len {
        return body.to_string();
    }
    format!("{}...", &body[..max_len])
}

pub fn extract_graphql_error_messages(body: &str) -> Option<Vec<String>> {
    #[derive(Deserialize)]
    struct ErrorEnvelope {
        errors: Option<Vec<LinearGraphQlError>>,
    }

    let parsed: ErrorEnvelope = serde_json::from_str(body).ok()?;
    let errors = parsed.errors?;
    let messages: Vec<String> = errors.into_iter().map(|e| e.message).collect();
    if messages.is_empty() {
        None
    } else {
        Some(messages)
    }
}

async fn execute_graphql(query: &str, api_key: &str) -> Result<String, LinearApiError> {
    let client = reqwest::Client::new();
    let body = serde_json::json!({ "query": query });
    let auth_header = build_linear_auth_header(api_key);

    let response = client
        .post(LINEAR_GRAPHQL_URL)
        .header("Authorization", auth_header)
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|error| LinearApiError {
            http_status: 0,
            message: format!("Linear request failed: {error}"),
        })?;

    let status = response.status();
    let response_body = response.text().await.map_err(|error| LinearApiError {
        http_status: status.as_u16(),
        message: format!("Failed to read Linear response: {error}"),
    })?;

    if !status.is_success() {
        let preview = truncate_body(&response_body, 300);
        return Err(LinearApiError {
            http_status: status.as_u16(),
            message: format!("{status}: {preview}"),
        });
    }

    if let Some(messages) = extract_graphql_error_messages(&response_body) {
        let joined = messages.join("; ");
        return Err(LinearApiError {
            http_status: 200,
            message: format!("Linear GraphQL error: {joined}"),
        });
    }

    Ok(response_body)
}

pub async fn fetch_viewer(api_key: &str) -> Result<LinearViewer, LinearApiError> {
    let response_body = execute_graphql(VIEWER_QUERY, api_key).await?;

    #[derive(Deserialize)]
    struct ViewerEnvelope {
        data: Option<LinearViewerQueryData>,
    }

    let parsed: ViewerEnvelope = serde_json::from_str(&response_body).map_err(|error| {
        LinearApiError {
            http_status: 200,
            message: format!("Failed to parse Linear viewer response: {error}"),
        }
    })?;

    parsed
        .data
        .map(|data| data.viewer)
        .ok_or_else(|| LinearApiError {
            http_status: 200,
            message: "Linear returned no viewer data".to_string(),
        })
}

fn map_node(node: LinearIssueNode) -> RawLinearTask {
    RawLinearTask {
        id: node.id,
        identifier: node.identifier,
        title: node.title,
        url: node.url,
        state: node
            .state
            .map(|s| s.name)
            .unwrap_or_else(|| "Unknown".to_string()),
        priority: node.priority,
        due_date: node.due_date,
        project: node.project.map(|p| p.name),
        team: node.team.map(|t| t.name),
        updated_at: node.updated_at,
        description: node.description,
        assignee: node.assignee.map(|a| a.name),
    }
}

fn priority_sort_key(priority: i32) -> i32 {
    if priority == 0 {
        99
    } else {
        priority
    }
}

pub fn sort_tasks(tasks: &mut [RawLinearTask]) {
    tasks.sort_by(|a, b| {
        let priority_cmp = priority_sort_key(a.priority).cmp(&priority_sort_key(b.priority));
        if priority_cmp != std::cmp::Ordering::Equal {
            return priority_cmp;
        }

        match (&a.due_date, &b.due_date) {
            (Some(a_due), Some(b_due)) => {
                let due_cmp = a_due.cmp(b_due);
                if due_cmp != std::cmp::Ordering::Equal {
                    return due_cmp;
                }
            }
            (Some(_), None) => return std::cmp::Ordering::Less,
            (None, Some(_)) => return std::cmp::Ordering::Greater,
            (None, None) => {}
        }

        match (&a.updated_at, &b.updated_at) {
            (Some(a_updated), Some(b_updated)) => b_updated.cmp(a_updated),
            (Some(_), None) => std::cmp::Ordering::Less,
            (None, Some(_)) => std::cmp::Ordering::Greater,
            (None, None) => std::cmp::Ordering::Equal,
        }
    });
}

pub async fn fetch_my_issues(api_key: &str) -> Result<Vec<RawLinearTask>, LinearApiError> {
    let response_body = execute_graphql(MY_ISSUES_QUERY, api_key).await?;

    #[derive(Deserialize)]
    struct IssuesEnvelope {
        data: Option<LinearIssuesQueryData>,
    }

    let parsed: IssuesEnvelope = serde_json::from_str(&response_body).map_err(|error| {
        LinearApiError {
            http_status: 200,
            message: format!("Failed to parse Linear issues response: {error}"),
        }
    })?;

    let data = parsed.data.ok_or_else(|| LinearApiError {
        http_status: 200,
        message: "Linear returned no issues data".to_string(),
    })?;

    let mut tasks: Vec<RawLinearTask> = data.issues.nodes.into_iter().map(map_node).collect();
    sort_tasks(&mut tasks);

    Ok(tasks)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn task(
        id: &str,
        priority: i32,
        due_date: Option<&str>,
        updated_at: Option<&str>,
    ) -> RawLinearTask {
        RawLinearTask {
            id: id.to_string(),
            identifier: id.to_string(),
            title: format!("Task {id}"),
            url: format!("https://linear.app/issue/{id}"),
            state: "Todo".to_string(),
            priority,
            due_date: due_date.map(str::to_string),
            project: None,
            team: Some("Engineering".to_string()),
            updated_at: updated_at.map(str::to_string),
            description: None,
            assignee: None,
        }
    }

    #[test]
    fn sorts_by_priority_then_due_date_then_updated_at() {
        let mut tasks = vec![
            task("low", 4, Some("2026-07-10"), Some("2026-07-08T10:00:00Z")),
            task("urgent", 1, Some("2026-07-12"), Some("2026-07-07T10:00:00Z")),
            task("high-soon", 2, Some("2026-07-09"), Some("2026-07-06T10:00:00Z")),
            task("none", 0, None, Some("2026-07-09T10:00:00Z")),
            task("high-recent", 2, Some("2026-07-09"), Some("2026-07-08T12:00:00Z")),
        ];

        sort_tasks(&mut tasks);

        assert_eq!(tasks[0].id, "urgent");
        assert_eq!(tasks[1].id, "high-recent");
        assert_eq!(tasks[2].id, "high-soon");
        assert_eq!(tasks[3].id, "low");
        assert_eq!(tasks[4].id, "none");
    }

    #[test]
    fn truncates_long_body_preview() {
        let body = "x".repeat(400);
        let preview = truncate_body(&body, 300);
        assert!(preview.ends_with("..."));
        assert!(preview.len() <= 303);
    }

    #[test]
    fn extracts_graphql_error_messages() {
        let body = r#"{"errors":[{"message":"Invalid API key"}]}"#;
        let messages = extract_graphql_error_messages(body).expect("errors");
        assert_eq!(messages, vec!["Invalid API key"]);
    }

    #[test]
    fn parses_linear_issues_response_with_camel_case_fields() {
        let body = r#"{
          "data": {
            "issues": {
              "nodes": [
                {
                  "id": "issue-1",
                  "identifier": "ENG-1",
                  "title": "Fix auth",
                  "url": "https://linear.app/acme/issue/ENG-1",
                  "priority": 1,
                  "dueDate": "2026-07-10",
                  "updatedAt": "2026-07-08T10:00:00Z",
                  "state": { "name": "In Progress", "type": "started" },
                  "team": { "name": "Engineering" },
                  "project": null
                },
                {
                  "id": "issue-2",
                  "identifier": "ENG-2",
                  "title": "No team task",
                  "url": "https://linear.app/acme/issue/ENG-2",
                  "priority": 3,
                  "dueDate": null,
                  "updatedAt": "2026-07-07T10:00:00Z",
                  "state": { "name": "Todo", "type": "unstarted" },
                  "team": null,
                  "project": { "name": "SUDA" }
                }
              ]
            }
          }
        }"#;

        #[derive(Deserialize)]
        struct IssuesEnvelope {
            data: Option<LinearIssuesQueryData>,
        }

        let parsed: IssuesEnvelope =
            serde_json::from_str(body).expect("camelCase issues response should parse");

        let nodes = parsed.data.expect("data").issues.nodes;
        assert_eq!(nodes.len(), 2);

        let first = map_node(nodes[0].clone());
        assert_eq!(first.identifier, "ENG-1");
        assert_eq!(first.due_date.as_deref(), Some("2026-07-10"));
        assert_eq!(first.updated_at.as_deref(), Some("2026-07-08T10:00:00Z"));
        assert_eq!(first.team.as_deref(), Some("Engineering"));
        assert!(first.project.is_none());

        let second = map_node(nodes[1].clone());
        assert!(second.due_date.is_none());
        assert!(second.team.is_none());
        assert_eq!(second.project.as_deref(), Some("SUDA"));
    }

    #[test]
    fn maps_issue_with_missing_optional_fields() {
        let body = r#"{
          "data": {
            "issues": {
              "nodes": [
                {
                  "id": "issue-3",
                  "identifier": "ENG-3",
                  "title": "Sparse task",
                  "url": "https://linear.app/acme/issue/ENG-3",
                  "priority": 0,
                  "dueDate": null,
                  "updatedAt": null,
                  "state": null,
                  "team": null,
                  "project": null
                }
              ]
            }
          }
        }"#;

        #[derive(Deserialize)]
        struct IssuesEnvelope {
            data: Option<LinearIssuesQueryData>,
        }

        let parsed: IssuesEnvelope =
            serde_json::from_str(body).expect("sparse issues response should parse");

        let node = parsed
            .data
            .expect("data")
            .issues
            .nodes
            .into_iter()
            .next()
            .expect("one node");

        let mapped = map_node(node);
        assert_eq!(mapped.state, "Unknown");
        assert!(mapped.due_date.is_none());
        assert!(mapped.updated_at.is_none());
        assert!(mapped.team.is_none());
        assert!(mapped.project.is_none());
    }
}
