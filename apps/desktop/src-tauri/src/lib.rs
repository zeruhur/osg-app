// The shell is thin: the game (engine, storage schema, UI) lives in TypeScript. Rust provides the
// window and the plugins: SQLite for campaign files, dialogs, and opening links.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .run(tauri::generate_context!())
        .expect("error while running the OSG Solo application");
}
