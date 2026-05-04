# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository is

A GitHub Pages site (`OfflineBot/sem2` → `offlinebot.github.io/sem2`) that displays study materials for the user's 2nd university semester. Materials live as PDFs under `zettel/<course>/<category>/*.pdf`.

The path `~/Coding/go/sem2` is incidental — there is no Go code, build system, or tests.

## Architecture

The site is **fully static** but lists folders/files dynamically via the **GitHub Contents API** (`api.github.com/repos/OfflineBot/sem2/contents/...`). The user's workflow is:

> add new course folders or PDFs under `zettel/`, commit, push — no HTML/JS/JSON edits required.

Two pages share `assets/app.js` + `assets/style.css`:

- `index.html` → calls `renderIndex()`, lists every dir in `zettel/` as a card. Card label is the folder name converted to Pascal-Case-with-spaces (`grundlagen_informatik_betriebssysteme` → `Grundlagen Informatik Betriebssysteme`). Card links to `course.html?course=<folder>`.
- `course.html` → calls `renderCourse()`, reads `?course=` param, fetches subdirs of that course, builds a tab bar. Tab order is controlled by `CONFIG.tabOrder` in `app.js` (default: `lernzettel, openbook, übungsaufgaben, klausur` — known names first, unknown ones alphabetical). Default tab is `lernzettel` (or first available). Each tab loads its PDFs via `loadTab()`, shows a `<select>` for picking a file, plus **Anschauen** (embeds in `<iframe>`) and **Runterladen** (anchor with `download` attribute).

`assets/app.js` top-level `CONFIG` object holds `owner`, `repo`, `branch`, `zettelDir`, `defaultTab`, `tabOrder`. `owner`/`repo` are auto-detected from `*.github.io/<repo>/` URLs; set them explicitly if hosting on a custom domain or testing locally (the GitHub API call fails without them).

`.nojekyll` is present so GitHub Pages doesn't filter the `assets/` directory.

## Editing notes

- Course directory names are German — preserve `ü` in `übungsaufgaben` etc. Folder names with `_` are auto-converted for display; don't rename for cosmetics.
- The GitHub Contents API has a 60 req/hour unauthenticated rate limit per IP. Acceptable for a personal page; if hit, the site shows the error string.
- PDFs are served as static files at their relative path (`./zettel/<course>/<tab>/<file>.pdf`) — both viewer (`<iframe>`) and download link use that URL.
- Use `Read` with the `pages` parameter to inspect specific PDF page ranges; reading a large PDF without `pages` will fail.
