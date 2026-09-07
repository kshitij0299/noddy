# Contract 4 — Brand & Versioning (binding, Phase 1)

Status: PROPOSED — requires user approval before any product code.

## 1. Naming map

### Safe to rename (user-facing copy/metadata only)

| Location | Glyphr value | Noddy value |
|----------|--------------|-------------|
| `src/index.html` title | `Glyphr Studio v2` | `Noddy` |
| favicon / PWA icons | `logo-icon-color.*` | `noddy-icon.svg` (+ `.ico` regenerated from it) |
| `src/manifest.json` name | `Glyphr Studio v2` | `Noddy` |
| manifest theme_color | `#29b7ff` | static hex sampled from `--primary` at implementation time, verified against the Contract 1 token value (no independent color choice) |
| open-project hero | Glyphr wordmark + copy | `noddy-logo-big.svg` + Noddy copy + version badge |
| about/help/overview copy | Glyphr Studio refs | Noddy refs; help articles keep pointing at existing glyphrstudio.com URLs (see §4) |
| `package.json` description/homepage/bugs/repository | glyphr-studio | Noddy fork values (repo URL updated after fork remote decision; description `Noddy — a friendly font editor, forked from Glyphr Studio 2`) |
| README headers | Glyphr Studio v2 | Noddy (+ fork attribution line, §5) |
| save filename template | `<name> - Glyphr Studio Project[ - date].gs2` | `<name> - Noddy Project[ - date].gs2` (extension frozen) |
| contact email | `mail@glyphrstudio.com` | TBD by user — placeholder stays until supplied (never invent) |

### FROZEN (never rename for branding — compat/identity)

`GlyphrStudioProject`, `GlyphrStudioApp`, `getGlyphrStudioApp`, `window._GlyphrStudioApp`, `localStorage['GlyphrStudio']`, `settings.project.latestVersion/initialVersion` keys, `.gs2`/`.txt` extensions, `projectsettings.versionnum`, SemVer gate functions, class/file names, test/sample paths, error codes (FR*/FF*/SVG*/PF*).

## 2. Version source of truth (decision)

- **Single source: `src/app/app_config.json:version` at runtime.** `package.json:version` must equal it — enforced by a CI check added in Phase 2 (fixes current 2.10.3 vs 2.10 drift). `app.versionName` derivation (`Version {major.minor}`) unchanged. `versionDate` = release timestamp; `devMode` flow unchanged.
- **First Noddy version: `2.11.0-noddy.0`.** Rationale (binding constraint): the project-open gate rejects files with `latestVersion > app.version`. Existing Glyphr files carry up to `2.10.3`; any Noddy version below that (e.g. `0.1.0`, `1.0.0`) would make Noddy refuse to open real user projects. `2.11.0-noddy.0` keeps the numeric line monotonic while the `-noddy.0` prerelease tag marks independence. Accepted nuance: the comparator strips prerelease tags, so `2.11.0-noddy.0` and a future `2.11.0` final compare equal and open each other's files — acceptable. Future Noddy releases continue semver from here (`2.11.0`, `2.12.0`, `3.0.0`…).

## 3. `.gs2` open/save behavior (binding)

- **Open:** reader unchanged — accepts v1 (`≥1.13.2` with existing migrations incl. kern `*=-1`) and all v2.x including Glyphr-saved files. No new rejection modes. Samples with old `latestVersion` keep opening.
- **Save:** byte-shape unchanged (`{settings,glyphs,ligatures,components,kerning}`, per-class `save()`, `formatSaveFile` pretty/min, `saveLivePreviews` flag honored). Only `settings.project.latestVersion` is stamped with the Noddy version. Extension stays `.gs2`.
- **Deferred (NOT in foundation):** fixing the constructor's `initialVersion` overwrite (in `src/project_data/`, protected) is filed as follow-up work requiring the §3 gate (domain rationale + migration tests + approval) — Phase 2 must NOT touch it.
- **Migrations:** existing `migrate__*` functions frozen. Any future Noddy migration is additive-only `migrate__noddy_*()` + proposal + tests + approval. None in Phase 2.

## 4. External links & telemetry (decision)

No URLs invented. Until the user supplies Noddy site/docs/repo addresses: help/about/tutorial links keep their current glyphrstudio.com targets (they work), telemetry ID unchanged, contact email unchanged. Swaps happen in one later milestone when real addresses exist — tracked in risk register (R-eye: stale brand links interim).

## 5. Attribution (binding)

Keep verbatim: GPL-3.0 license text/file, `Copyright 2010-2026 Matthew LaGrandeur`, third-party notices, and the about-page License tab content. ADD one fork line in about + README: `Noddy is an independent fork of Glyphr Studio 2 (GPL-3.0-or-later) by Matt LaGrandeur and contributors.` Upstream release-links stay (history), Noddy release links added when a Noddy remote exists.
