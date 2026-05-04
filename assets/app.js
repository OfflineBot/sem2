/* ============================================================
 * Konfiguration
 * ============================================================
 * Auto-Erkennung von owner/repo aus der GitHub-Pages-URL.
 * Falls du auf einer Custom-Domain hostest oder lokal testen
 * willst, trage owner/repo unten manuell ein.
 * Default-Tab und Reihenfolge der Tabs ebenfalls hier.
 */
const CONFIG = {
    owner: null,            // z.B. "lukascvitanovic" — null = auto
    repo: null,             // z.B. "sem2"             — null = auto
    branch: "main",
    zettelDir: "zettel",
    defaultTab: "lernzettel",
    // Tab-Reihenfolge (existierende Ordner werden angezeigt; unbekannte ans Ende):
    tabOrder: ["lernzettel", "openbook", "übungsaufgaben", "klausur"],
};

/* ============================================================
 * Helpers
 * ============================================================ */

function detectRepo() {
    if (CONFIG.owner && CONFIG.repo) {
        return { owner: CONFIG.owner, repo: CONFIG.repo };
    }
    const host = window.location.hostname;
    const parts = window.location.pathname.split("/").filter(Boolean);

    // username.github.io/repo/...
    if (host.endsWith(".github.io")) {
        const owner = host.split(".")[0];
        const repo = parts[0] || owner + ".github.io";
        return { owner, repo };
    }
    return { owner: null, repo: null };
}

function toPascalSpaced(slug) {
    return slug
        .split(/[_\-]+/)
        .filter(Boolean)
        .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(" ");
}

/* ---------- Manifest (statisch) mit GitHub-API-Fallback + Cache ---------- */

let _manifestPromise = null;
const MANIFEST_CACHE_KEY = "sem2.manifest.v1";
const MANIFEST_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h

function readManifestCache() {
    try {
        const raw = localStorage.getItem(MANIFEST_CACHE_KEY);
        if (!raw) return null;
        const { ts, data } = JSON.parse(raw);
        if (Date.now() - ts > MANIFEST_CACHE_TTL_MS) return null;
        return data;
    } catch { return null; }
}

function writeManifestCache(data) {
    try {
        localStorage.setItem(MANIFEST_CACHE_KEY, JSON.stringify({ ts: Date.now(), data }));
    } catch { /* quota o. private mode */ }
}

async function loadManifest() {
    if (_manifestPromise) return _manifestPromise;
    _manifestPromise = (async () => {
        // 1) statische manifest.json (vom GitHub-Action generiert)
        try {
            const res = await fetch("./manifest.json", { cache: "no-cache" });
            if (res.ok) {
                const data = await res.json();
                writeManifestCache(data);
                return data;
            }
        } catch { /* offline / nicht da */ }

        // 2) Cache (auch abgelaufen = besser als nichts)
        const cached = readManifestCache();
        if (cached) return cached;

        // 3) Fallback: GitHub API rekursiv aufbauen
        const { owner, repo } = detectRepo();
        if (!owner || !repo) {
            throw new Error("Keine manifest.json gefunden und owner/repo nicht ermittelbar.");
        }
        const built = await buildManifestFromApi(owner, repo);
        writeManifestCache(built);
        return built;
    })();
    return _manifestPromise;
}

