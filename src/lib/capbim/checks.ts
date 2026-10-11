import type { Operator, Severity, StageCheck } from "./types";

export function check(
  id: string,
  metric: string,
  operator: Operator,
  threshold: number | boolean,
  value: number | boolean | null,
  severity: Severity,
  src: string,
  note?: string,
): StageCheck {
  if (value === null) {
    return { id, metric, operator, threshold, value, result: "n/a", severity, threshold_source: src, note };
  }
  const ok =
    typeof value === "boolean" || typeof threshold === "boolean"
      ? value === threshold
      : operator === "<="
        ? value <= threshold
        : operator === "<"
          ? value < threshold
          : operator === ">="
            ? value >= threshold
            : operator === ">"
              ? value > threshold
              : value === threshold;
  return {
    id,
    metric,
    operator,
    threshold,
    value,
    result: ok ? "pass" : severity === "blocking" ? "fail" : "warn",
    severity,
    threshold_source: src,
    note,
  };
}

export function statusOf(checks: StageCheck[], blockedIf?: boolean): "pass" | "warn" | "fail" | "blocked" {
  const blocking = checks.filter((c) => c.result === "fail");
  if (blocking.length && blockedIf) return "blocked";
  if (blocking.length) return "fail";
  if (checks.some((c) => c.result === "warn")) return "warn";
  return "pass";
}

export function diagnosisOf(checks: StageCheck[]): string {
  const bad = checks.filter((c) => c.result === "fail" || c.result === "warn");
  if (!bad.length) return "Every recorded check is inside its threshold. Thresholds were not edited.";
  return bad
    .map((c) => {
      const bit = `${c.metric} is ${String(c.value)} (need ${c.operator} ${String(c.threshold)})`;
      return c.result === "warn" ? `${bit}, warning` : bit;
    })
    .join(". ")
    .concat(".");
}
