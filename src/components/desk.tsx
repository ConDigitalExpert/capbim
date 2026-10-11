import { Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { predictionFor } from "@/lib/capbim/engine";
import { blankSpec, CLASS_PRESET, useCapbim } from "@/lib/capbim/store";
import { SPACE } from "@/lib/capbim/thresholds";
import type { JobSpec, SpaceClass } from "@/lib/capbim/types";
import { Btn, Field } from "./ui";

export function Desk() {
  const jobs = useCapbim((s) => s.jobs);
  const create = useCapbim((s) => s.create);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<JobSpec>(() => blankSpec({ name: "Room", site: "Site" }));

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-6 md:px-8 md:py-10">
      <header className="flex flex-col gap-3 border-b border-line pb-6 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs tracking-widest text-brass">CAPBIM</p>
          <h1 className="mt-1 text-3xl font-medium">Capture to BIM</h1>
          <p className="mt-2 max-w-xl text-muted">
            Plan the photographs, run every gate, and measure the model. The predictor is real. Later stages rehearse the QC rules on a parametric room — not a survey.
          </p>
        </div>
        <Btn kind="primary" onClick={() => setOpen((v) => !v)}>
          {open ? "Close" : "New job"}
        </Btn>
      </header>

      {open ? (
        <form
          className="grid gap-4 rounded-md border border-line bg-surface p-4 md:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            const id = create(draft);
            void navigate({ to: "/job/$jobId", params: { jobId: id } });
          }}
        >
          <Field label="Name">
            <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} required />
          </Field>
          <Field label="Site">
            <input value={draft.site} onChange={(e) => setDraft({ ...draft, site: e.target.value })} required />
          </Field>
          <div className="flex flex-wrap gap-2 md:col-span-2">
            {(["S", "M", "L"] as SpaceClass[]).map((c) => (
              <Btn
                key={c}
                type="button"
                kind={draft.spaceClass === c ? "primary" : "ghost"}
                onClick={() => setDraft(blankSpec({ ...draft, ...CLASS_PRESET[c], name: draft.name, site: draft.site }))}
              >
                {c} · {SPACE[c].name}
              </Btn>
            ))}
          </div>
          <Field label="Length m">
            <input type="number" min={2} step={0.1} value={draft.lengthM} onChange={(e) => setDraft({ ...draft, lengthM: Number(e.target.value) })} />
          </Field>
          <Field label="Width m">
            <input type="number" min={2} step={0.1} value={draft.widthM} onChange={(e) => setDraft({ ...draft, widthM: Number(e.target.value) })} />
          </Field>
          <div className="md:col-span-2">
            <Btn kind="primary" type="submit">
              Open the plan
            </Btn>
          </div>
        </form>
      ) : null}

      <section className="overflow-hidden rounded-md border border-line">
        <div className="grid grid-cols-[1.4fr_0.6fr_0.8fr] gap-2 border-b border-line bg-surface px-4 py-2 text-xs text-muted md:grid-cols-[1.6fr_0.5fr_0.8fr_0.8fr]">
          <span>Job</span>
          <span>Class</span>
          <span className="hidden md:block">GSD at walls</span>
          <span>State</span>
        </div>
        {jobs.map((job) => (
          <JobRow key={job.id} id={job.id} />
        ))}
      </section>
      <p className="text-sm text-muted">The model proposes. The measurement disposes. A waived gate cannot be signed.</p>
    </main>
  );
}

function JobRow({ id }: { id: string }) {
  const job = useCapbim((s) => s.jobs.find((j) => j.id === id));
  const pred = useMemo(() => (job ? predictionFor(job.spec) : null), [job]);
  if (!job || !pred) return null;
  const last = job.reports[job.reports.length - 1];
  const state = job.signedBy ? "Signed" : job.unsealed ? "Unsealed" : job.degraded ? "Degraded" : last ? `Stage ${last.stage_id} ${last.status}` : "Not run";
  return (
    <Link
      to="/job/$jobId"
      params={{ jobId: job.id }}
      className="grid grid-cols-[1.4fr_0.6fr_0.8fr] items-center gap-2 border-b border-line px-4 py-3 last:border-b-0 hover:bg-surface md:grid-cols-[1.6fr_0.5fr_0.8fr_0.8fr]"
    >
      <span>
        <span className="block font-medium">{job.spec.name}</span>
        <span className="text-sm text-muted">
          {job.spec.site} · {job.spec.lengthM}×{job.spec.widthM}×{job.spec.heightM} m
        </span>
      </span>
      <span className="num text-brass">{job.spec.spaceClass}</span>
      <span className="num hidden text-sm md:block">{pred.gsd_mm_at_walls.toFixed(2)} mm</span>
      <span className="text-sm text-muted">{state}</span>
    </Link>
  );
}
