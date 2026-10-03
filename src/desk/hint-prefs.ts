/**
 * Help hints for the local AZTrades shell.
 * Stored only in this browser. A missing choice stays on.
 * Nothing here is a tenant write.
 */

export const DESK_HINT_KEY = "trades-desk-hints";

export interface DeskHintPrefs {
  v: 1;
  on: boolean;
}

export function defaultDeskHints(): DeskHintPrefs {
  return { v: 1, on: true };
}

export function parseDeskHints(raw: string | null): DeskHintPrefs {
  if (!raw) return defaultDeskHints();
  try {
    const parsed = JSON.parse(raw) as { v?: unknown; on?: unknown };
    if (!parsed || parsed.v !== 1 || typeof parsed.on !== "boolean") return defaultDeskHints();
    return { v: 1, on: parsed.on };
  } catch {
    return defaultDeskHints();
  }
}

export const DESK_ROLE_KEY = "trades-desk-role";

export const DESK_ROLES = ["field", "office", "management"] as const;
export type DeskRole = (typeof DESK_ROLES)[number];

export function parseDeskRole(raw: string | null): DeskRole {
  if (raw === "field" || raw === "office" || raw === "management") return raw;
  return "office";
}

/** Browser script. Same rules as parseDeskHints / parseDeskRole. */
export function deskHintClientScript(): string {
  return `
    const DESK_HINT_KEY = "trades-desk-hints";
    const DESK_ROLE_KEY = "trades-desk-role";
    function parseDeskHints(raw) {
      if (!raw) return { v: 1, on: true };
      try {
        const parsed = JSON.parse(raw);
        if (!parsed || parsed.v !== 1 || typeof parsed.on !== "boolean") return { v: 1, on: true };
        return { v: 1, on: parsed.on };
      } catch (error) {
        return { v: 1, on: true };
      }
    }
    function parseDeskRole(raw) {
      if (raw === "field" || raw === "office" || raw === "management") return raw;
      return "office";
    }
    function readHints() {
      try { return parseDeskHints(localStorage.getItem(DESK_HINT_KEY)); } catch (error) { return { v: 1, on: true }; }
    }
    function readRole() {
      try { return parseDeskRole(localStorage.getItem(DESK_ROLE_KEY)); } catch (error) { return "office"; }
    }
    function applyHints() {
      const on = readHints().on;
      document.documentElement.dataset.hints = on ? "on" : "off";
      const box = document.getElementById("hint-toggle");
      if (box) box.checked = on;
    }
    function applyRole() {
      const role = readRole();
      document.body.dataset.azRole = role;
      document.querySelectorAll("[data-az-role]").forEach((node) => {
        const id = node.getAttribute("data-az-role");
        if (id) node.setAttribute("aria-pressed", id === role ? "true" : "false");
      });
    }
    document.getElementById("hint-toggle")?.addEventListener("change", (event) => {
      const box = event.target;
      if (!box || box.type !== "checkbox") return;
      try { localStorage.setItem(DESK_HINT_KEY, JSON.stringify({ v: 1, on: box.checked })); } catch (error) {}
      applyHints();
    });
    document.body.addEventListener("click", (event) => {
      const button = event.target && event.target.closest ? event.target.closest("[data-az-role]") : null;
      if (!button) return;
      const role = button.getAttribute("data-az-role");
      if (role !== "field" && role !== "office" && role !== "management") return;
      try { localStorage.setItem(DESK_ROLE_KEY, role); } catch (error) {}
      applyRole();
    });
    applyHints();
    applyRole();
    window.__applyAztradesChrome = function () { applyHints(); applyRole(); };
  `;
}
