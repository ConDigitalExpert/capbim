import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { StageReport } from "@/lib/capbim/types";

export function Btn({
  kind = "ghost",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { kind?: "primary" | "ghost" | "danger" }) {
  const tone = kind === "primary" ? "btn-primary" : kind === "danger" ? "btn-danger" : "";
  return <button className={`btn ${tone} ${className}`} {...props} />;
}

export function StatusPill({ status }: { status?: StageReport["status"] | "open" | "sealed" }) {
  const label = status ?? "open";
  const tone =
    label === "fail" || label === "blocked"
      ? "border-brick text-brick"
      : label === "pass"
        ? "border-brass text-brass"
        : "border-line text-muted";
  return <span className={`chip ${tone}`}>{label}</span>;
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-muted">{label}</span>
      {children}
    </label>
  );
}

export function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted">{label}</div>
      <div className="num text-xl text-fg">{value}</div>
      {hint ? <div className="text-xs text-muted">{hint}</div> : null}
    </div>
  );
}
