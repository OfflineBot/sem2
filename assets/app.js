/* ============================================================
 * DHBW Lernzettel — Single-Page Frontend
 * ============================================================
 *
 * Reads zettel/<course>/<category>/<file>.pdf via manifest.json
 * (built by .github/workflows/manifest.yml on every push).
 *
 * Top-level state:
 *   - semester collapsibles (default: most recent open)
 *   - course click → modal listing files with [Ansehen][Download][Prompt kopieren]
 *   - viewer overlay uses history.pushState so browser-back closes it
 *   - prompt template editor with placeholder highlighting
 *   - theme switcher: catppuccin-mocha (default) | gruvbox | serenity
 */

const CONFIG = {
    // Repo coordinates — used to build the `raw.githubusercontent.com` URL
    // that goes into the copied prompt template. We deliberately *don't*
    // use the live site URL there: AI tools (Claude, ChatGPT, …) fetch
    // GitHub-raw URLs reliably because the host sets `Access-Control-
    // Allow-Origin: *` and never proxies through Cloudflare custom-domain
    // rules.
    repoOwner: "OfflineBot",
    repoName: "sem2",
    branch: "main",
    zettelDir: "zettel",
    // Tab order within a course modal (known first, unknown alphabetic at end).
    tabOrder: ["lernzettel", "openbook", "uebungsaufgaben", "klausur"],
    // Slug → display name override (Pascal-Case-default for the rest).
    displayNames: {
        uebungsaufgaben: "Übungsaufgaben",
        openbook: "Open-Book",
        klausur: "Klausuren",
        lernzettel: "Lernzettel",
        "dski-dataviz": "DSKI – Data Visualization",
        "dski-intro": "DSKI – Einführung",
        kommsysteme: "Kommunikationssysteme",
        "lineare-algebra": "Lineare Algebra",
        digitale_betriebswirtschaftslehre: "Digitale BWL (DOL)",
    },
    // Course slug → semester. Default is `defaultSemester`.
    courseSemester: {
        grundlagen_informatik_betriebssysteme: 1,
        analysis: 1,
        "dski-dataviz": 1,
        "dski-intro": 1,
        informatik: 1,
        kommsysteme: 1,
        "lineare-algebra": 1,
    },
    defaultSemester: 2,
    semesterTitles: {
        1: "1. Semester",
        2: "2. Semester",
    },
};

const DEFAULT_PROMPT = [
    "Ich habe ein Dokument aus meinem DHBW-Studium.",
    "Bitte lade und analysiere das folgende PDF vollständig:",
    "",
    "{PDF_URL}",
    "",
    "Dokumentname: {DISPLAY_NAME}",
    "",
    "Bitte gehe folgendermaßen vor:",
    "",
    "1. Lies das gesamte Dokument sorgfältig und vollständig durch.",
    "2. Erstelle eine kurze strukturierte Zusammenfassung (max. 10 Stichpunkte)",
    "   der wichtigsten Themen und Konzepte.",
    "3. Identifiziere die Kernbegriffe und ihre Definitionen.",
    "4. Warte danach auf meine Fragen — ich werde dich zu bestimmten Themen,",
    "   Aufgaben oder Konzepten aus dem Dokument befragen.",
    "",
    "Wichtig: Beziehe dich in deinen Antworten immer konkret auf die Inhalte",
    "des Dokuments. Wenn du eine Stelle zitierst, gib an, in welchem Abschnitt",
    "oder auf welcher Seite sie sich befindet.",
].join("\n");

const LS = {
    promptKey: "sem2.customPrompt",
    themeKey: "sem2.theme",
    semesterOpenKey: "sem2.semesterOpen",
};

/* ============================================================
 * Inline SVG icons (lucide-derived). Inline because we want zero
 * extra HTTP requests and zero icon-font baggage on a static site.
 * `currentColor` so each button's existing palette still drives the
 * stroke colour — Primary stays accent-tinted, Ghost stays accent2, etc.
 * ============================================================ */
const ICONS = {
    eye:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>',
    download:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
    copy:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>' +
        '<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
};

/* ============================================================
 * Helpers
 * ============================================================ */

function pascalSpaced(slug) {
    if (CONFIG.displayNames[slug]) return CONFIG.displayNames[slug];
    return slug
        .split(/[_\-]+/)
        .filter(Boolean)
        .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(" ");
}

