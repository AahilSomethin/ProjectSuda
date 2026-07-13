/// Build the Linear Authorization header value based on LINEAR_AUTH_TYPE.
/// Personal API keys must NOT use Bearer; OAuth access tokens must.
pub fn build_linear_auth_header(api_key: &str) -> String {
    let trimmed = api_key.trim();
    let auth_type = std::env::var("LINEAR_AUTH_TYPE").unwrap_or_default();
    let auth_type = auth_type.trim().to_lowercase();

    if auth_type == "oauth" {
        if trimmed.starts_with("Bearer ") {
            trimmed.to_string()
        } else {
            format!("Bearer {trimmed}")
        }
    } else {
        trimmed
            .strip_prefix("Bearer ")
            .unwrap_or(trimmed)
            .to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn with_auth_type(auth_type: Option<&str>, key: &str) -> String {
        match auth_type {
            Some(value) => std::env::set_var("LINEAR_AUTH_TYPE", value),
            None => std::env::remove_var("LINEAR_AUTH_TYPE"),
        }
        build_linear_auth_header(key)
    }

    #[test]
    fn personal_api_key_does_not_receive_bearer_prefix() {
        assert_eq!(
            with_auth_type(Some("personal_api_key"), "lin_api_abc123"),
            "lin_api_abc123"
        );
        assert_eq!(
            with_auth_type(None, "lin_api_abc123"),
            "lin_api_abc123"
        );
    }

    #[test]
    fn personal_api_key_strips_accidental_bearer_prefix() {
        assert_eq!(
            with_auth_type(Some("personal_api_key"), "Bearer lin_api_abc123"),
            "lin_api_abc123"
        );
    }

    #[test]
    fn oauth_token_receives_bearer_prefix() {
        assert_eq!(
            with_auth_type(Some("oauth"), "access_token_xyz"),
            "Bearer access_token_xyz"
        );
    }

    #[test]
    fn oauth_token_preserves_existing_bearer_prefix() {
        assert_eq!(
            with_auth_type(Some("oauth"), "Bearer access_token_xyz"),
            "Bearer access_token_xyz"
        );
    }
}
