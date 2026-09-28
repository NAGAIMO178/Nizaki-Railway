# Project Rules & Guidelines

## Semantic Versioning (SemVer) Rules
Whenever code changes are made to the project, update the version string in `src/components/SettingsTab.tsx` (and `package.json` if applicable) according to SemVer 2.0.0 rules:

- **X (Major)**: Breaking architectural changes or incompatible API/data migrations (Resets Y and Z to 0, e.g., `3.5.0` -> `4.0.0`).
- **Y (Minor)**: New features added in a backwards-compatible manner (Resets Z to 0, e.g., `3.5.0` -> `3.6.0`).
- **Z (Patch)**: Backwards-compatible bug fixes, minor tweaks, text/design corrections (e.g., `3.5.0` -> `3.5.1`).
- Never skip numbers. Always increment by 1.