function semesterFor(slug) {
    return CONFIG.courseSemester[slug] || CONFIG.defaultSemester;
}

function escapeHtml(s) {
    return s.replace(/[&<>"']/g, ch => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[ch]);
}

function naturalSort(a, b) {
    const ax = String(a).split(/(\d+)/).map(p => /^\d+$/.test(p) ? parseInt(p, 10) : p.toLowerCase());
    const bx = String(b).split(/(\d+)/).map(p => /^\d+$/.test(p) ? parseInt(p, 10) : p.toLowerCase());
    for (let i = 0; i < Math.min(ax.length, bx.length); i++) {
        if (ax[i] === bx[i]) continue;
        return ax[i] < bx[i] ? -1 : 1;
    }
    return ax.length - bx.length;
}

/* ============================================================
 * Theme
 * ============================================================ */

function applyTheme(name) {
    document.documentElement.setAttribute("data-theme", name);
    try { localStorage.setItem(LS.themeKey, name); } catch {}
    const sel = document.getElementById("theme-select-input");
    if (sel) sel.value = name;
}

function initTheme() {
    let stored = "mocha";
    try { stored = localStorage.getItem(LS.themeKey) || "mocha"; } catch {}
    applyTheme(stored);
    document.getElementById("theme-select-input").addEventListener("change", e => {
        applyTheme(e.target.value);
    });
}

/* ============================================================
 * Manifest (static file, with cache)
 * ============================================================ */

let _manifest = null;

async function loadManifest() {
    if (_manifest) return _manifest;
    const res = await fetch("./manifest.json", { cache: "no-cache" });
    if (!res.ok) throw new Error("manifest.json nicht gefunden (HTTP " + res.status + ")");
    _manifest = await res.json();
    return _manifest;
}

/* ============================================================
 * Semester groupings
 * ============================================================ */

function groupBySemester(courses) {
    const groups = new Map();
    for (const slug of Object.keys(courses)) {
        const sem = semesterFor(slug);
        if (!groups.has(sem)) groups.set(sem, []);
        groups.get(sem).push(slug);
    }
    for (const list of groups.values()) {
        list.sort((a, b) => pascalSpaced(a).localeCompare(pascalSpaced(b), "de"));
    }
    return [...groups.entries()].sort((a, b) => b[0] - a[0]); // newest first
}

function readSemesterOpenState() {
    try {
        const raw = localStorage.getItem(LS.semesterOpenKey);
        if (!raw) return null;
        return JSON.parse(raw);
    } catch { return null; }
}

function writeSemesterOpenState(map) {
    try { localStorage.setItem(LS.semesterOpenKey, JSON.stringify(map)); } catch {}
}

function countFiles(courseObj) {
    let n = 0;
    for (const cat of Object.keys(courseObj)) n += (courseObj[cat] || []).length;
    return n;
}

async function renderIndex() {
    const status = document.getElementById("status");
    const root = document.getElementById("semesters");
    try {
        const manifest = await loadManifest();
        const courses = manifest.courses || {};
        const groups = groupBySemester(courses);

        status.style.display = "none";
        root.innerHTML = "";

        const openState = readSemesterOpenState() || {};

        for (const [sem, slugs] of groups) {
            const det = document.createElement("details");
            det.className = "semester";
            const isOpen = openState.hasOwnProperty(sem) ? !!openState[sem] : sem === groups[0][0];
            det.open = isOpen;
            det.addEventListener("toggle", () => {
                openState[sem] = det.open;
                writeSemesterOpenState(openState);
            });

            const sum = document.createElement("summary");
            sum.className = "semester-summary";
            sum.innerHTML = `
                <span class="semester-title">${escapeHtml(CONFIG.semesterTitles[sem] || (sem + ". Semester"))}</span>
                <span class="semester-count">${slugs.length} ${slugs.length === 1 ? "Kurs" : "Kurse"}</span>
                <span class="chevron" aria-hidden="true">▾</span>
            `;
            det.appendChild(sum);

            const grid = document.createElement("div");
            grid.className = "course-grid";
            for (const slug of slugs) {
                grid.appendChild(courseCard(slug, courses[slug]));
            }
            det.appendChild(grid);

            root.appendChild(det);
        }

        document.getElementById("repo-info").textContent =
            "OfflineBot/sem2 · " + Object.keys(courses).length + " Kurse";
    } catch (err) {
        status.textContent = "Fehler: " + err.message;
        status.classList.add("error");
    }
}

function courseCard(slug, courseObj) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "course-card";
    const total = countFiles(courseObj);
    card.innerHTML = `
        <h3>${escapeHtml(pascalSpaced(slug))}</h3>
        <p class="file-count">${total} ${total === 1 ? "Datei" : "Dateien"}</p>
    `;
    card.addEventListener("click", () => openCourseModal(slug, courseObj));
    return card;
}

/* ============================================================
 * Course modal
 * ============================================================ */

function openCourseModal(slug, courseObj) {
    document.getElementById("course-modal-title").textContent = pascalSpaced(slug);
    const body = document.getElementById("course-modal-body");
    body.innerHTML = "";

    const cats = orderedCategories(Object.keys(courseObj));
    for (const cat of cats) {
        const files = (courseObj[cat] || []).slice().sort(naturalSort);
        if (!files.length) continue;
        const section = document.createElement("section");
        section.className = "cat-section";
        const h = document.createElement("h4");
        h.textContent = pascalSpaced(cat);
        section.appendChild(h);

        const list = document.createElement("ul");
        list.className = "file-list";
        for (const fname of files) {
            list.appendChild(fileRow(slug, cat, fname));
        }
        section.appendChild(list);
        body.appendChild(section);
    }

    if (!body.children.length) {
        body.innerHTML = `<p class="hint">Keine Dateien.</p>`;
    }

    showModal("course");
}

function orderedCategories(cats) {
    const seen = new Set(cats);
    const ordered = [];
    for (const c of CONFIG.tabOrder) if (seen.has(c)) { ordered.push(c); seen.delete(c); }
    return ordered.concat([...seen].sort());
}

function pdfUrl(slug, cat, fname) {
    return `./${CONFIG.zettelDir}/${slug}/${cat}/${encodeURIComponent(fname)}`;
}

function pdfAbsoluteUrl(slug, cat, fname) {
    const rel = pdfUrl(slug, cat, fname);
    return new URL(rel, window.location.href).toString();
}

/**
 * Returns the raw.githubusercontent.com URL for a PDF. This is what we
 * paste into the prompt template — AI tools fetch GitHub-raw URLs
 * reliably (proper CORS, no custom-domain routing, no Cloudflare gate),
 * whereas the host site URL can fail behind some proxies.
 */
function pdfRawGithubUrl(slug, cat, fname) {
    const { repoOwner, repoName, branch, zettelDir } = CONFIG;
    return `https://raw.githubusercontent.com/${repoOwner}/${repoName}/${branch}/${zettelDir}/${encodeURIComponent(slug)}/${encodeURIComponent(cat)}/${encodeURIComponent(fname)}`;
}

/**
 * iOS / iPadOS detection. We need this because Mobile Safari refuses to
 * render PDFs inside <iframe> elements — the user sees the first page or
 * a blank box and has to tap "Open in Files" to read anything else. On
 * those devices we bail out of the overlay and let Safari open the file
 * in its native viewer (full multi-page UI, search, share, …).
 *
 * iPadOS reports itself as MacIntel since iOS 13, so we also check
 * `maxTouchPoints` to catch that disguise.
 */
function isIosSafari() {
    if (typeof navigator === "undefined") return false;
    const ua = navigator.userAgent || "";
    if (/iPad|iPhone|iPod/.test(ua)) return true;
    if (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) return true;
    return false;
}

function fileRow(slug, cat, fname) {
    const li = document.createElement("li");
    li.className = "file-row";

    const name = document.createElement("span");
    name.className = "file-name";
    const nameText = fname.replace(/\.pdf$/i, "");
    name.textContent = nameText;
    // Full filename surfaces on hover/long-press because the mobile
    // layout ellipsises overflowing names.
    name.title = nameText;
    li.appendChild(name);

    const actions = document.createElement("div");
    actions.className = "file-actions";

    const url = pdfUrl(slug, cat, fname);
    const displayName = pascalSpaced(slug) + " — " + pascalSpaced(cat) + " · " + fname.replace(/\.pdf$/i, "");

    // Buttons render with an inline SVG + a text label. On mobile the
    // label collapses (CSS) so each button becomes a 44×44 icon-only
    // tile; the file name then claims the rest of the row width. The
    // `aria-label` keeps screen readers informed when the label is
    // hidden.
    const makeBtn = (cls, icon, label, ariaLabel, onClick) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "btn " + cls;
        b.setAttribute("aria-label", ariaLabel || label);
        b.innerHTML = icon + '<span class="btn-label">' + escapeHtml(label) + "</span>";
        b.addEventListener("click", onClick);
        return b;
    };

    const view = makeBtn("btn-primary", ICONS.eye, "Ansehen", "Ansehen", () => {
        closeModal("course", { silent: true });
        openViewer(url, displayName);
    });
    actions.appendChild(view);

    // Download is an <a download> so the browser handles "save as"
    // natively (matters on iOS/Safari, which ignores JS-triggered
    // downloads of cross-origin files).
    const dl = document.createElement("a");
    dl.className = "btn btn-secondary";
    dl.href = url;
    dl.download = fname;
    dl.setAttribute("aria-label", "Download");
    dl.innerHTML = ICONS.download + '<span class="btn-label">Download</span>';
    actions.appendChild(dl);

    const copy = makeBtn("btn-ghost", ICONS.copy, "Prompt kopieren", "Prompt kopieren", () => {
        // Use the GitHub-raw URL here, not the host-site URL: AI tools
        // resolve raw.githubusercontent.com reliably regardless of where
        // the page itself is being served from.
        copyPromptIcon(pdfRawGithubUrl(slug, cat, fname), displayName, copy);
    });
    actions.appendChild(copy);

    li.appendChild(actions);
    return li;
}

