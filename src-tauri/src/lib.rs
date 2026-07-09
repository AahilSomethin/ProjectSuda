mod briefing;
mod elevenlabs;

fn load_env() {
    // 1. cwd .env (typical: `npm run tauri dev` from project root)
    if dotenvy::dotenv().is_ok() {
        return;
    }
    // 2. project root when cwd is src-tauri
    if dotenvy::from_path("../.env").is_ok() {
        return;
    }
    // 3. compile-time path: <project-root>/.env regardless of runtime cwd
    let _ = dotenvy::from_path(concat!(env!("CARGO_MANIFEST_DIR"), "/../.env"));
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    load_env();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            briefing::linear_briefing,
            briefing::linear_briefing_configured,
            elevenlabs::elevenlabs_tts,
            elevenlabs::elevenlabs_configured,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
