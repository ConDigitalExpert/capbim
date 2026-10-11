import { useMemo } from "react";
import { buildChecks, imageCount, predictionFor } from "@/lib/capbim/engine";
import { CAMERAS } from "@/lib/capbim/predict";
import { barsOf, markersOf, roomOf } from "@/lib/capbim/room";
import { blankSpec, CLASS_PRESET, useCapbim } from "@/lib/capbim/store";
import { byClass, THRESHOLDS } from "@/lib/capbim/thresholds";
import type { CameraId, Job, SpaceClass } from "@/lib/capbim/types";
import { CheckTable } from "./checks";
import { Btn, Field, Stat } from "./ui";

const FAULTS: { key: keyof Job["spec"]["faults"]; label: string }[] = [
  { key: "stabilisationOn", label: "Stabilisation left on" },
  { key: "slowShutter", label: "Shutter slower than 1/250" },
  { key: "plainWalls", label: "Plain painted walls" },
  { key: "barIdMismatch", label: "A bar ID does not match its certificate" },
  { key: "lowImageCount", label: "Short capture" },
];

export function PlanView({ job }: { job: Job }) {
  const patchSpec = useCapbim((s) => s.patchSpec);
  const spec = job.spec;
  const locked = job.unsealed;
  const pred = useMemo(() => predictionFor(spec), [spec]);
  const preview = useMemo(() => {
    const ghost: Job = { ...job, reviews: job.reviews };
    return {
      plan: buildChecks(spec, "00", pred, 0, ghost),
      capture: buildChecks(spec, "01", pred, 0, ghost),
    };
  }, [job, spec, pred]);
  const set = (patch: Partial<typeof spec>) => {
    if (!locked) patchSpec(job.id, patch);
  };

  return (
    <div className="grid gap-6 p-4 md:p-6 xl:grid-cols-[22rem_1fr]">
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-3 gap-2">
          {(["S", "M", "L"] as SpaceClass[]).map((c) => (
            <Btn
              key={c}
              type="button"
              kind={spec.spaceClass === c ? "primary" : "ghost"}
              disabled={locked}
              onClick={() => set(blankSpec({ ...spec, ...CLASS_PRESET[c], name: spec.name, site: spec.site, faults: spec.faults }))}
            >
              {c}
            </Btn>
          ))}
        </div>
        <Field label="Camera">
          <select value={spec.camera} disabled={locked} onChange={(e) => set({ camera: e.target.value as CameraId })}>
            {(Object.keys(CAMERAS) as CameraId[]).map((id) => (
              <option key={id} value={id}>
                {CAMERAS[id].label}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-3 gap-2">
          <Field label="Length">
            <input type="number" min={2} step={0.01} disabled={locked} value={spec.lengthM} onChange={(e) => set({ lengthM: Number(e.target.value) })} />
          </Field>
          <Field label="Width">
            <input type="number" min={2} step={0.01} disabled={locked} value={spec.widthM} onChange={(e) => set({ widthM: Number(e.target.value) })} />
          </Field>
          <Field label="Height">
            <input type="number" min={2} step={0.01} disabled={locked} value={spec.heightM} onChange={(e) => set({ heightM: Number(e.target.value) })} />
          </Field>
        </div>
        <Field label={`Overlap ${Math.round(spec.overlap * 100)}%`}>
          <input type="range" min={0.6} max={0.9} step={0.05} disabled={locked} value={spec.overlap} onChange={(e) => set({ overlap: Number(e.target.value) })} />
        </Field>
        <Field label="GSD target mm/px (blank = class standoff)">
          <input
            type="number"
            min={0.2}
            step={0.05}
            disabled={locked}
            value={spec.gsdTarget ?? ""}
            placeholder="auto"
            onChange={(e) => set({ gsdTarget: e.target.value === "" ? null : Number(e.target.value) })}
          />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Stepper label="Targets" value={spec.targets} disabled={locked} onChange={(targets) => set({ targets })} />
          <Stepper label="Scale bars" value={spec.scalebars} disabled={locked} onChange={(scalebars) => set({ scalebars })} />
          <Stepper label="Check bars" value={spec.heldoutBars} disabled={locked} onChange={(heldoutBars) => set({ heldoutBars })} />
          <Stepper label="Level targets" value={spec.levelTargets} disabled={locked} onChange={(levelTargets) => set({ levelTargets })} />
          <Stepper label="Blind checks" value={spec.independentChecks} disabled={locked} onChange={(independentChecks) => set({ independentChecks })} />
          <Field label="ISO">
            <input type="number" min={50} step={50} disabled={locked} value={spec.iso} onChange={(e) => set({ iso: Number(e.target.value) })} />
          </Field>
        </div>
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input type="checkbox" className="h-5 w-5" checked={spec.surveyControl} disabled={locked} onChange={(e) => set({ surveyControl: e.target.checked })} />
          Total-station control
        </label>
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input type="checkbox" className="h-5 w-5" checked={spec.tls} disabled={locked} onChange={(e) => set({ tls: e.target.checked })} />
          TLS geometry pass
        </label>
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input type="checkbox" className="h-5 w-5" checked={spec.splats} disabled={locked} onChange={(e) => set({ splats: e.target.checked })} />
          Visual splat layer (not for measure)
        </label>
        <div className="rounded-md border border-line p-3">
          <h2 className="text-sm font-medium">Site conditions</h2>
          <p className="mb-2 text-xs text-muted">These drive the rehearsal. A reshoot ladder can clear the capture faults.</p>
          {FAULTS.map((f) => (
            <label key={f.key} className="flex min-h-11 items-center gap-3 text-sm">
              <input
                type="checkbox"
                className="h-5 w-5"
                checked={spec.faults[f.key]}
                disabled={locked}
                onChange={(e) => set({ faults: { ...spec.faults, [f.key]: e.target.checked } })}
              />
              {f.label}
            </label>
          ))}
        </div>
        {pred.images_total_est < byClass(THRESHOLDS.stage_01_capture.image_count_min, spec.spaceClass) ? (
          <Btn
            type="button"
            kind="primary"
            disabled={locked}
            onClick={() => set({ imageOverride: byClass(THRESHOLDS.stage_01_capture.image_count_min, spec.spaceClass) })}
          >
            Plan {byClass(THRESHOLDS.stage_01_capture.image_count_min, spec.spaceClass)} images
          </Btn>
        ) : null}
      </div>
      <div className="flex min-w-0 flex-col gap-5">
        <div className="grid grid-cols-2 gap-4 rounded-md border border-line bg-surface p-4 md:grid-cols-4">
          <Stat label="GSD" value={`${pred.gsd_mm_at_walls.toFixed(2)} mm`} hint={`${pred.standoff_m.toFixed(2)} m standoff`} />
          <Stat label="Images" value={String(imageCount(spec, pred))} hint={`${pred.images_total_est} from the grid`} />
          <Stat label="Target precision" value={`${pred.fraser_precision_targets_mm.toFixed(3)} mm`} hint="Fraser, q = 1, k = 6" />
          <Stat label="One bar on the diagonal" value={`${pred.scale_error_on_diagonal_mm_from_one_bar.toFixed(2)} mm`} hint={`${pred.space_diagonal_m.toFixed(1)} m diagonal`} />
        </div>
        {pred.standoff_clamped ? <p className="text-sm text-brass">Standoff was pulled in so the camera fits inside the room.</p> : null}
        <p className="text-sm text-muted">{pred.note} Surface estimate is 2 × GSD ({pred.surface_2x_gsd_mm.toFixed(2)} mm). The 1–3 × band is {pred.surface_rule_1to3xGSD_mm[0]}–{pred.surface_rule_1to3xGSD_mm[1]} mm.</p>
        <StationSheet spec={spec} />
        <section>
          <h2 className="mb-2 text-sm font-medium">Plan gate</h2>
          <CheckTable checks={preview.plan} />
        </section>
        <section>
          <h2 className="mb-2 text-sm font-medium">Capture gate, if you shot this plan</h2>
          <CheckTable checks={preview.capture} />
        </section>
      </div>
    </div>
  );
}

function Stepper({ label, value, onChange, disabled }: { label: string; value: number; onChange: (n: number) => void; disabled?: boolean }) {
  return (
    <Field label={label}>
      <div className="flex gap-2">
        <Btn type="button" disabled={disabled} onClick={() => onChange(Math.max(0, value - 1))}>
          −
        </Btn>
        <div className="num flex h-11 flex-1 items-center justify-center rounded-md border border-line">{value}</div>
        <Btn type="button" disabled={disabled} onClick={() => onChange(value + 1)}>
          +
        </Btn>
      </div>
    </Field>
  );
}

function StationSheet({ spec }: { spec: Job["spec"] }) {
  const room = roomOf(spec);
  const bars = barsOf(spec);
  const markers = markersOf(spec).filter((m) => m.kind === "coded").slice(0, 80);
  const levels = markersOf(spec).filter((m) => m.kind === "level");
  const pad = 1.2;
  const vb = `${-pad} ${-pad} ${room.L + pad * 2} ${room.W + pad * 2}`;
  return (
    <div className="rounded-md border border-line bg-surface p-3">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-medium">Station sheet</h2>
        <span className="text-xs text-muted">Coded targets and bars. Dashed bars are held out.</span>
      </div>
      <svg viewBox={vb} className="h-auto w-full" role="img" aria-label="Plan of targets and scale bars">
        <rect x={0} y={0} width={room.L} height={room.W} fill="var(--color-bg)" stroke="var(--color-brass)" strokeWidth={0.04} />
        <rect x={room.door.x} y={-0.08} width={room.door.w} height={0.12} fill="var(--color-brick)" />
        <rect x={room.L - 0.08} y={room.window.y} width={0.12} height={room.window.w} fill="var(--color-cool)" />
        <rect x={room.column.x} y={room.column.y} width={room.column.w} height={room.column.d} fill="none" stroke="var(--color-fg)" strokeWidth={0.03} />
        {bars.map((b) => (
          <line
            key={b.id}
            x1={b.x1}
            y1={b.y1}
            x2={b.x2}
            y2={b.y2}
            stroke={b.role === "check" ? "var(--color-cool)" : "var(--color-brass)"}
            strokeWidth={0.06}
            strokeDasharray={b.role === "check" ? "0.12 0.08" : undefined}
          />
        ))}
        {markers.map((m) => (
          <circle key={m.id} cx={m.x} cy={m.y} r={0.08} fill="none" stroke="var(--color-fg)" strokeWidth={0.02} />
        ))}
        {levels.map((m) => (
          <circle key={m.id} cx={m.x} cy={m.y} r={0.06} fill="var(--color-brass)" />
        ))}
      </svg>
    </div>
  );
}
