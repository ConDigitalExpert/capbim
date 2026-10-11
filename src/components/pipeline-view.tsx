import { useState } from "react";
import { isStale, latestReport, nextAction, surveyOnlyFailure } from "@/lib/capbim/engine";
import { STAGES } from "@/lib/capbim/stages";
import { useCapbim } from "@/lib/capbim/store";
import type { Job } from "@/lib/capbim/types";
import { CheckTable } from "./checks";
import { Btn, StatusPill } from "./ui";

export function PipelineView({ job, onReview, onQc }: { job: Job; onReview: () => void; onQc: () => void }) {
  const runStage = useCapbim((s) => s.runStage);
  const retryStage = useCapbim((s) => s.retryStage);
  const approveGate = useCapbim((s) => s.approveGate);
  const forceStage = useCapbim((s) => s.forceStage);
  const resetRun = useCapbim((s) => s.resetRun);
  const patchSpec = useCapbim((s) => s.patchSpec);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("Named decision");
  const [open, setOpen] = useState<string | null>(null);
  const action = nextAction(job);
  const stale = isStale(job);

  async function runToGate() {
    setBusy(true);
    try {
      for (let i = 0; i < 24; i++) {
        const current = useCapbim.getState().jobs.find((j) => j.id === job.id);
        if (!current) break;
        const step = nextAction(current);
        if (step.type === "run") await useCapbim.getState().runStage(job.id, step.stageId);
        else if (step.type === "retry") await useCapbim.getState().retryStage(job.id, step.stageId);
        else break;
        await new Promise((r) => setTimeout(r, 220));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-col gap-3 rounded-md border border-line bg-surface p-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-medium">Pipeline</h2>
          <p className="text-sm text-muted">
            {action.type === "done"
              ? "Every stage has a result."
              : action.type === "stale"
                ? "The plan changed after this run. Reset before the next stage."
                : action.type === "stuck"
                  ? `Stage ${action.stageId} is still outside the gate.`
                  : action.label}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {stale ? (
            <Btn kind="primary" onClick={() => resetRun(job.id)}>
              Reset run
            </Btn>
          ) : null}
          {action.type === "run" ? (
            <Btn kind="primary" disabled={busy || job.unsealed} onClick={() => void runStage(job.id, action.stageId).then(() => undefined)} data-testid="stage-action">
              {busy ? "Running" : action.label}
            </Btn>
          ) : null}
          {action.type === "retry" ? (
            <Btn kind="primary" disabled={busy || job.unsealed} onClick={() => void retryStage(job.id, action.stageId)} data-testid="stage-action">
              {action.label}
            </Btn>
          ) : null}
          {(action.type === "run" || action.type === "retry") && !stale ? (
            <Btn disabled={busy || job.unsealed} onClick={() => void runToGate()} data-testid="run-to-gate">
              Run to next gate
            </Btn>
          ) : null}
          {job.reports.length > 0 && !job.unsealed ? (
            <Btn onClick={() => resetRun(job.id)}>Reset</Btn>
          ) : null}
        </div>
      </div>

      {action.type === "gate" && action.gate === "g0" ? (
        <div className="rounded-md border border-brass p-4">
          <h3 className="font-medium">Gate G0 — approve the plan</h3>
          <p className="mt-1 text-sm text-muted">Five minutes. Survey control for a hall cannot be waived by the runner.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {surveyOnlyFailure(job) ? (
              <>
                <Btn kind="primary" onClick={() => patchSpec(job.id, { surveyControl: true })}>
                  Add survey control
                </Btn>
                <Btn
                  kind="danger"
                  onClick={() => {
                    approveGate(job.id, "g0", note || "Survey waived", true);
                  }}
                >
                  Waive survey
                </Btn>
              </>
            ) : (
              <Btn kind="primary" disabled={latestReport(job, "00")?.status === "fail"} onClick={() => approveGate(job.id, "g0", note || "Plan approved")} data-testid="approve-g0">
                Approve plan
              </Btn>
            )}
          </div>
          {surveyOnlyFailure(job) ? <p className="mt-2 text-sm text-muted">Adding survey changes the plan. Reset the run, then start again.</p> : null}
        </div>
      ) : null}

      {action.type === "gate" && action.gate === "g3" ? (
        <div className="rounded-md border border-brass p-4">
          <h3 className="font-medium">Gate G3 — sign or hold</h3>
          <p className="mt-1 text-sm text-muted">The checks are unsealed. The statement is on the QC desk. A degraded job cannot be signed.</p>
          <Btn kind="primary" className="mt-3" onClick={onQc}>
            Open the statement
          </Btn>
        </div>
      ) : null}
      {action.type === "gate" && action.gate === "g2" ? (
        <div className="rounded-md border border-brass p-4">
          <h3 className="font-medium">Gate G2 — attribute review</h3>
          <p className="mt-1 text-sm text-muted">Opus and Sol disagreed. The queue has to be empty before BIM authoring.</p>
          <Btn kind="primary" className="mt-3" onClick={onReview}>
            Open the queue
          </Btn>
        </div>
      ) : null}

      {action.type === "stuck" && action.stageId !== "11" ? (
        <div className="rounded-md border border-brick p-4">
          <h3 className="font-medium">Ladder exhausted</h3>
          <p className="mt-1 text-sm text-muted">Forcing the stage marks the job degraded. It cannot be signed.</p>
          <label className="mt-3 flex flex-col gap-1 text-sm">
            <span className="text-muted">Note</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <Btn kind="danger" className="mt-3" onClick={() => forceStage(job.id, action.stageId, note)}>
            Continue without a pass
          </Btn>
        </div>
      ) : null}

      <ol className="flex flex-col">
        {STAGES.map((stage) => {
          const report = latestReport(job, stage.id);
          const expanded = open === stage.id;
          return (
            <li key={stage.id} className="border-b border-line">
              <button
                type="button"
                className="flex w-full items-center gap-3 py-3 text-left"
                onClick={() => setOpen(expanded ? null : stage.id)}
              >
                <span className="num w-8 text-brass">{stage.id}</span>
                <span className="flex-1">
                  <span className="block">{stage.name}</span>
                  <span className="text-xs text-muted">{report ? report.diagnosis : stage.yaml}</span>
                </span>
                <StatusPill status={report?.status} />
              </button>
              {expanded && report ? (
                <div className="pb-4 pl-11">
                  <CheckTable checks={report.checks} />
                  <p className="mt-2 text-xs text-muted">Attempt {report.attempt}. {report.software.map((s) => s.name).join(" · ")}</p>
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>

      <section className="rounded-md border border-line p-4">
        <h3 className="text-sm font-medium">Run log</h3>
        <ul className="mt-2 flex max-h-48 flex-col gap-1 overflow-auto text-sm text-muted">
          {job.log.map((line, i) => (
            <li key={`${line.at}-${i}`} className="num">
              {line.text}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
