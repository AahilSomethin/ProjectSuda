/// Re-read .env from known locations so manual retry picks up key changes without restart.
pub fn reload_integration_env() {
    if dotenvy::dotenv().is_ok() {
        return;
    }
    if dotenvy::from_path("../.env").is_ok() {
        return;
    }
    let _ = dotenvy::from_path(concat!(env!("CARGO_MANIFEST_DIR"), "/../.env"));
}

#[tauri::command]
pub fn reload_integration_env_command() {
    reload_integration_env();
}
