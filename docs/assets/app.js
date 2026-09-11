(function () {
  const STORAGE_KEY = "trades-runtime-theme";

  const PAGES = {
    home: { prefix: "", current: "home" },
    catalog: { prefix: "../", current: "catalog" },
    hvac: { prefix: "../../", current: "hvac" },
    plumbing: { prefix: "../../", current: "plumbing" },
    electrical: { prefix: "../../", current: "electrical" },
    sewer: { prefix: "../../", current: "sewer" },
    "cross-trades": { prefix: "../../", current: "cross-trades" },
    notfound: { prefix: "/", current: "" }
  };

  const LINKS = [
    { id: "home", href: "", label: "Home" },
    { id: "hvac", href: "trades/hvac/", label: "HVAC" },
    { id: "plumbing", href: "trades/plumbing/", label: "Plumbing" },
    { id: "electrical", href: "trades/electrical/", label: "Electrical" },
    { id: "sewer", href: "trades/sewer/", label: "Sewer" },
    { id: "cross-trades", href: "trades/cross-trades/", label: "Cross-trades" },
    { id: "catalog", href: "catalog/", label: "Catalog" }
  ];

  function preferredTheme() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "light" || saved === "dark") return saved;
    return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    const button = document.querySelector("[data-theme-toggle]");
    if (button) {
      button.setAttribute("aria-pressed", theme === "light" ? "true" : "false");
      button.textContent = theme === "light" ? "Dark" : "Light";
    }
  }

  function sitePrefix() {
    const page = document.body.dataset.page || "home";
    if (page === "notfound") {
      const parts = location.pathname.split("/").filter(Boolean);
      const repoIndex = parts.indexOf("trades-runtime");
      if (repoIndex !== -1) {
        return "/" + parts.slice(0, repoIndex + 1).join("/") + "/";
      }
      return "/";
    }
    return (PAGES[page] && PAGES[page].prefix) || "";
  }

  function mountChrome() {
    const page = document.body.dataset.page || "home";
    const prefix = sitePrefix();
    const header = document.querySelector("[data-site-header]");
    const footer = document.querySelector("[data-site-footer]");
    const year = new Date().getFullYear();

    if (header) {
      header.innerHTML = `
        <div class="wrap header-row">
          <a class="brand" href="${prefix}">
            <strong>trades-runtime</strong>
            <span>Private field-trades catalog</span>
          </a>
          <nav class="nav" aria-label="Trades">
            ${LINKS.map((link) => {
              const current = link.id === page ? ' aria-current="page"' : "";
              return `<a href="${prefix}${link.href}"${current}>${link.label}</a>`;
            }).join("")}
          </nav>
          <div class="header-tools">
            <button type="button" class="theme-toggle" data-theme-toggle aria-pressed="false">Light</button>
          </div>
        </div>
      `;
    }

    if (footer) {
      footer.innerHTML = `
        <div class="wrap">
          <div>© ${year} Aziel Eliab · trades-runtime 0.1.0 · private · Apache-2.0</div>
          <div>
            <a href="${prefix}v1/runtime.json">runtime.json</a>
            · <a href="${prefix}cite.json">cite.json</a>
            · <a href="${prefix}llms.txt">llms.txt</a>
          </div>
        </div>
      `;
    }

    const toggle = document.querySelector("[data-theme-toggle]");
    if (toggle) {
      toggle.addEventListener("click", () => {
        const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
        localStorage.setItem(STORAGE_KEY, next);
        applyTheme(next);
      });
    }
  }

  function renderCatalog(data) {
    const root = document.getElementById("catalog-root");
    if (!root) return;

    const ops = (data.planned_ops || [])
      .map((op) => `<tr><td><code>${op.slug}</code></td><td>${op.name}</td><td><span class="badge planned">${op.status}</span></td><td>${op.summary}</td></tr>`)
      .join("");

    const modules = (data.modules || [])
      .map((mod) => {
        const jobs = (mod.job_types || []).map((job) => `<li>${job}</li>`).join("");
        return `
          <a class="card" href="../${mod.path}">
            <div class="badge-row"><span class="badge catalog">${mod.status}</span><span class="badge">${mod.kind}</span></div>
            <h3>${mod.name}</h3>
            <p>${mod.one_line}</p>
            <ul class="list">${jobs}</ul>
          </a>
        `;
      })
      .join("");

    root.innerHTML = `
      <div class="panel">
        <p class="notice"><strong>${data.product}</strong> · v${data.version} · role <code>${data.role}</code> · author ${data.author}</p>
        <p>${(data.not || []).join(" ")}</p>
      </div>
      <div class="section">
        <h2>Planned ops</h2>
        <table class="ops">
          <thead><tr><th>Slug</th><th>Name</th><th>Status</th><th>Summary</th></tr></thead>
          <tbody>${ops}</tbody>
        </table>
      </div>
      <div class="section">
        <h2>Trade modules</h2>
        <div class="grid cards">${modules}</div>
      </div>
    `;
  }

  applyTheme(preferredTheme());
  mountChrome();
  applyTheme(preferredTheme());

  const catalogRoot = document.getElementById("catalog-root");
  if (catalogRoot) {
    fetch("../v1/runtime.json")
      .then((res) => {
        if (!res.ok) throw new Error("catalog unavailable");
        return res.json();
      })
      .then(renderCatalog)
      .catch(() => {
        catalogRoot.innerHTML = "<p>Could not load <code>/v1/runtime.json</code>. Open the file directly from this private site.</p>";
      });
  }
})();
