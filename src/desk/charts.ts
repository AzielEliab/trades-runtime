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

function emptyChart(label: string, message: string): string {
  return `<svg viewBox="0 0 640 220" role="img" aria-label="${esc(label)}"><rect class="chart-bg" width="100%" height="100%" rx="12"/><text class="chart-empty" x="28" y="114">${esc(message)}</text></svg>`;
}

export function jobsChart(points: JobsPoint[]): string {
  const width = 640;
  const height = 228;
  const padL = 40;
  const padR = 16;
  const padT = 18;
  const padB = 34;
  if (!points.length) {
    return emptyChart("Jobs over time", "No job rows in the local admit set.");
  }
  const max = Math.max(1, ...points.map((point) => Math.max(point.jobs, point.completed)));
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;
  const xAt = (index: number) => padL + (points.length === 1 ? innerW / 2 : (index / (points.length - 1)) * innerW);
  const yAt = (value: number) => padT + innerH - (value / max) * innerH;
  const line = (key: "jobs" | "completed") =>
    points.map((point, index) => `${index === 0 ? "M" : "L"} ${xAt(index).toFixed(1)} ${yAt(point[key]).toFixed(1)}`).join(" ");
  const area = (key: "jobs" | "completed") => {
    const base = yAt(0).toFixed(1);
    return `${line(key)} L ${xAt(points.length - 1).toFixed(1)} ${base} L ${xAt(0).toFixed(1)} ${base} Z`;
  };
  const grid = [0, 0.5, 1]
    .map((fraction) => {
      const y = yAt(max * fraction).toFixed(1);
      return `<line class="grid" x1="${padL}" x2="${width - padR}" y1="${y}" y2="${y}"/>`;
    })
    .join("");
  const labels = points
    .map(
      (point, index) =>
        `<text class="chart-label" x="${xAt(index).toFixed(1)}" y="${height - 12}" text-anchor="middle">${esc(dayLabel(point.t))}</text>`
    )
    .join("");
  const dots = points
    .map(
      (point, index) =>
        `<circle class="series-jobs" cx="${xAt(index).toFixed(1)}" cy="${yAt(point.jobs).toFixed(1)}" r="3.4"/><circle class="series-done" cx="${xAt(index).toFixed(1)}" cy="${yAt(point.completed).toFixed(1)}" r="3.4"/>`
    )
    .join("");
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Jobs and completed jobs over time">
    <rect class="chart-bg" width="100%" height="100%" rx="12"/>
    ${grid}
    <text class="chart-label" x="8" y="${(yAt(max) + 4).toFixed(1)}">${max}</text>
    <text class="chart-label" x="8" y="${(yAt(0) - 2).toFixed(1)}">0</text>
    <path class="area-jobs" d="${area("jobs")}"/>
    <path class="area-done" d="${area("completed")}"/>
    <path class="series-jobs" d="${line("jobs")}" fill="none"/>
    <path class="series-done" d="${line("completed")}" fill="none"/>
    ${dots}
    ${labels}
  </svg>`;
}

export function capacityChart(points: CapacityPoint[]): string {
  const width = 640;
  const height = 228;
  if (!points.length) {
    return emptyChart("Capacity", "Capacity chart waits for a local mission sample.");
  }
  const max = Math.max(1, ...points.map((point) => point.booked + (point.open ?? 0)));
  const slot = width / points.length;
  const plotTop = 28;
  const plotBase = 178;
  const plotH = plotBase - plotTop;
  const grid = [0, 0.5, 1]
    .map((fraction) => {
      const y = (plotBase - fraction * plotH).toFixed(1);
      return `<line class="grid" x1="36" x2="${width - 12}" y1="${y}" y2="${y}"/>`;
    })
    .join("");
  const bars = points
    .map((point, index) => {
      const bookedH = (point.booked / max) * plotH;
      const openH = ((point.open ?? 0) / max) * plotH;
      const x = index * slot + slot * 0.22;
      const barW = Math.max(8, slot * 0.22);
      const booked = `<rect class="bar-jobs" x="${x.toFixed(1)}" y="${(plotBase - bookedH).toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(0, bookedH).toFixed(1)}" rx="3"/>`;
      const open =
        point.open == null
          ? ""
          : `<rect class="bar-open" x="${(x + barW + 4).toFixed(1)}" y="${(plotBase - openH).toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(0, openH).toFixed(1)}" rx="3"/>`;
      const label = `<text class="chart-label" x="${(x + barW).toFixed(1)}" y="204" text-anchor="middle">${esc(dayLabel(point.t))}</text>`;
      return booked + open + label;
    })
    .join("");
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Booked load and open capacity"><rect class="chart-bg" width="100%" height="100%" rx="12"/>${grid}<text class="chart-label" x="8" y="36">${max}</text><text class="chart-label" x="8" y="176">0</text>${bars}</svg>`;
}
