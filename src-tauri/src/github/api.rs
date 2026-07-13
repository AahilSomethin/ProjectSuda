use reqwest::header::{HeaderMap, HeaderValue, ACCEPT, AUTHORIZATION, USER_AGENT};
use reqwest::StatusCode;

#[derive(Debug, Clone)]
pub struct GitHubApiError {
    pub http_status: u16,
    pub message: String,
    pub rate_limit_reset: Option<u64>,
}

pub struct GitHubClient {
    client: reqwest::Client,
    token: String,
    owner: String,
}

impl GitHubClient {
    pub fn new(token: &str, owner: &str) -> Result<Self, GitHubApiError> {
        let client = reqwest::Client::builder()
            .user_agent("SUDA")
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .map_err(|error| GitHubApiError {
                http_status: 0,
                message: format!("Failed to build HTTP client: {error}"),
                rate_limit_reset: None,
            })?;

        Ok(Self {
            client,
            token: token.trim().to_string(),
            owner: owner.trim().to_string(),
        })
    }

    fn headers(&self) -> Result<HeaderMap, GitHubApiError> {
        let mut headers = HeaderMap::new();
        headers.insert(
            AUTHORIZATION,
            HeaderValue::from_str(&format!("Bearer {}", self.token)).map_err(|error| {
                GitHubApiError {
                    http_status: 0,
                    message: format!("Invalid token: {error}"),
                    rate_limit_reset: None,
                }
            })?,
        );
        headers.insert(
            ACCEPT,
            HeaderValue::from_static("application/vnd.github+json"),
        );
        headers.insert(
            "X-GitHub-Api-Version",
            HeaderValue::from_static("2022-11-28"),
        );
        headers.insert(USER_AGENT, HeaderValue::from_static("SUDA"));
        Ok(headers)
    }

    fn parse_rate_limit_reset(headers: &HeaderMap) -> Option<u64> {
        headers
            .get("x-ratelimit-reset")
            .and_then(|value| value.to_str().ok())
            .and_then(|value| value.parse().ok())
    }

    pub async fn get_json(&self, url: &str) -> Result<serde_json::Value, GitHubApiError> {
        let response = self
            .client
            .get(url)
            .headers(self.headers()?)
            .send()
            .await
            .map_err(|error| GitHubApiError {
                http_status: 0,
                message: format!("GitHub request failed: {error}"),
                rate_limit_reset: None,
            })?;

        let status = response.status();
        let headers = response.headers().clone();
        let rate_limit_reset = Self::parse_rate_limit_reset(&headers);
        let body = response.text().await.map_err(|error| GitHubApiError {
            http_status: status.as_u16(),
            message: format!("Failed to read GitHub response: {error}"),
            rate_limit_reset,
        })?;

        if status == StatusCode::FORBIDDEN {
            let remaining = headers
                .get("x-ratelimit-remaining")
                .and_then(|v| v.to_str().ok())
                .and_then(|v| v.parse::<u32>().ok())
                .unwrap_or(1);
            if remaining == 0 {
                return Err(GitHubApiError {
                    http_status: 403,
                    message: "GitHub rate limit exceeded".to_string(),
                    rate_limit_reset,
                });
            }
        }

        if !status.is_success() {
            return Err(GitHubApiError {
                http_status: status.as_u16(),
                message: truncate_body(&body, 300),
                rate_limit_reset,
            });
        }

        serde_json::from_str(&body).map_err(|error| GitHubApiError {
            http_status: status.as_u16(),
            message: format!("Failed to parse GitHub JSON: {error}"),
            rate_limit_reset,
        })
    }

    pub fn repo_url(&self, repo: &str, path: &str) -> String {
        format!(
            "https://api.github.com/repos/{}/{}{}",
            self.owner, repo, path
        )
    }
}

fn truncate_body(body: &str, max_len: usize) -> String {
    if body.len() <= max_len {
        return body.to_string();
    }
    format!("{}...", &body[..max_len])
}
