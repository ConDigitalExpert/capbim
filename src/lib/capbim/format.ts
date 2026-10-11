export function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function r3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function formatValue(metric: string, value: number | boolean | null): string {
  if (value === null) return "—";
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (metric.includes("fraction") || metric.endsWith("_pass")) return `${(value * 100).toFixed(1)}%`;
  if (metric.includes("_px")) return value.toFixed(2);
  if (metric.includes("_db")) return value.toFixed(1);
  if (metric.includes("_m2")) return value.toFixed(2);
  if (metric.includes("_s") || metric === "shutter_s" || metric === "first_load_s") return value.toFixed(3);
  if (Number.isInteger(value) && Math.abs(value) >= 2) return String(value);
  return value.toFixed(2);
}

export function mm(n: number, digits = 1): string {
  return `${n.toFixed(digits)} mm`;
}
