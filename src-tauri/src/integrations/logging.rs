use std::collections::HashSet;
use std::sync::Mutex;

static LOGGED_ONCE: Mutex<Option<HashSet<String>>> = Mutex::new(None);

fn logged_keys() -> std::sync::MutexGuard<'static, Option<HashSet<String>>> {
    let mut guard = LOGGED_ONCE.lock().unwrap_or_else(|e| e.into_inner());
    if guard.is_none() {
        *guard = Some(HashSet::new());
    }
    guard
}

pub fn log_once(key: &str, message: impl AsRef<str>) {
    let mut guard = logged_keys();
    let set = guard.as_mut().expect("initialized");
    if set.insert(key.to_string()) {
        println!("[SUDA] {}", message.as_ref());
    }
}

pub fn reset_log_once(key: &str) {
    let mut guard = logged_keys();
    if let Some(set) = guard.as_mut() {
        set.remove(key);
    }
}

pub fn log_integration(integration: &str, message: impl AsRef<str>) {
    println!("[SUDA][{integration}] {}", message.as_ref());
}

pub fn log_state_change(integration: &str, previous: &str, next: &str, message: impl AsRef<str>) {
    if previous != next {
        log_integration(integration, message);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn log_once_deduplicates() {
        reset_log_once("test-key");
        log_once("test-key", "first");
        log_once("test-key", "second");
        reset_log_once("test-key");
    }
}
