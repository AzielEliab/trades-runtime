function esc(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export interface JobsPoint {
  t: string;
  jobs: number;
  completed: number;
}

export interface CapacityPoint {
  t: string;
  booked: number;
  open: number | null;
}

function dayLabel(isoDay: string): string {
  return isoDay.length >= 10 ? isoDay.slice(5, 10) : isoDay;
}

export function jobsChart(points: JobsPoint[]): string {
  const width = 640;
  const height = 220;
  const padL = 36;
  const padR = 12;
  const padT = 16;
  const padB = 32;
  if (!points.length) {
    return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Jobs over time"><rect width="100%" height="100%" fill="#0d0f0c" rx="12"/><text x="24" y="110" fill="#a39b8c" font-size="14" font-family="Segoe UI, Helvetica, sans-serif">No job rows in the local admit set.</text></svg>`;
  }
  const max = Math.max(1, ...points.map((point) => Math.max(point.jobs, point.completed)));
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;
  const xAt = (index: number) => padL + (points.length === 1 ? innerW / 2 : (index / (points.length - 1)) * innerW);
  const yAt = (value: number) => padT + innerH - (value / max) * innerH;
  const path = (key: "jobs" | "completed") =>
    points.map((point, index) => `${index === 0 ? "M" : "L"} ${xAt(index).toFixed(1)} ${yAt(point[key]).toFixed(1)}`).join(" ");
  const labels = points
    .map((point, index) => `<text x="${xAt(index).toFixed(1)}" y="${height - 10}" text-anchor="middle" fill="#a39b8c" font-size="11" font-family="ui-monospace, Menlo, Consolas, monospace">${esc(dayLabel(point.t))}</text>`)
    .join("");
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Jobs and completed jobs over time">
    <rect width="100%" height="100%" fill="#0d0f0c" rx="12"/>
    <path d="${path("jobs")}" fill="none" stroke="#c47a3a" stroke-width="2.4"/>
    <path d="${path("completed")}" fill="none" stroke="#8fb56a" stroke-width="2.4"/>
    ${points.map((point, index) => `<circle cx="${xAt(index).toFixed(1)}" cy="${yAt(point.jobs).toFixed(1)}" r="3.2" fill="#c47a3a"/><circle cx="${xAt(index).toFixed(1)}" cy="${yAt(point.completed).toFixed(1)}" r="3.2" fill="#8fb56a"/>`).join("")}
    ${labels}
  </svg>`;
}

export function capacityChart(points: CapacityPoint[]): string {
  const width = 640;
  const height = 220;
  if (!points.length) {
    return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Capacity"><rect width="100%" height="100%" fill="#0d0f0c" rx="12"/><text x="24" y="110" fill="#a39b8c" font-size="14" font-family="Segoe UI, Helvetica, sans-serif">Capacity chart waits for a local mission sample.</text></svg>`;
  }
  const max = Math.max(1, ...points.map((point) => point.booked + (point.open ?? 0)));
  const slot = width / points.length;
  const bars = points
    .map((point, index) => {
      const bookedH = (point.booked / max) * 150;
      const openH = ((point.open ?? 0) / max) * 150;
      const x = index * slot + slot * 0.22;
      const barW = Math.max(8, slot * 0.22);
      const base = 176;
      const booked = `<rect x="${x.toFixed(1)}" y="${(base - bookedH).toFixed(1)}" width="${barW.toFixed(1)}" height="${bookedH.toFixed(1)}" fill="#c47a3a" rx="3"/>`;
      const open =
        point.open == null
          ? ""
          : `<rect x="${(x + barW + 4).toFixed(1)}" y="${(base - openH).toFixed(1)}" width="${barW.toFixed(1)}" height="${openH.toFixed(1)}" fill="#8fb56a" rx="3"/>`;
      const label = `<text x="${(x + barW).toFixed(1)}" y="198" text-anchor="middle" fill="#a39b8c" font-size="11" font-family="ui-monospace, Menlo, Consolas, monospace">${esc(dayLabel(point.t))}</text>`;
      return booked + open + label;
    })
    .join("");
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Booked load and open capacity"><rect width="100%" height="100%" fill="#0d0f0c" rx="12"/>${bars}</svg>`;
}
