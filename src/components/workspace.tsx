import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useJob } from "@/lib/capbim/store";
import type { TabId } from "@/lib/capbim/types";
import { ModelView } from "./model-view";
import { PipelineView } from "./pipeline-view";
import { PlanView } from "./plan-view";
import { QcView } from "./qc-view";
import { ReviewView } from "./review-view";

const TABS: { id: TabId; label: string }[] = [
  { id: "plan", label: "Plan" },
  { id: "pipeline", label: "Pipeline" },
  { id: "model", label: "Model" },
  { id: "review", label: "Review" },
  { id: "qc", label: "QC" },
];

export function Workspace({ jobId }: { jobId: string }) {
  const job = useJob(jobId);
  const [tab, setTab] = useState<TabId>("plan");
  if (!job) {
    return (
      <main className="mx-auto max-w-lg px-4 py-16">
        <h1 className="text-2xl font-medium">That job is not on this desk</h1>
        <Link to="/" className="btn btn-primary mt-4">
          Back to jobs
        </Link>
      </main>
    );
  }
  const openReviews = job.reviews.filter((r) => !r.decision).length;
  return (
    <main className="flex min-h-dvh flex-col">
      <header className="border-b border-line bg-surface">
        <div className="flex flex-col gap-3 px-4 py-3 md:flex-row md:items-end md:justify-between md:px-6">
          <div className="min-w-0">
            <Link to="/" className="text-xs tracking-widest text-brass">
              CAPBIM
            </Link>
            <h1 className="truncate text-2xl font-medium">{job.spec.name}</h1>
            <p className="text-sm text-muted">
              {job.spec.site} · class {job.spec.spaceClass} · {job.spec.lengthM}×{job.spec.widthM}×{job.spec.heightM} m
              {job.signedBy ? ` · signed ${job.signedBy}` : job.degraded ? " · degraded, cannot sign" : ""}
            </p>
          </div>
          <nav className="flex gap-2 overflow-x-auto pb-1" aria-label="Job sections">
            {TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                data-testid={`tab-${item.id}`}
                className={`btn shrink-0 ${tab === item.id ? "btn-primary" : ""}`}
                onClick={() => setTab(item.id)}
              >
                {item.label}
                {item.id === "review" && openReviews > 0 ? ` ${openReviews}` : ""}
              </button>
            ))}
          </nav>
        </div>
      </header>
      {tab === "plan" ? <PlanView job={job} /> : null}
      {tab === "pipeline" ? <PipelineView job={job} onReview={() => setTab("review")} onQc={() => setTab("qc")} /> : null}
      {tab === "model" ? <ModelView job={job} /> : null}
      {tab === "review" ? <ReviewView job={job} /> : null}
      {tab === "qc" ? <QcView job={job} /> : null}
    </main>
  );
}