/* ============================================================
 * Modal mechanics
 * ============================================================ */

function showModal(kind) {
    const m = document.getElementById(kind + "-modal");
    m.classList.add("active");
    m.setAttribute("aria-hidden", "false");
    document.body.classList.add("no-scroll");
}

function closeModal(kind, opts = {}) {
    const m = document.getElementById(kind + "-modal");
    m.classList.remove("active");
    m.setAttribute("aria-hidden", "true");
    if (!document.querySelector(".modal.active") && !document.getElementById("viewer").classList.contains("active")) {
        document.body.classList.remove("no-scroll");
    }
}

function wireModals() {
    document.querySelectorAll("[data-close]").forEach(el => {
        el.addEventListener("click", () => closeModal(el.getAttribute("data-close")));
    });
    document.addEventListener("keydown", e => {
        if (e.key === "Escape") {
            const open = document.querySelector(".modal.active");
            if (open) closeModal(open.id.replace(/-modal$/, ""));
            else if (document.getElementById("viewer").classList.contains("active")) closeViewer();
        }
    });
}

/* ============================================================
 * Viewer (full-screen, browser-back closes it)
 * ============================================================ */

const VIEWER_STATE = "sem2-viewer";

function openViewer(url, title) {
    // iOS Safari can't render PDFs in an <iframe> — the user only sees
    // the first page or a blank box. Hand the URL off to the OS-native
    // viewer instead so iPhone/iPad users can actually read the document.
    if (isIosSafari()) {
        window.open(url, "_blank", "noopener");
        return;
    }

    const v = document.getElementById("viewer");
    document.getElementById("viewer-title").textContent = title || "PDF";
    document.getElementById("viewer-frame").src = url;
    v.classList.add("active");
    v.setAttribute("aria-hidden", "false");
    document.body.classList.add("no-scroll");
    // Push a state so the browser back-button closes the viewer
    // instead of leaving the page.
    if (history.state?.kind !== VIEWER_STATE) {
        history.pushState({ kind: VIEWER_STATE }, "", "#viewer");
    }
}

