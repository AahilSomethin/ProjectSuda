use base64::{engine::general_purpose::STANDARD, Engine as _};

use serde::Deserialize;

use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]

pub struct TtsResponse {
    pub audio_base64: String,

    pub voice_id: String,

    pub model_id: String,
}

#[derive(Debug, Deserialize)]

struct ElevenLabsErrorDetail {
    status: Option<String>,

    message: Option<String>,
}

#[derive(Debug, Deserialize)]

struct ElevenLabsErrorBody {
    detail: Option<ElevenLabsErrorDetail>,
}

struct ParsedApiError {
    detail_status: Option<String>,

    message: String,
}

fn env_or_default(key: &str, default: &str) -> String {
    std::env::var(key).unwrap_or_else(|_| default.to_string())
}

fn env_parse_or_default<T: std::str::FromStr>(key: &str, default: T) -> T {
    std::env::var(key)
        .ok()
        .and_then(|value| value.parse().ok())
        .unwrap_or(default)
}

fn env_bool_or_default(key: &str, default: bool) -> bool {
    std::env::var(key)
        .ok()
        .map(|value| matches!(value.to_lowercase().as_str(), "1" | "true" | "yes"))
        .unwrap_or(default)
}

fn truncate_body(body: &str, max_len: usize) -> String {
    if body.len() <= max_len {
        return body.to_string();
    }

    format!("{}...", &body[..max_len])
}

fn parse_api_error(body: &str) -> ParsedApiError {
    if let Ok(parsed) = serde_json::from_str::<ElevenLabsErrorBody>(body) {
        if let Some(detail) = parsed.detail {
            let message = detail
                .message
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| truncate_body(body, 300));

            return ParsedApiError {
                detail_status: detail.status,

                message,
            };
        }
    }

    ParsedApiError {
        detail_status: None,

        message: truncate_body(body, 300),
    }
}

fn format_api_error(status: reqwest::StatusCode, body: &str) -> String {
    let parsed = parse_api_error(body);

    match parsed.detail_status {
        Some(detail_status) => format!(
            "ElevenLabs API error ({status}): {detail_status} — {}",
            parsed.message
        ),

        None => format!("ElevenLabs API error ({status}): {}", parsed.message),
    }
}

#[cfg(debug_assertions)]

fn log_api_error(status: reqwest::StatusCode, body: &str, voice_id: &str, model_id: &str) {
    let parsed = parse_api_error(body);

    let detail_status = parsed.detail_status.as_deref().unwrap_or("unknown");

    println!(
        "[SUDA] ElevenLabs API error status={} detail_status={} voice_id={} model_id={} message={}",
        status.as_u16(),
        detail_status,
        voice_id,
        model_id,
        parsed.message
    );
}

pub fn is_configured() -> bool {
    let api_key = std::env::var("ELEVENLABS_API_KEY").unwrap_or_default();

    let voice_id = std::env::var("ELEVENLABS_VOICE_ID").unwrap_or_default();

    !api_key.trim().is_empty() && !voice_id.trim().is_empty()
}

#[tauri::command]

pub fn elevenlabs_configured() -> bool {
    is_configured()
}

#[tauri::command]

pub async fn elevenlabs_tts(text: String) -> Result<TtsResponse, String> {
    let api_key = std::env::var("ELEVENLABS_API_KEY")
        .map_err(|_| "ELEVENLABS_API_KEY is not set".to_string())?;

    let voice_id = std::env::var("ELEVENLABS_VOICE_ID")
        .map_err(|_| "ELEVENLABS_VOICE_ID is not set".to_string())?;

    if api_key.trim().is_empty() {
        return Err("ELEVENLABS_API_KEY is empty".to_string());
    }

    if voice_id.trim().is_empty() {
        return Err("ELEVENLABS_VOICE_ID is empty".to_string());
    }

    if text.trim().is_empty() {
        return Err("Text is empty".to_string());
    }

    let model_id = env_or_default("ELEVENLABS_MODEL_ID", "eleven_multilingual_v2");

    let stability = env_parse_or_default("ELEVENLABS_STABILITY", 0.5_f64);

    let similarity_boost = env_parse_or_default("ELEVENLABS_SIMILARITY_BOOST", 0.75_f64);

    let style = env_parse_or_default("ELEVENLABS_STYLE", 0.0_f64);

    let use_speaker_boost = env_bool_or_default("ELEVENLABS_USE_SPEAKER_BOOST", true);

    let url = format!("https://api.elevenlabs.io/v1/text-to-speech/{}", voice_id);

    let body = serde_json::json!({

        "text": text,

        "model_id": model_id,

        "voice_settings": {

            "stability": stability,

            "similarity_boost": similarity_boost,

            "style": style,

            "use_speaker_boost": use_speaker_boost

        }

    });

    #[cfg(debug_assertions)]
    {
        println!(
            "[SUDA] ElevenLabs TTS request voice_id={} model_id={}",
            voice_id, model_id
        );
    }

    let client = reqwest::Client::new();

    let response = client
        .post(&url)
        .header("xi-api-key", api_key)
        .header("Content-Type", "application/json")
        .header("Accept", "audio/mpeg")
        .json(&body)
        .send()
        .await
        .map_err(|error| format!("ElevenLabs request failed: {error}"))?;

    if !response.status().is_success() {
        let status = response.status();

        let body = response
            .text()
            .await
            .unwrap_or_else(|_| "unknown error".to_string());

        #[cfg(debug_assertions)]
        log_api_error(status, &body, &voice_id, &model_id);

        return Err(format_api_error(status, &body));
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|error| format!("Failed to read ElevenLabs audio: {error}"))?;

    #[cfg(debug_assertions)]
    {
        println!(
            "[SUDA] ElevenLabs API success voice_id={} model_id={} bytes={}",
            voice_id,
            model_id,
            bytes.len()
        );
    }

    Ok(TtsResponse {
        audio_base64: STANDARD.encode(bytes),

        voice_id,

        model_id,
    })
}

#[cfg(test)]

mod tests {

    use super::*;

    #[test]

    fn parses_quota_exceeded_error() {
        let body =
            r#"{"detail":{"status":"quota_exceeded","message":"You have 0 credits remaining"}}"#;

        let parsed = parse_api_error(body);

        assert_eq!(parsed.detail_status.as_deref(), Some("quota_exceeded"));

        assert!(parsed.message.contains("0 credits"));
    }

    #[test]

    fn formats_error_with_detail_status() {
        let body = r#"{"detail":{"status":"invalid_api_key","message":"Invalid API key"}}"#;

        let message = format_api_error(reqwest::StatusCode::UNAUTHORIZED, body);

        assert!(message.contains("401"));

        assert!(message.contains("invalid_api_key"));

        assert!(message.contains("Invalid API key"));
    }
}
