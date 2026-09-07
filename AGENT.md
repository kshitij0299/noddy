# AGENT.md — Noddy

> Agent context for AI coding assistants working in this repo. Read this before making changes.

## 1. Project Identity

- **Noddy** is a web-based font editor for beginners/hobbyists.
- **Fork of [Glyphr Studio v2](https://www.glyphrstudio.com)** by Matt LaGrandeur (GPL-3.0). Original repo: `glyphr-studio/Glyphr-Studio-2`.
- This fork lives at `kshitij0299/Glyphr-Studio-2` (branch `feat/ui-overhaul` is active development).
- Noddy is **not** Glyphr Studio v2.x — it is a distinct product with its own roadmap, branding, and version line. Do not present it as Glyphr Studio 2.11/3.0/etc.

## 2. Versioning — Critical Rule

### 2.1 Why Noddy resets version

Per **SemVer 2.0.0** (`https://semver.org`): `MAJOR.MINOR.PATCH` describes the public API of **this** package, not its upstream. `0.y.z` is initial development; `1.0.0` is first stable.

Fork best practices (used by Brave/Chromium, io.js/Node, etc.):

- A rebranded fork is a **new product** → reset version history.
- Continuing upstream numbers (`2.10.3` → `2.10.4` / `2.11.0`) falsely implies linear succession and breaks SemVer provenance.
- Valid alternatives for forks: reset to `0.1.0`/`1.0.0`, or keep lineage via suffix (`2.10.3-noddy.1`) or build metadata (`1.0.0+upstream.2.10.3`). For Noddy we chose **reset**.

### 2.2 Current scheme

| Field | Value |
|-------|-------|
| `package.json` `name` | `noddy` (was `glyphr-studio-2`) |
| `package.json` `version` | `0.1.0` — valid SemVer (was invalid `2.10`) |
| `src/app/app_config.json` `version` | `0.1.0` — must stay in sync with `package.json` |
| `upstreamVersion` / `upstreamRef` in `app_config.json` | `2.10.3` / `glyphr-studio/Glyphr-Studio-2@ecd1614` — human-readable provenance only; ignored by app code |
| `versionDate` | epoch ms set by `scripts.js build` (noon of ship day) or `0` in dev |
| `devMode` | `true` in dev, `false` in prod build |
| Git tags | `v0.1.0`, `v0.1.1`, …, `v1.0.0` for Noddy releases. Upstream tags (`v2.10.3` etc.) remain in history but are not Noddy releases. Prefer `v*` (not `noddy-v*`) since ranges no longer collide (`0.x/1.x` vs upstream `2.x`). |
| First stable | `1.0.0` will be first stable Noddy. Until then `0.y.z` signals breaking changes allowed. |

**Do not** bump to `2.11.0` or `3.0.0` to "stay ahead" of upstream — use `0.1.x`/`0.2.0`/`1.0.0`.

### 2.3 Where version lives and how to bump

1. Update **both** files together:
   - `package.json` `version`
   - `src/app/app_config.json` `version` (and `upstreamVersion` if fork point advances)
2. Keep them identical (three-part SemVer `x.y.z`, optionally `-alpha.1`/`-rc.1`).
3. `scripts.js` (`dev`/`build`/`stage`) syncs `app_config.json` `versionDate`/`devMode` at build time; it does not change `version`.
4. After bumping, run `npm run build` to refresh `dist/` and verify `src/formats_io/validate_file_input.js` compatibility (see 2.4).
5. Tag: `git tag v0.1.1 && git push origin v0.1.1` — `.github/workflows/deploy-app.yml` deploys on `v*.*.*`.

### 2.4 File-format compatibility (fork-aware)

Project files store `settings.project.latestVersion` / `initialVersion` = `app.version` at save time.

Old check `isSemVerLessThan(current, fileVersion)` would treat a Glyphr `2.10.3` file as "future" when Noddy is `0.1.0` (`0 < 2`). Patched in `src/formats_io/validate_file_input.js:218-249`:

- `isLegacyGlyphrV1 = !!projectData.projectsettings` — Glyphr v1 lineage.
- `isLegacyGlyphrV2 = projectData.settings?.project?.latestVersion && version.major===2 && version <= 2.10.3` — Glyphr v2 history (never future for Noddy).
- `isUpstreamHistory = isLegacyGlyphrV1 || isLegacyGlyphrV2` — skip "future version" error.
- Second guard `version < 1.13.2` now only applies to `isLegacyGlyphrV1`.

When adding new Noddy features that break file format, bump `MINOR`/`MAJOR` and handle migration elsewhere; do not rely on blocking upstream history.

## 3. Stack & Commands

- **Build**: Vite 7, `src/` → `dist/`, base `/app/` (prod) or `/staged/` (stage). `src/vite.config.js` defines `outDir: ../dist/`.
- **Scripts** (`package.json`):
  - `npm run dev` → `scripts.js dev` (sets `devMode: true`, `versionDate: 0`) + `vite serve ./src/`
  - `npm run build` → `scripts.js build` (sets `devMode: false`, `versionDate: shipDate`) + `vite build ./src/`
  - `npm run stage` → stage build with `versionDate: 'STAGED BUILD'`
  - `npm run test` / `coverage` → Vitest (watch)
  - `npm run lint` / `fix` → ESLint
- **Tests**: Vitest 4, `test/*.test.js` + `**/*.test.js` next to source, `vitest.config.js`, `vitest-setup.js`
- **No UI framework** — vanilla JS + Web Components (e.g., `src/controls/*`, `src/edit_canvas/*`). Only external UI dep is `font-flux-js` (OTF import/export) and `bezier-boolean`.

## 4. Codebase Layout

```
src/
  app/               # GlyphrStudioApp (src/app/app.js:26), open_project, main
  project_data/      # GlyphrStudioProject hierarchy: Project → Glyph → Path → PathPoint
  project_editor/    # UI controller for editing (ProjectEditor)
  common/            # math, color, dom helpers
  controls/          # Web Components (fancy-button, font-preview, etc.)
  edit_canvas/       # canvas editing
  display_canvas/
  formats_io/        # otf, svg_font import/export, validate_file_input
  lib/               # vendored libs (exclude from refactoring)
  samples/           # oblegg.gs2, bool tests
  index.html         # app shell + landing card
  vite.config.js
  manifest.json      # PWA manifest (name: Noddy)
```

Separation rule: **Project Data** (pure data/math) ↔ **App** (UI) are strictly separated (see `src/README.md`).

## 5. Conventions for Agents

- Keep `package.json` and `src/app/app_config.json` versions synchronized.
- Quote top-level `version` wherever displayed: `src/app/app.js:52-55` (`app.version`, `app.versionName = Noddy ${major}.${minor}`), `src/app/open_project.js`, `src/pages/about.js`.
- Do not reintroduce `2.10` / `2.x` as Noddy version. If syncing from upstream, update `upstreamVersion`/`upstreamRef` metadata, not `version`.
- When reviewing PRs that touch version logic, check `validate_file_input.js` fork-aware guards.
- For UI overhaul work (`feat/ui-overhaul`), treat `0.1.0` as dev baseline; propose `0.1.1`, `0.2.0`, etc. for incremental breaking UI changes, `1.0.0` for parity/stable.

## 6. License & Attribution

GPL-3.0-or-later. Original copyright 2010–2026 Matthew LaGrandeur. Noddy changes retain GPL-3.0. Attribution to Glyphr Studio must remain in `README.md` and `LICENSE-gpl-3.0.txt`.

## 7. Quick Verification

```bash
npm run lint
npm run build   # check dist/ output, versionDate set
npm run test -- --run   # vitest single run (not watch)
```

If `package.json` version is not `x.y.z` SemVer, `npm` and `parseSemVer` (`src/formats_io/validate_file_input.js:312`) will fail.
