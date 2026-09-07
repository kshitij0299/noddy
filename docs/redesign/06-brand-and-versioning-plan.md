# 06 — Brand and Versioning Plan Inputs (Phase 0 — NOT the Phase 1 contract)

> Audit findings + safe-migration outline. Binding naming/versioning contract needs approval in Phase 1 before any rename.

## Glyphr footprint (stable baseline, no Noddy hits — clean slate)

- `src/`: ~60+ files, 100+ matches (comments, strings, IDs). Key: `pages/about.js`, `help.js`, `overview.js`, `settings_*.js`, `app/app.js`, `app/open_project.js`, `app/main.js`, `formats_io/validate_file_input.js`, `project_editor/import_project.js`, `project_data/glyphr_studio_project.js`, `index.html`, `manifest.json`, `common/graphics.js`.
- `test/`: `roundtrip.test.js` (~20: comments + `roundTripThroughGlyphrStudio`, `importGlyphrProjectFromText`), `composite_export.test.js`.
- `README.md`, `package.json` (description/homepage/bugs/repository), `scripts.js` (build log `Glyphr Studio: ${version}`).

## Icons / logos (current)

`src/common/graphics/`: `logo-icon-color.ico` (favicon, `index.html:23`), `logo-icon-color.svg` (PWA, `manifest.json:4`), `logo-icon.svg`, `logo-icon-two-color.svg`, `logo-icon-color.png`, wordmarks horizontal/small/vertical (`about.js:9`, `open_project.js:2` as `?raw`), `fam_ffjs/un/fd.png`, `donate-*.png`, `ascii-wordmark-vertical.txt`. UI icons in `src/common/graphics.js` (`page_*/panel_*/command_*`) are generic. Landing `index.html:162-170` has empty svg stub.

Noddy vault (`assets/noddy-graphics/`, 17 files): `noddy-logo-big.svg`, `noddy-icon.svg`, `noddy-icon-bg.svg` (keep), `logo-icon-two-color.svg` (only true vector — retrace reference), legacy Glyphr wordmarks (archive).

## Metadata / copy touchpoints

- `package.json`: `name:glyphr-studio-2`, `version:2.10`, description, author Matt LaGrandeur, homepage/repo.
- `src/app/app_config.json`: `version:2.10.3`, `versionDate:1783882800000`, `devMode:false` — DRIFT vs package.json (needs CI check).
- `src/index.html`: `<title>Glyphr Studio v2</title>`, icon/manifest links, `window._GlyphrStudioApp`, `mail@glyphrstudio.com` error text, telemetry `G-L8S3D8WCC9`.
- `src/manifest.json`: `name: Glyphr Studio v2`, `start_url: glyphrstudio.com/app/`, `theme_color:#29b7ff`.
- `pages/about.js`: Version/Contact/Family/License tabs, `app.versionName/version/versionDate`, project name/id/initialVersion, blog/releases/help links, GPL text, `Copyright 2010-2026 Matthew LaGrandeur`.
- `pages/help.js`: Tutorial + ~20 glyphrstudio.com/help links + `.gs2` save copy.
- `pages/overview.js:80`: `Welcome to Glyphr Studio!` + links.
- `app/open_project.js:51-58`: version badge + `recently updated!` (7-day) + GPL blurb + glyphrstudio.com.
- `pages/settings_*`: `.gs2` + localStorage copy. Contacts: `mail@glyphrstudio.com` (`app.js:emailLink`, index, global_actions).

## Version fields

- Runtime source of truth: `app_config.json` → `app.version/versionDate/versionName=Version {major.minor}` (`app.js:51-54`). `package.json` build/test only (not imported at runtime).
- Project: `settings.project.latestVersion/initialVersion` (app-stamped on construct/import), `settings.font.version:1.0` (font meta for OTF head — NOT app version).
- Gates: `tryToGetProjectVersion/parseSemVer/isSemVerLessThan/makeSemVerString`; reject future `[PF4]`, reject <1.13.2 `[PF5]`; migrations v1→v2 + v2.0→v2.5 (kern flip); `save()` shape `{settings,glyphs,ligatures,components,kerning}`; `makeFileName` → `"<name> - Glyphr Studio Project[ - date].gs2"`; autosaves in `localStorage['GlyphrStudio']`; samples carry old versions.

## Safe migration outline (for Phase 1 contract)

- **Safe to rename (user-facing):** index title/favicon/manifest name+icons, open-project hero + badge, about/help/overview copy + glyphrstudio URLs → noddy/*, `emailLink` address/subject, READMEs, `package.json` description/homepage/bugs/repository, manifest start_url/theme, graphics swap, telemetry ID.
- **Do NOT rename (schema/internal):** `GlyphrStudioProject/GlyphrStudioApp/getGlyphrStudioApp/window._GlyphrStudioApp/localStorage['GlyphrStudio']`, `settings.project.latestVersion/initialVersion` keys, `.gs2/.txt` suffixes + `projectsettings.versionnum`, SemVer gate logic, test/sample font paths, class/file names (no codemod for branding).
- **Semver source of truth:** single-source `app_config.json:version` at runtime + CI check `app_config.version === package.json:version`; Noddy starts `0.1.0-noddy.1` or `2.10.4-noddy.0` + own versionDate; keep devMode flow. Decision needed in Phase 1.
- **`.gs2` compat rule:** reader stays backward-compatible (v1.13.2+ + all v2.x + Noddy); never bump major to block Glyphr files; stamp `latestVersion=noddySemver` on save but accept glyphr versions via existing gate; new migrations as additive `migrate__noddy_*()`; preserve `initialVersion` (fix constructor overwrite); leave `settings.font.version` untouched. All of this requires a Phase 1 proposal + migration tests + explicit approval per AGENTS.md §3 — not pre-approved.
- **Attribution:** keep GPL/copyright/third-party/upstream notices; add fork attribution line; document in contract.
