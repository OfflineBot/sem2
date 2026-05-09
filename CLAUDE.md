# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository is

A static site (`OfflineBot/sem2`) that displays study materials for the user's
DHBW semesters. Materials live as PDFs under `zettel/<course>/<category>/*.pdf`.
Hosted both on GitHub Pages and on a custom domain (`sites.offlinebot.xyz/sem2`).

The path `~/Coding/go/sem2` is incidental — there is no Go code, build system, or tests.

## Architecture

Single-page app (`index.html` + `assets/app.js` + `assets/style.css`).
Listing of courses is driven by `manifest.json`, which is regenerated on every
push by `.github/workflows/manifest.yml` (Python script that walks `zettel/`).

Workflow:

> add new course folders or PDFs under `zettel/`, commit, push — manifest auto-rebuilds, no HTML/JS edits required.

UI flow in `app.js`:

1. `renderIndex()` reads `manifest.json`, groups courses by semester (via
   `CONFIG.courseSemester`, default = `CONFIG.defaultSemester`), and renders
   one `<details>` per semester. Newest semester opens by default; open/closed
   state persists in localStorage (`sem2.semesterOpen`).
2. Each course is a card. Click → `openCourseModal()` shows a modal that
   groups the course's files by category and renders three actions per file:
   **Ansehen** (opens viewer overlay), **Download** (anchor with `download`),
   **Prompt kopieren** (substitutes `{PDF_URL}` and `{DISPLAY_NAME}` into the
   stored prompt template and copies to clipboard).
3. **Viewer overlay**: `openViewer()` calls `history.pushState({kind:VIEWER_STATE})`
   so the browser back button (or `popstate`) closes the viewer instead of
   leaving the site. Escape and the close-X also close it.
4. **Prompt editor modal**: textarea overlays a `<pre>` highlight layer; on
   every input event the highlight layer re-renders, escaping HTML and wrapping
   `{PDF_URL}` / `{DISPLAY_NAME}` in coloured `<span class="ph">` elements.
   Stored in localStorage as `sem2.customPrompt`.
5. **Theme switcher**: a `<select>` in the header sets `data-theme` on
   `<html>`. Two themes live in `style.css`: `mocha` (Catppuccin Mocha,
   default) and `gruvbox`. Persisted as `sem2.theme`.

`CONFIG` (top of `app.js`) holds `tabOrder`, `displayNames` (slug → label
override), `courseSemester` (slug → semester number), `defaultSemester`,
`semesterTitles`. Default tab order: `lernzettel, openbook, uebungsaufgaben, klausur`.

`.nojekyll` is present so GitHub Pages doesn't filter the `assets/` directory.

## Editing notes

- Course directory names are ASCII-only on disk (umlauts caused 404s on the
  custom-domain origin behind Cloudflare). `übungsaufgaben` lives as
  `uebungsaufgaben`; the umlaut is restored for display via
  `CONFIG.displayNames` in `assets/app.js`. If more umlaut-renames become
  necessary, add the slug → display mapping there. Folder names with `_` are
  auto-converted for display; don't rename for cosmetics.
- New semester: add an entry to `CONFIG.courseSemester` (slug → number) and
  optionally to `CONFIG.semesterTitles` (number → label).
- PDFs are served as static files at their relative path
  (`./zettel/<course>/<tab>/<file>.pdf`) — both viewer (`<iframe>`) and
  download link use that URL. The viewer's PDF URL passed to `copyPrompt`
  uses the absolute URL via `new URL(rel, location.href)`.
- Bump the `?v=N` cache-buster on `style.css` / `app.js` in `index.html` when
  changing them, so deployed clients pick up the new asset.
- Use `Read` with the `pages` parameter to inspect specific PDF page ranges;
  reading a large PDF without `pages` will fail.
