//! The desktop app: the web app's build in a Tauri window. The provider's
//! API key is kept in the operating system's credential store rather than in
//! the webview's storage, where any script running in the page could read it
//! (ADR 0014).

use keyring::Entry;

/// The app's identifier, so that the entry is recognisable in the
/// credential store's own viewer.
const SERVICE: &str = "io.github.productpope.diagram-4-llm";
/// One provider is configured at a time, so one entry holds its key.
const ACCOUNT: &str = "provider-api-key";

fn entry() -> Result<Entry, String> {
    // When the platform's store could not be opened, `new` only says that
    // there is no store; the reason is kept by `store_status`.
    Entry::new(SERVICE, ACCOUNT).map_err(|error| match Entry::store_status() {
        Err(reason) => reason.to_string(),
        Ok(()) => error.to_string(),
    })
}

/// The saved API key, or `None` when none has been saved.
#[tauri::command]
async fn load_api_key() -> Result<Option<String>, String> {
    run_blocking(|| match entry()?.get_password() {
        Ok(key) => Ok(Some(key)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(error.to_string()),
    })
    .await
}

/// Saves the API key. An empty key, which local model servers accept,
/// removes the saved one instead.
#[tauri::command]
async fn save_api_key(key: String) -> Result<(), String> {
    run_blocking(move || {
        let entry = entry()?;
        let saved = if key.is_empty() {
            match entry.delete_credential() {
                Err(keyring::Error::NoEntry) => Ok(()),
                other => other,
            }
        } else {
            entry.set_password(&key)
        };
        saved.map_err(|error| error.to_string())
    })
    .await
}

/// Credential stores can block, for example while the user unlocks them, so
/// they are called on a thread for blocking work.
async fn run_blocking<T: Send + 'static>(
    task: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(task)
        .await
        .map_err(|error| error.to_string())?
}

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![load_api_key, save_api_key])
        .run(tauri::generate_context!())
        .expect("the desktop app could not start");
}