function closeViewer({ fromPopstate = false } = {}) {
    const v = document.getElementById("viewer");
    if (!v.classList.contains("active")) return;
    v.classList.remove("active");
    v.setAttribute("aria-hidden", "true");
    document.getElementById("viewer-frame").src = "";
    if (!document.querySelector(".modal.active")) {
        document.body.classList.remove("no-scroll");
    }
    if (!fromPopstate && history.state?.kind === VIEWER_STATE) {
        history.back();
    }
}

function wireViewer() {
    document.getElementById("viewer-close").addEventListener("click", () => closeViewer());
    window.addEventListener("popstate", () => {
        const v = document.getElementById("viewer");
        if (v.classList.contains("active")) closeViewer({ fromPopstate: true });
    });
    if (location.hash === "#viewer") {
        // Stale hash on load — strip it.
        history.replaceState(null, "", location.pathname + location.search);
    }
}

/* ============================================================
 * Prompt template editor (with placeholder highlighting)
 * ============================================================ */

function loadPromptTemplate() {
    try {
        return localStorage.getItem(LS.promptKey) || DEFAULT_PROMPT;
    } catch {
        return DEFAULT_PROMPT;
    }
}

function savePromptTemplate(s) {
    try { localStorage.setItem(LS.promptKey, s); } catch {}
}

