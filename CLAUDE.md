# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository is

A personal archive of 2nd-semester university study materials (German curriculum). It is **not a software project** despite living under `~/Coding/go/sem2` — there is no Go code, no build system, no tests, and no package manifest. The path is incidental.

Contents are PDFs organized by course under `zettel/`:

- `analysis_2/` — Analysis II
- `grundlagen_informatik_betriebssysteme/` — CS fundamentals / operating systems (the only course with `klausur/` past exams, `übungsaufgaben/` exercises, and an `openbook/` reference)
- `numerische_methoden/` — Numerical methods
- `optimierungsverfahren/` — Optimization methods

Each course has a `lernzettel/zettel.pdf` (study notes summary). Courses with exercises/exams use `übungsaufgaben/exerciseN.pdf` and `klausur/examN.pdf`.

`index.html` at the repo root is an empty stub (title "2. Semester", empty body) — not a live site.

## Working here

- Use `Read` with the `pages` parameter to inspect specific PDF page ranges; reading a large PDF without `pages` will fail.
- There is nothing to build, lint, or test. Don't suggest CI, package files, or scaffolding unless the user explicitly pivots this directory toward a code project.
- Course directory names are German — preserve the existing names (including the `ü` in `übungsaufgaben`) when referencing or creating sibling files.
