(function () {
  const STORAGE_KEY = "trades-runtime-theme";

  const ONE = "../";
  const TWO = "../../";

  const PAGES = {
    home: "",
    catalog: ONE,
    architecture: ONE,
    "operating-model": ONE,
    chains: ONE,
    shadow: ONE,
    rules: ONE,
    dispatch: ONE,
    workforce: ONE,
    fabrics: ONE,
    analytics: ONE,
    modules: ONE,
    trades: ONE,
    hvac: TWO,
    plumbing: TWO,
    electrical: TWO,
    sewer: TWO,
    "cross-trades": TWO,
    notfound: "/"
  };

  const LINKS = [
    { id: "home", href: "", label: "Home" },
    { id: "architecture", href: "architecture/", label: "Architecture" },
    { id: "operating-model", href: "operating-model/", label: "Operating" },
    { id: "chains", href: "chains/", label: "Chains" },
    { id: "shadow", href: "shadow/", label: "Shadow" },
    { id: "rules", href: "rules/", label: "Rules" },
    { id: "dispatch", href: "dispatch/", label: "Dispatch" },
    { id: "workforce", href: "workforce/", label: "Workforce" },
    { id: "fabrics", href: "fabrics/", label: "Fabrics" },
    { id: "analytics", href: "analytics/", label: "Analytics" },
    { id: "modules", href: "modules/", label: "Modules" },
    { id: "trades", href: "trades/", label: "Trades" },
    { id: "catalog", href: "catalog/", label: "Catalog" }
  ];

  const TRADE_PAGES = ["trades", "hvac", "plumbing", "electrical", "sewer", "cross-trades"];

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
    return PAGES[page] != null ? PAGES[page] : "";
  }

  function isCurrent(linkId, page) {
    if (linkId === page) return true;
    if (linkId === "trades" && TRADE_PAGES.includes(page)) return true;
    return false;
  }

  function mountChrome() {
    const page = document.body.dataset.page || "home";
    const prefix = sitePrefix();
    const header = document.querySelector("[data-site-header]");
    const footer = document.querySelector("[data-site-footer]");
    const year = new Date().getFullYear();

    if (header) {
      header.innerHTML = `
        <div class="confidential">Confidential design concept — implementation subject to integration, legal, security and operational validation. Not a live production deployment.</div>
        <div class="wrap header-bar">
          <a class="brand" href="${prefix}">
            <strong>Trades-Runtime</strong>
            <span>Shadow-first operating intelligence · private</span>
          </a>
          <div class="header-tools">
            <span class="badge private">private</span>
            <button type="button" class="theme-toggle" data-theme-toggle aria-pressed="false">Light</button>
          </div>
        </div>
        <div class="wrap">
          <nav class="nav-bar" aria-label="Architecture">
            ${LINKS.map((link) => {
              const current = isCurrent(link.id, page) ? ' aria-current="page"' : "";
              return `<a href="${prefix}${link.href}"${current}>${link.label}</a>`;
            }).join("")}
          </nav>
        </div>
      `;
    }

    if (footer) {
      footer.innerHTML = `
        <div class="wrap">
          <div>© ${year} Aziel Eliab · Trades-Runtime 0.3.4 · local-first · Apache-2.0 · giveaway Worker is not a company OS</div>
          <div>
            <a href="${prefix}v1/runtime.json">runtime.json</a>
            · <a href="${prefix}cite.json">cite.json</a>
            · <a href="${prefix}llms.txt">llms.txt</a>
            · <a href="${prefix}modules/">modules</a>
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

  function badge(status) {
    const cls = status === "live-pure" || status === "ok" ? "catalog" : status === "design" || status === "planned" || status === "stub" ? status === "stub" ? "stub" : "planned" : "private";
    return `<span class="badge ${cls}">${status || "design"}</span>`;
  }

  function renderCatalog(data) {
    const root = document.getElementById("catalog-root");
    if (!root) return;

    const modes = (data.modes || []).map((m) => `
      <div class="card">
        <div class="badge-row">${badge(m.status)}<span class="badge">${m.slug}</span></div>
        <h3>${m.name}</h3>
        <p>${m.summary || ""}</p>
      </div>`).join("");

    const chains = (data.chains || []).map((c) => `
      <div class="card">
        <p class="chain-letter">${c.id}</p>
        <h3>${c.name}</h3>
        <p>${c.purpose || ""}</p>
        ${badge(c.status)}
      </div>`).join("");

    const fabrics = (data.fabrics || []).map((f) => `
      <div class="card">
        <div class="badge-row">${badge(f.status)}<span class="badge">${f.kind || "fabric"}</span></div>
        <h3>${f.name}</h3>
        <p>${f.responsibility || f.one_line || ""}</p>
      </div>`).join("");

    const pipelines = (data.pipelines || []).map((p) => `
      <tr><td>${p.name}</td><td>${p.role || ""}</td><td>${badge(p.status)}</td></tr>`).join("");

    const software = (data.software_modules || []).map((m) => `
      <tr><td><code>${m.slug}</code></td><td><code>${m.path || ""}</code></td><td>${badge(m.status)}</td><td>${m.summary || ""}</td></tr>`).join("");

    const engines = (data.engines || []).map((e) => `
      <tr><td><code>${e.slug}</code></td><td>${e.name}</td><td>${badge(e.status)}</td><td>${e.summary || ""}</td></tr>`).join("");

    const ops = (data.planned_ops || []).map((op) => `
      <tr><td><code>${op.slug}</code></td><td>${op.name}</td><td>${badge(op.status)}</td><td>${op.summary || ""}</td></tr>`).join("");

    const modules = (data.modules || []).map((mod) => {
      const jobs = (mod.job_types || []).map((job) => `<li>${job}</li>`).join("");
      return `
        <a class="card" href="../${mod.path}">
          <div class="badge-row">${badge(mod.status)}<span class="badge">${mod.kind}</span></div>
          <h3>${mod.name}</h3>
          <p>${mod.one_line}</p>
          <ul class="list">${jobs}</ul>
        </a>`;
    }).join("");

    const ladder = (data.deployment_ladder || []).map((step) => `
      <li><div><strong>${step.name}</strong><p class="muted">${step.summary || ""}</p></div></li>`).join("");

    const isNot = (data.is_not || data.not || []).map((item) => `<li>${item}</li>`).join("");

    root.innerHTML = `
      <div class="panel">
        <p class="notice"><strong>${data.title || data.product}</strong> · v${data.version} · role <code>${data.role}</code> · author ${data.author}</p>
        <p>${data.one_line || ""}</p>
        <p class="muted">${data.honesty || "Static design catalog. No live Worker backends."}</p>
      </div>
      <div class="section">
        <h2>What it is not</h2>
        <ul class="list is-not">${isNot}</ul>
      </div>
      <div class="section">
        <h2>Deployment ladder</h2>
        <ol class="ladder">${ladder}</ol>
      </div>
      <div class="section">
        <h2>Operating modes</h2>
        <div class="grid cards">${modes}</div>
      </div>
      <div class="section">
        <h2>Immutable chains</h2>
        <div class="grid chain-grid">${chains}</div>
      </div>
      <div class="section">
        <h2>Fabrics</h2>
        <div class="grid cards">${fabrics}</div>
      </div>
      <div class="section">
        <h2>Pipelines</h2>
        <table class="ops">
          <thead><tr><th>Pipeline</th><th>Role</th><th>Status</th></tr></thead>
          <tbody>${pipelines}</tbody>
        </table>
      </div>
      <div class="section">
        <h2>Software modules</h2>
        <table class="ops">
          <thead><tr><th>Slug</th><th>Path</th><th>Status</th><th>Summary</th></tr></thead>
          <tbody>${software || "<tr><td colspan=4>No software_modules in runtime.json</td></tr>"}</tbody>
        </table>
      </div>
      <div class="section">
        <h2>Decision engines</h2>
        <table class="ops">
          <thead><tr><th>Slug</th><th>Name</th><th>Status</th><th>Summary</th></tr></thead>
          <tbody>${engines}</tbody>
        </table>
      </div>
      <div class="section">
        <h2>Planned ops</h2>
        <table class="ops">
          <thead><tr><th>Slug</th><th>Name</th><th>Status</th><th>Summary</th></tr></thead>
          <tbody>${ops}</tbody>
        </table>
      </div>
      <div class="section">
        <h2>Trade domain surfaces</h2>
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
