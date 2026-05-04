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

async function ghApi(path) {
    const { owner, repo } = detectRepo();
    if (!owner || !repo) {
        throw new Error(
            "Konnte owner/repo nicht ermitteln. Trage sie in assets/app.js → CONFIG ein."
        );
    }
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${CONFIG.branch}`;
    const res = await fetch(url, { headers: { Accept: "application/vnd.github+json" } });
    if (!res.ok) {
        throw new Error(`GitHub API ${res.status}: ${url}`);
    }
    return res.json();
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
        const items = await ghApi(CONFIG.zettelDir);
        const dirs = items
            .filter(i => i.type === "dir")
            .sort((a, b) => a.name.localeCompare(b.name, "de"));

        const grid = document.getElementById("courses");
        grid.innerHTML = "";

        if (dirs.length === 0) {
            setStatus("Keine Kurse in ./zettel/ gefunden.");
            return;
        }

        for (const d of dirs) {
            const a = document.createElement("a");
            a.className = "card";
            a.href = `./course.html?course=${encodeURIComponent(d.name)}`;
            a.innerHTML = `
                <div class="card-title">${toPascalSpaced(d.name)}</div>
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

    setStatus("Lade Inhalte…");
    let subdirs;
    try {
        const items = await ghApi(`${CONFIG.zettelDir}/${course}`);
        subdirs = items.filter(i => i.type === "dir");
    } catch (err) {
        setStatus(err.message, true);
        return;
    }

    if (subdirs.length === 0) {
        setStatus("Keine Unterordner gefunden.", true);
        return;
    }

    // Tabs sortieren: bekannte zuerst (in CONFIG.tabOrder), Rest alphabetisch
    const known = CONFIG.tabOrder.filter(n => subdirs.some(s => s.name === n));
    const unknown = subdirs
        .map(s => s.name)
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
    document.querySelectorAll(".tab").forEach(t => {
        t.classList.toggle("active", t.dataset.tab === tab);
    });
    history.replaceState(null, "", `?course=${encodeURIComponent(course)}#${encodeURIComponent(tab)}`);

    const controls = document.getElementById("file-controls");
    const viewer = document.getElementById("viewer");
    controls.innerHTML = "";
    viewer.innerHTML = `<div class="placeholder">Lade Dateien…</div>`;

    let files;
    try {
        const items = await ghApi(`${CONFIG.zettelDir}/${course}/${tab}`);
        files = items
            .filter(i => i.type === "file" && /\.pdf$/i.test(i.name))
            .sort((a, b) => a.name.localeCompare(b.name, "de", { numeric: true }));
    } catch (err) {
        viewer.innerHTML = `<div class="placeholder">Fehler: ${err.message}</div>`;
        return;
    }

    if (files.length === 0) {
        viewer.innerHTML = `<div class="placeholder">Keine PDFs in „${tab}".</div>`;
        return;
    }

    // Pills + Actions in einer Zeile
    const pillsWrap = document.createElement("div");
    pillsWrap.className = "pills-wrap";

    const downloadBtn = document.createElement("a");
    downloadBtn.className = "btn success action-btn";
    downloadBtn.textContent = "↓ Runterladen";
    downloadBtn.setAttribute("download", "");

    const fullscreenBtn = document.createElement("button");
    fullscreenBtn.className = "btn action-btn";
    fullscreenBtn.type = "button";
    fullscreenBtn.textContent = "⛶ Vollbild";
    fullscreenBtn.addEventListener("click", toggleFullscreen);

    let currentUrl = null;
    const selectFile = (url, name, btnEl) => {
        currentUrl = url;
        downloadBtn.href = url;
        downloadBtn.setAttribute("download", name);
        pillsWrap.querySelectorAll(".pill").forEach(p => p.classList.toggle("active", p === btnEl));
        showPdf(url);
    };

    files.forEach((f, idx) => {
        const url = `./${CONFIG.zettelDir}/${course}/${tab}/${f.name}`;
        const pill = document.createElement("button");
        pill.type = "button";
        pill.className = "pill" + (idx === 0 ? " active" : "");
        pill.textContent = f.name.replace(/\.pdf$/i, "");
        pill.title = f.name;
        pill.addEventListener("click", () => selectFile(url, f.name, pill));
        pillsWrap.appendChild(pill);
        if (idx === 0) {
            currentUrl = url;
            downloadBtn.href = url;
            downloadBtn.setAttribute("download", f.name);
        }
    });

    controls.appendChild(pillsWrap);
    controls.appendChild(fullscreenBtn);
    controls.appendChild(downloadBtn);

    showPdf(currentUrl);
}

function showPdf(url) {
    const viewer = document.getElementById("viewer");
    viewer.innerHTML = `<iframe src="${url}#view=FitH" title="PDF" allowfullscreen></iframe>`;
}

function toggleFullscreen() {
    const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
    if (fsEl) {
        (document.exitFullscreen || document.webkitExitFullscreen).call(document);
        return;
    }
    const iframe = document.querySelector("#viewer iframe");
    if (!iframe) return;
    const req = iframe.requestFullscreen || iframe.webkitRequestFullscreen;
    if (!req) {
        alert("Vollbild wird auf diesem Gerät nicht unterstützt.");
        return;
    }
    req.call(iframe).catch(() => {
        const viewer = document.getElementById("viewer");
        const vReq = viewer.requestFullscreen || viewer.webkitRequestFullscreen;
        if (vReq) vReq.call(viewer);
        else alert("Vollbild wird auf diesem Gerät nicht unterstützt.");
    });
}

document.addEventListener("fullscreenchange", updateFullscreenLabel);
document.addEventListener("webkitfullscreenchange", updateFullscreenLabel);

function updateFullscreenLabel() {
    const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
    document.querySelectorAll(".btn").forEach(b => {
        if (b.textContent.includes("Vollbild") || b.textContent.includes("Verlassen")) {
            b.textContent = fsEl ? "⛶ Verlassen" : "⛶ Vollbild";
        }
    });
}
