/**
 * Operator choices for which desk pieces stay visible.
 * Stored only in this browser. A missing choice stays on.
 * Nothing here is a tenant write.
 */

export const DESK_VIEW_KEY = "trades-desk-view";

export interface DeskViewPrefs {
  v: 1;
  off: string[];
}

export function emptyDeskView(): DeskViewPrefs {
  return { v: 1, off: [] };
}

export function parseDeskView(raw: string | null): DeskViewPrefs {
  if (!raw) return emptyDeskView();
  try {
    const parsed = JSON.parse(raw) as { v?: unknown; off?: unknown };
    if (!parsed || parsed.v !== 1 || !Array.isArray(parsed.off)) return emptyDeskView();
    const off: string[] = [];
    for (const item of parsed.off) {
      if (typeof item !== "string" || item.length === 0 || item.length >= 120) continue;
      if (!off.includes(item)) off.push(item);
    }
    return { v: 1, off };
  } catch {
    return emptyDeskView();
  }
}

export function withDeskToggle(prefs: DeskViewPrefs, id: string, on: boolean): DeskViewPrefs {
  const off = prefs.off.filter((item) => item !== id);
  if (!on) off.push(id);
  return { v: 1, off };
}

export function deskViewIsOn(prefs: DeskViewPrefs, id: string): boolean {
  return !prefs.off.includes(id);
}

/** Browser script. Same rules as parseDeskView / withDeskToggle. */
export function deskViewClientScript(): string {
  return `
    const DESK_VIEW_KEY = "trades-desk-view";
    function parseDeskView(raw) {
      if (!raw) return { v: 1, off: [] };
      try {
        const parsed = JSON.parse(raw);
        if (!parsed || parsed.v !== 1 || !Array.isArray(parsed.off)) return { v: 1, off: [] };
        const off = [];
        for (const item of parsed.off) {
          if (typeof item === "string" && item.length > 0 && item.length < 120 && off.indexOf(item) === -1) off.push(item);
        }
        return { v: 1, off: off };
      } catch (error) {
        return { v: 1, off: [] };
      }
    }
    function withDeskToggle(prefs, id, on) {
      const off = prefs.off.filter((item) => item !== id);
      if (!on) off.push(id);
      return { v: 1, off: off };
    }
    function readDeskView() {
      try { return parseDeskView(localStorage.getItem(DESK_VIEW_KEY)); } catch (error) { return { v: 1, off: [] }; }
    }
    function saveDeskView(prefs) {
      try { localStorage.setItem(DESK_VIEW_KEY, JSON.stringify(prefs)); } catch (error) {}
    }
    function applyDeskView() {
      const prefs = readDeskView();
      document.querySelectorAll("[data-view]").forEach((node) => {
        const id = node.getAttribute("data-view");
        node.hidden = !!id && prefs.off.indexOf(id) !== -1;
      });
      document.querySelectorAll("[data-toggle]").forEach((box) => {
        const id = box.getAttribute("data-toggle");
        box.checked = !id || prefs.off.indexOf(id) === -1;
      });
    }
    document.getElementById("desk-view")?.addEventListener("change", (event) => {
      const box = event.target && event.target.closest ? event.target.closest("[data-toggle]") : null;
      if (!box || box.type !== "checkbox") return;
      const id = box.getAttribute("data-toggle");
      if (!id) return;
      saveDeskView(withDeskToggle(readDeskView(), id, box.checked));
      applyDeskView();
    });
    applyDeskView();
    window.__applyDeskView = applyDeskView;
  `;
}