async function buildManifestFromApi(owner, repo) {
    const fetchDir = async (path) => {
        const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${CONFIG.branch}`;
        const res = await fetch(url, { headers: { Accept: "application/vnd.github+json" } });
        if (!res.ok) throw new Error(`GitHub API ${res.status}: ${url}`);
        return res.json();
    };
    const out = { courses: {} };
    const courses = (await fetchDir(CONFIG.zettelDir)).filter(i => i.type === "dir");
    for (const c of courses) {
        out.courses[c.name] = {};
        const subs = (await fetchDir(`${CONFIG.zettelDir}/${c.name}`)).filter(i => i.type === "dir");
        for (const s of subs) {
            const files = await fetchDir(`${CONFIG.zettelDir}/${c.name}/${s.name}`);
            out.courses[c.name][s.name] = files
                .filter(f => f.type === "file" && /\.pdf$/i.test(f.name))
                .map(f => f.name)
                .sort((a, b) => a.localeCompare(b, "de", { numeric: true }));
        }
    }
    return out;
}

function setStatus(msg, isError = false) {
    const el = document.getElementById("status");
    if (!el) return;
    el.textContent = msg || "";
    el.classList.toggle("error", !!isError);
    el.style.display = msg ? "block" : "none";
}

function setRepoInfo() {
    const el = document.getElementById("repo-info");
    if (!el) return;
    const { owner, repo } = detectRepo();
    if (owner && repo) {
        el.innerHTML = `Quelle: <a href="https://github.com/${owner}/${repo}" target="_blank" rel="noopener">${owner}/${repo}</a>`;
    }
}

/* ============================================================
 * Index-Seite: Kurse aus ./zettel/* listen
 * ============================================================ */

async function renderIndex() {
    setRepoInfo();
    try {
        const manifest = await loadManifest();
        const courseNames = Object.keys(manifest.courses)
            .sort((a, b) => a.localeCompare(b, "de"));

        const grid = document.getElementById("courses");
        grid.innerHTML = "";

        if (courseNames.length === 0) {
            setStatus("Keine Kurse in ./zettel/ gefunden.");
            return;
        }

        for (const name of courseNames) {
            const a = document.createElement("a");
            a.className = "card";
            a.href = `./course.html?course=${encodeURIComponent(name)}`;
            a.innerHTML = `
                <div class="card-title">${toPascalSpaced(name)}</div>
            `;
            grid.appendChild(a);
        }
        setStatus("");
    } catch (err) {
        setStatus(err.message, true);
    }
}

/* ============================================================
 * Kurs-Seite: Tabs (Unterordner) + PDF-Viewer
 * ============================================================ */

async function renderCourse() {
    setRepoInfo();
    const params = new URLSearchParams(window.location.search);
    const course = params.get("course");
    if (!course) {
        setStatus("Kein Kurs angegeben.", true);
        return;
    }

    document.getElementById("course-title").textContent = toPascalSpaced(course);
    document.title = `${toPascalSpaced(course)} · 2. Semester`;

    initSidebarDrawer();

    setStatus("Lade Inhalte…");
    let manifest, subdirNames;
    try {
        manifest = await loadManifest();
        if (!manifest.courses[course]) {
            setStatus(`Kurs „${course}" nicht im Manifest.`, true);
            return;
        }
        subdirNames = Object.keys(manifest.courses[course]);
    } catch (err) {
        setStatus(err.message, true);
        return;
    }

    if (subdirNames.length === 0) {
        setStatus("Keine Unterordner gefunden.", true);
        return;
    }

    // Tabs sortieren: bekannte zuerst (in CONFIG.tabOrder), Rest alphabetisch
    const known = CONFIG.tabOrder.filter(n => subdirNames.includes(n));
    const unknown = subdirNames
        .filter(n => !CONFIG.tabOrder.includes(n))
        .sort((a, b) => a.localeCompare(b, "de"));
    const tabNames = [...known, ...unknown];

    // Default-Tab aus URL-Hash oder CONFIG
    const wanted = decodeURIComponent((window.location.hash || "").replace(/^#/, ""));
    const initialTab = tabNames.includes(wanted)
        ? wanted
        : (tabNames.includes(CONFIG.defaultTab) ? CONFIG.defaultTab : tabNames[0]);

    const tabsEl = document.getElementById("tabs");
    tabsEl.innerHTML = "";
    for (const name of tabNames) {
        const btn = document.createElement("button");
        btn.className = "tab" + (name === initialTab ? " active" : "");
        btn.textContent = toPascalSpaced(name);
        btn.dataset.tab = name;
        btn.addEventListener("click", () => loadTab(course, name));
        tabsEl.appendChild(btn);
    }

    setStatus("");
    loadTab(course, initialTab);
}

async function loadTab(course, tab) {
    // Aktiven Tab markieren
    document.querySelectorAll(".sidebar-tabs .tab").forEach(t => {
        t.classList.toggle("active", t.dataset.tab === tab);
    });
    history.replaceState(null, "", `?course=${encodeURIComponent(course)}#${encodeURIComponent(tab)}`);

    const filesLabel = document.getElementById("files-label");
    if (filesLabel) filesLabel.textContent = toPascalSpaced(tab);

    const pillsWrap = document.getElementById("file-pills");
    const viewer = document.getElementById("viewer");
    pillsWrap.innerHTML = "";
    viewer.innerHTML = `<div class="placeholder">Lade Dateien…</div>`;

    let files;
    try {
        const manifest = await loadManifest();
        const list = manifest.courses?.[course]?.[tab] || [];
        files = list.map(name => ({ name }));
    } catch (err) {
        viewer.innerHTML = `<div class="placeholder">Fehler: ${err.message}</div>`;
        return;
    }

    const downloadBtn = document.getElementById("download-btn");
    const topbarFile = document.getElementById("topbar-file");
    const topbarSep = document.getElementById("topbar-sep");

    if (files.length === 0) {
        viewer.innerHTML = `<div class="placeholder">Keine PDFs in „${tab}".</div>`;
        if (downloadBtn) downloadBtn.hidden = true;
        if (topbarFile) topbarFile.textContent = "";
        if (topbarSep) topbarSep.hidden = true;
        return;
    }

    const selectFile = (url, name, btnEl) => {
        if (downloadBtn) {
            downloadBtn.href = url;
            downloadBtn.setAttribute("download", name);
            downloadBtn.hidden = false;
        }
        if (topbarFile) topbarFile.textContent = name.replace(/\.pdf$/i, "");
        if (topbarSep) topbarSep.hidden = false;
        pillsWrap.querySelectorAll(".pill").forEach(p => p.classList.toggle("active", p === btnEl));
        showPdf(url);
        setSidebarOpen(false);
    };

    let firstUrl = null, firstName = null;
    files.forEach((f, idx) => {
        const url = `./${CONFIG.zettelDir}/${course}/${tab}/${f.name}`;
        const pill = document.createElement("button");
        pill.type = "button";
        pill.className = "pill" + (idx === 0 ? " active" : "");
        pill.textContent = f.name.replace(/\.pdf$/i, "");
        pill.title = f.name;
        pill.addEventListener("click", () => selectFile(url, f.name, pill));
        pillsWrap.appendChild(pill);
        if (idx === 0) { firstUrl = url; firstName = f.name; }
    });

    // Initiale Anzeige (ohne Sidebar zu schließen, da sie eh zu ist)
    if (downloadBtn) {
        downloadBtn.href = firstUrl;
        downloadBtn.setAttribute("download", firstName);
        downloadBtn.hidden = false;
    }
    if (topbarFile) topbarFile.textContent = firstName.replace(/\.pdf$/i, "");
    if (topbarSep) topbarSep.hidden = false;
    showPdf(firstUrl);
}

function showPdf(url) {
    const viewer = document.getElementById("viewer");
    const wasExpanded = viewer.classList.contains("expanded");
    viewer.innerHTML = `
        <button type="button" class="viewer-close" aria-label="Schließen" title="Schließen (Esc)">✕</button>
        <iframe src="${url}#view=FitH" title="PDF"></iframe>
    `;
    viewer.querySelector(".viewer-close").addEventListener("click", exitExpanded);
    if (wasExpanded) viewer.classList.add("expanded");
}

function toggleExpanded() {
    const viewer = document.getElementById("viewer");
    if (!viewer) return;
    const expanded = viewer.classList.toggle("expanded");
    document.body.classList.toggle("no-scroll", expanded);
}

function exitExpanded() {
    const viewer = document.getElementById("viewer");
    if (!viewer) return;
    viewer.classList.remove("expanded");
    document.body.classList.remove("no-scroll");
}

document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
        exitExpanded();
        setSidebarOpen(false);
    }
});

function setSidebarOpen(open) {
    const sidebar = document.getElementById("file-controls");
    const backdrop = document.getElementById("sidebar-backdrop");
    if (!sidebar) return;
    sidebar.classList.toggle("open", open);
    if (backdrop) backdrop.classList.toggle("open", open);
}

function initSidebarDrawer() {
    const toggle = document.getElementById("sidebar-toggle");
    const backdrop = document.getElementById("sidebar-backdrop");
    const sidebar = document.getElementById("file-controls");
    const fsBtn = document.getElementById("fullscreen-btn");
    if (toggle && !toggle.dataset.bound) {
        toggle.dataset.bound = "1";
        toggle.addEventListener("click", () => {
            setSidebarOpen(!sidebar.classList.contains("open"));
        });
    }
    if (backdrop && !backdrop.dataset.bound) {
        backdrop.dataset.bound = "1";
        backdrop.addEventListener("click", () => setSidebarOpen(false));
    }
    if (fsBtn && !fsBtn.dataset.bound) {
        fsBtn.dataset.bound = "1";
        fsBtn.addEventListener("click", toggleExpanded);
    }
}
