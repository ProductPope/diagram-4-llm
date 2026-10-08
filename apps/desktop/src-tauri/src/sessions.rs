//! Claude Code session transcripts in `~/.claude/projects`, listed and read
//! for the session page, so that the user need not pick files (ADR 0016).
//! The same rules as the MCP server's `listSessionFiles` and
//! `readSessionFile` apply.

use std::fs;
use std::io::ErrorKind;
use std::path::Path;
use std::time::UNIX_EPOCH;

use serde::Serialize;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionFile {
    /// Relative to the projects folder: `<project>/<session>.jsonl`.
    pub path: String,
    pub project: String,
    /// Milliseconds since the Unix epoch.
    pub modified: u64,
    pub bytes: u64,
}

#[derive(Debug, Serialize)]
pub struct SessionList {
    /// Most recently changed first.
    pub sessions: Vec<SessionFile>,
    /// Entries that could not be read; the rest are listed.
    pub problems: Vec<String>,
}

/// The transcripts in every project folder. A missing folder means Claude
/// Code has not been used, which is not an error.
pub fn list(dir: &Path) -> Result<SessionList, String> {
    let projects = match fs::read_dir(dir) {
        Ok(projects) => projects,
        Err(error) if error.kind() == ErrorKind::NotFound => {
            return Ok(SessionList {
                sessions: Vec::new(),
                problems: Vec::new(),
            })
        }
        Err(error) => return Err(format!("{}: {error}", dir.display())),
    };
    let mut sessions = Vec::new();
    let mut problems = Vec::new();
    for project in projects {
        let project = match project {
            Ok(project) => project,
            Err(error) => {
                problems.push(format!("{}: {error}", dir.display()));
                continue;
            }
        };
        // Other entries of the folder, if any, are not project folders.
        let Ok(files) = fs::read_dir(project.path()) else {
            continue;
        };
        let project_name = project.file_name().to_string_lossy().into_owned();
        for file in files {
            match file.and_then(|file| Ok((file.file_name(), file.metadata()?))) {
                Ok((name, metadata)) => {
                    let name = name.to_string_lossy();
                    if !name.ends_with(".jsonl") || !metadata.is_file() {
                        continue;
                    }
                    let modified = metadata
                        .modified()
                        .ok()
                        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
                        .map_or(0, |since| {
                            u64::try_from(since.as_millis()).unwrap_or(u64::MAX)
                        });
                    sessions.push(SessionFile {
                        path: format!("{project_name}/{name}"),
                        project: project_name.clone(),
                        modified,
                        bytes: metadata.len(),
                    });
                }
                Err(error) => problems.push(format!("{project_name}: {error}")),
            }
        }
    }
    sessions.sort_by(|a, b| b.modified.cmp(&a.modified).then(a.path.cmp(&b.path)));
    Ok(SessionList { sessions, problems })
}

/// Reads a transcript named by its path relative to the projects folder.
/// Paths that lead outside the folder, also through a link, are refused, so
/// that the page cannot read other files of the user.
pub fn read(dir: &Path, path: &str) -> Result<String, String> {
    if !path.ends_with(".jsonl") {
        return Err("A session transcript ends with .jsonl.".to_string());
    }
    let root = fs::canonicalize(dir).map_err(|error| error.to_string())?;
    let file = fs::canonicalize(dir.join(path)).map_err(|error| error.to_string())?;
    match file.strip_prefix(&root) {
        Ok(inside) if !inside.as_os_str().is_empty() => {
            fs::read_to_string(&file).map_err(|error| error.to_string())
        }
        _ => Err("The path is outside the Claude Code projects folder.".to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    /// A projects folder of its own for each test.
    fn projects(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "diagram-4-llm-sessions-{name}-{}",
            std::process::id()
        ));
        // Left over from an earlier run with the same process id, if any.
        if dir.exists() {
            fs::remove_dir_all(&dir).unwrap();
        }
        fs::create_dir_all(dir.join("-home-me-app")).unwrap();
        dir
    }

    #[test]
    fn lists_transcripts_in_project_folders() {
        let dir = projects("list");
        fs::write(dir.join("-home-me-app/a.jsonl"), "{}\n").unwrap();
        fs::write(dir.join("-home-me-app/notes.txt"), "not a session").unwrap();
        fs::write(dir.join("loose.jsonl"), "{}\n").unwrap();
        let listed = list(&dir).unwrap();
        let paths: Vec<_> = listed.sessions.iter().map(|s| s.path.as_str()).collect();
        assert_eq!(paths, ["-home-me-app/a.jsonl"]);
        assert_eq!(listed.sessions[0].project, "-home-me-app");
        assert_eq!(listed.sessions[0].bytes, 3);
        assert!(listed.problems.is_empty());
    }

    #[test]
    fn a_missing_folder_has_no_sessions() {
        let listed = list(Path::new("/nonexistent/diagram-4-llm/projects")).unwrap();
        assert!(listed.sessions.is_empty());
    }

    #[test]
    fn reads_a_transcript_and_refuses_paths_outside_the_folder() {
        let dir = projects("read");
        fs::write(dir.join("-home-me-app/a.jsonl"), "{}\n").unwrap();
        let outside = dir.with_extension("secret.jsonl");
        fs::write(&outside, "secret").unwrap();
        assert_eq!(read(&dir, "-home-me-app/a.jsonl").unwrap(), "{}\n");
        let traversal = format!(
            "-home-me-app/../../{}",
            outside.file_name().unwrap().to_string_lossy()
        );
        assert_eq!(
            read(&dir, &traversal).unwrap_err(),
            "The path is outside the Claude Code projects folder."
        );
        assert!(read(&dir, "-home-me-app/a.txt").is_err());
        #[cfg(unix)]
        {
            std::os::unix::fs::symlink(&outside, dir.join("-home-me-app/link.jsonl")).unwrap();
            assert_eq!(
                read(&dir, "-home-me-app/link.jsonl").unwrap_err(),
                "The path is outside the Claude Code projects folder."
            );
        }
        fs::remove_file(outside).unwrap();
    }
}
