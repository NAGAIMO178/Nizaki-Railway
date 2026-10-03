# Project Rules & Guidelines

## Semantic Versioning (SemVer) Rules
Whenever code changes are made to the project, update the `version` in `package.json` (the single source of truth) according to SemVer 2.0.0 rules. The version shown in the app (settings tab, My Page footer, admin console, system logs) is injected from it at build time (`__APP_VERSION__`), so no other file needs editing. Also update `release-notes.json` (the text shown in the in-app update dialog).

- **X (Major)**: Breaking architectural changes or incompatible API/data migrations (Resets Y and Z to 0, e.g., `3.5.0` -> `4.0.0`).
- **Y (Minor)**: New features added in a backwards-compatible manner (Resets Z to 0, e.g., `3.5.0` -> `3.6.0`).
- **Z (Patch)**: Backwards-compatible bug fixes, minor tweaks, text/design corrections (e.g., `3.5.0` -> `3.5.1`).
- Never skip numbers. Always increment by 1.
