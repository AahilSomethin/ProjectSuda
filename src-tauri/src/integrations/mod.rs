pub mod env;
pub mod linear_auth;
pub mod logging;

use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum IntegrationStatus {
    Disabled,
    Connecting,
    Connected,
    TemporarilyUnavailable,
    AuthenticationFailed,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IntegrationError {
    pub http_status: u16,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IntegrationResult<T> {
    pub status: IntegrationStatus,
    pub data: Option<T>,
    pub error: Option<IntegrationError>,
}

impl<T> IntegrationResult<T> {
    pub fn connected(data: T) -> Self {
        Self {
            status: IntegrationStatus::Connected,
            data: Some(data),
            error: None,
        }
    }

    pub fn disabled(message: impl Into<String>) -> Self {
        Self {
            status: IntegrationStatus::Disabled,
            data: None,
            error: Some(IntegrationError {
                http_status: 0,
                message: message.into(),
            }),
        }
    }

    pub fn authentication_failed(http_status: u16, message: impl Into<String>) -> Self {
        Self {
            status: IntegrationStatus::AuthenticationFailed,
            data: None,
            error: Some(IntegrationError {
                http_status,
                message: message.into(),
            }),
        }
    }

    pub fn temporarily_unavailable(http_status: u16, message: impl Into<String>) -> Self {
        Self {
            status: IntegrationStatus::TemporarilyUnavailable,
            data: None,
            error: Some(IntegrationError {
                http_status,
                message: message.into(),
            }),
        }
    }
}

pub fn status_from_http(http_status: u16) -> IntegrationStatus {
    if http_status == 401 || http_status == 403 {
        IntegrationStatus::AuthenticationFailed
    } else if http_status == 429 || http_status >= 500 {
        IntegrationStatus::TemporarilyUnavailable
    } else if http_status == 0 {
        IntegrationStatus::TemporarilyUnavailable
    } else {
        IntegrationStatus::TemporarilyUnavailable
    }
}