function resetPromptTemplate() {
    try { localStorage.removeItem(LS.promptKey); } catch {}
}

function renderHighlight(text) {
    const escaped = escapeHtml(text);
    return escaped
        .replace(/\{PDF_URL\}/g, '<span class="ph ph-pdf">{PDF_URL}</span>')
        .replace(/\{DISPLAY_NAME\}/g, '<span class="ph ph-name">{DISPLAY_NAME}</span>')
        // Keep the trailing newline visible in the <pre>.
        + "\n";
}

function syncHighlight() {
    const ta = document.getElementById("prompt-editor");
    const hl = document.getElementById("prompt-highlight");
    hl.innerHTML = renderHighlight(ta.value);
    hl.scrollTop = ta.scrollTop;
    hl.scrollLeft = ta.scrollLeft;
}

function wirePromptEditor() {
    const ta = document.getElementById("prompt-editor");
    document.getElementById("prompt-edit-btn").addEventListener("click", () => {
        ta.value = loadPromptTemplate();
        syncHighlight();
        showModal("prompt");
        // focus after the show transition begins
        setTimeout(() => ta.focus(), 50);
    });
    ta.addEventListener("input", syncHighlight);
    ta.addEventListener("scroll", syncHighlight);
    document.getElementById("prompt-save").addEventListener("click", () => {
        savePromptTemplate(ta.value);
        closeModal("prompt");
    });
    document.getElementById("prompt-reset").addEventListener("click", () => {
        ta.value = DEFAULT_PROMPT;
        syncHighlight();
        resetPromptTemplate();
    });
}

/* ============================================================
 * Copy prompt to clipboard
 * ============================================================ */

function copyPrompt(url, displayName, btn) {
    const tpl = loadPromptTemplate();
    const out = tpl
        .replace(/\{PDF_URL\}/g, url)
        .replace(/\{DISPLAY_NAME\}/g, displayName);
    const done = ok => {
        const orig = btn.textContent;
        btn.textContent = ok ? "Kopiert!" : "Fehler";
        btn.classList.toggle("copied", ok);
        setTimeout(() => {
            btn.textContent = orig;
            btn.classList.remove("copied");
        }, 1500);
    };
    if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(out).then(() => done(true), () => fallbackCopy(out, done));
    } else {
        fallbackCopy(out, done);
    }
}

/**
 * Variant for the icon-style copy button — the button now contains an
 * <svg> plus a `<span class="btn-label">`. Swap only the label text so
 * the icon stays visible during the "Kopiert!" flash. Original
 * `copyPrompt` is kept for any direct callers that pass plain-text
 * buttons.
 */
function copyPromptIcon(url, displayName, btn) {
    const tpl = loadPromptTemplate();
    const out = tpl
        .replace(/\{PDF_URL\}/g, url)
        .replace(/\{DISPLAY_NAME\}/g, displayName);
    const label = btn.querySelector(".btn-label");
    const done = ok => {
        const orig = label?.textContent;
        if (label) label.textContent = ok ? "Kopiert!" : "Fehler";
        btn.classList.toggle("copied", ok);
        setTimeout(() => {
            if (label && orig != null) label.textContent = orig;
            btn.classList.remove("copied");
        }, 1500);
    };
    if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(out).then(() => done(true), () => fallbackCopy(out, done));
    } else {
        fallbackCopy(out, done);
    }
}

function fallbackCopy(text, done) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch {}
    document.body.removeChild(ta);
    done(ok);
}

/* ============================================================
 * Init
 * ============================================================ */

document.addEventListener("DOMContentLoaded", () => {
    initTheme();
    wireModals();
    wireViewer();
    wirePromptEditor();
    renderIndex();
});
