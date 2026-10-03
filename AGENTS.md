# Project Rules & Guidelines

## Semantic Versioning (SemVer) Rules
Whenever code changes are made to the project, update the `version` in `package.json` (the single source of truth) according to SemVer 2.0.0 rules. The version shown in the app (settings tab, My Page footer, admin console, system logs) is injected from it at build time (`__APP_VERSION__`), so no other file needs editing. Also update `release-notes.json` (the text shown in the in-app update dialog).

- **X (Major)**: Breaking architectural changes or incompatible API/data migrations (Resets Y and Z to 0, e.g., `3.5.0` -> `4.0.0`).
- **Y (Minor)**: New features added in a backwards-compatible manner (Resets Z to 0, e.g., `3.5.0` -> `3.6.0`).
- **Z (Patch)**: Backwards-compatible bug fixes, minor tweaks, text/design corrections (e.g., `3.5.0` -> `3.5.1`).
- Never skip numbers. Always increment by 1.

## Release Notes Wording (`release-notes.json`)
The `notes` array is shown as-is in the in-app update dialog, so keep it short and readable for end users.

- Features or fixes users can notice: one line each (e.g., `予約がLINEの「予約確認」で見られるように`).
- Only light changes (internal cleanup, tiny display fixes, docs): write just `軽微な修正` as the single note.
- A mix of both: list the notable items, then finish with `ほか軽微な修正`.
- In every release PR and report, tell the project owner the exact text that will appear in the dialog.
- Changes that don't touch the app itself (e.g., editing only `AGENTS.md`) need no version bump and no release notes.
