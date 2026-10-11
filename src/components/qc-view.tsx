import { useState } from "react";
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { FEATURES, latestReport } from "@/lib/capbim/engine";
import { accuracyText, cloudCsv, gltfOf, ifcOf, jobYaml } from "@/lib/capbim/exports";
import { useCapbim } from "@/lib/capbim/store";
import { STAGES } from "@/lib/capbim/stages";
import type { Job } from "@/lib/capbim/types";
import { Btn, StatusPill, Stat } from "./ui";

export function QcView({ job }: { job: Job }) {
  const sign = useCapbim((s) => s.sign);
  const [name, setName] = useState(job.signedBy ?? "");
  const [note, setNote] = useState("");
  const report = latestReport(job, "11");
  const rows =
    job.unsealed && job.residuals
      ? job.truths.map((t, i) => ({
          id: t.id,
          mm: Math.round(Math.abs(job.residuals?.[i] ?? 0) * 10) / 10,
        }))
      : [];
  const canSign = Boolean(report && (report.status === "pass" || report.status === "warn") && !job.degraded && !job.signedBy);

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <section className="grid gap-4 md:grid-cols-4">
        <Stat label="Stages with a report" value={`${job.reports.length} / ${STAGES.length}`} />
        <Stat label="Blind file" value={job.sealedHash ? job.sealedHash.slice(0, 8) : "not sealed"} hint={job.unsealed ? "Unsealed at stage 11" : "Sealed until validation"} />
        <Stat label="Statement" value={job.signedBy ? "Signed" : job.degraded ? "Blocked" : report?.status ?? "Held"} hint={job.signedBy ?? "Synthetic only"} />
        <Stat label="Forced stages" value={job.forcedStages.length ? job.forcedStages.join(", ") : "None"} />
      </section>

      <section className="overflow-hidden rounded-md border border-line">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-muted">
            <tr className="border-b border-line bg-surface">
              <th className="px-3 py-2 font-normal">Stage</th>
              <th className="px-3 py-2 font-normal">Result</th>
              <th className="hidden px-3 py-2 font-normal md:table-cell">Diagnosis</th>
            </tr>
          </thead>
          <tbody>
            {STAGES.map((stage) => {
              const row = latestReport(job, stage.id);
              return (
                <tr key={stage.id} className="border-b border-line last:border-b-0">
                  <td className="px-3 py-2">
                    <span className="num text-brass">{stage.id}</span> {stage.name}
                  </td>
                  <td className="px-3 py-2">
                    <StatusPill status={row?.status} />
                  </td>
                  <td className="hidden px-3 py-2 text-muted md:table-cell">{row?.diagnosis ?? "Not run"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="rounded-md border border-line bg-surface p-4">
        <h2 className="text-sm font-medium">Blind residuals</h2>
        {rows.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Still sealed. Stage 11 is the only place these numbers appear, and nothing is refit after that.</p>
        ) : (
          <div className="mt-3 h-48 text-brass">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows}>
                <XAxis dataKey="id" tick={{ fill: "var(--color-muted)", fontSize: 11 }} interval={0} angle={-40} height={48} textAnchor="end" />
                <YAxis tick={{ fill: "var(--color-muted)", fontSize: 11 }} unit=" mm" width={56} />
                <Bar dataKey="mm" fill="currentColor" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <section className="rounded-md border border-line p-4">
        <h2 className="text-sm font-medium">Gate G3</h2>
        {job.signedBy ? (
          <p className="mt-2 text-sm">
            Signed by {job.signedBy}. This is a rehearsal statement, not a survey certificate.
          </p>
        ) : canSign ? (
          <form
            className="mt-3 flex flex-col gap-3 md:flex-row md:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              const ok = sign(job.id, name);
              setNote(ok ? "Signed." : "Not signed.");
            }}
          >
            <label className="flex flex-1 flex-col gap-1 text-sm">
              <span className="text-muted">Name on the statement</span>
              <input value={name} onChange={(e) => setName(e.target.value)} required data-testid="sign-name" />
            </label>
            <Btn kind="primary" type="submit" data-testid="sign-job">
              Sign
            </Btn>
          </form>
        ) : (
          <p className="mt-2 text-sm text-muted">
            {job.degraded
              ? "A waiver or a forced stage blocks the signature."
              : report?.status === "fail"
                ? "The class gate failed. Do not sign, and do not retune."
                : "Sign is available only after stage 11 passes or warns."}
          </p>
        )}
        {note ? <p className="mt-2 text-sm text-brass">{note}</p> : null}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium">Downloads</h2>
        <div className="flex flex-wrap gap-2">
          <Btn onClick={() => save(`${job.id}-job.yaml`, jobYaml(job.spec, job.id), "text/yaml")}>job.yaml</Btn>
          <Btn onClick={() => save(`${job.id}.ifc`, ifcOf(job.spec, job.id), "application/x-step")}>IFC</Btn>
          <Btn onClick={() => save(`${job.id}.gltf`, gltfOf(job.spec), "model/gltf+json")}>glTF</Btn>
          <Btn onClick={() => save(`${job.id}-cloud.csv`, cloudCsv(job.spec), "text/csv")}>Point sample</Btn>
          <Btn onClick={() => save(`${job.id}-reports.json`, JSON.stringify(job.reports, null, 2), "application/json")}>Stage reports</Btn>
          <Btn onClick={() => save(`${job.id}-accuracy.txt`, accuracyText(job), "text/plain")}>Accuracy statement</Btn>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium">Delivery checklist</h2>
        <ul className="grid gap-2 md:grid-cols-2">
          {FEATURES.map((line) => (
            <li key={line} className="rounded-md border border-line px-3 py-2 text-sm">
              {line}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function save(name: string, body: string, type: string) {
  const blob = new Blob([body], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
