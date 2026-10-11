import { create } from "zustand";
import { applyRetry, executeStage, predictionFor, specHash } from "./engine";
import type { Faults, GateId, Job, JobSpec, SpaceClass } from "./types";

const KEY = "capbim-jobs-v2";

export function noFaults(over: Partial<Faults> = {}): Faults {
  return {
    stabilisationOn: false,
    slowShutter: false,
    plainWalls: false,
    barIdMismatch: false,
    lowImageCount: false,
    ...over,
  };
}

export const CLASS_PRESET: Record<SpaceClass, Partial<JobSpec>> = {
  S: {
    spaceClass: "S",
    camera: "ff61_24mm",
    lengthM: 6,
    widthM: 4,
    heightM: 2.8,
    targets: 24,
    scalebars: 4,
    heldoutBars: 1,
    levelTargets: 4,
    independentChecks: 12,
    surveyControl: false,
  },
  M: {
    spaceClass: "M",
    camera: "ff61_24mm",
    lengthM: 20,
    widthM: 12,
    heightM: 4,
    targets: 48,
    scalebars: 6,
    heldoutBars: 2,
    levelTargets: 4,
    independentChecks: 24,
    surveyControl: false,
  },
  L: {
    spaceClass: "L",
    camera: "ff45_35mm",
    lengthM: 60,
    widthM: 40,
    heightM: 10,
    targets: 96,
    scalebars: 8,
    heldoutBars: 3,
    levelTargets: 6,
    independentChecks: 40,
    surveyControl: true,
  },
};

export function blankSpec(over: Partial<JobSpec> = {}): JobSpec {
  const { faults: faultOver, ...rest } = over;
  return {
    name: "New room",
    site: "Site",
    spaceClass: "S",
    camera: "ff61_24mm",
    lengthM: 6,
    widthM: 4,
    heightM: 2.8,
    overlap: 0.8,
    gsdTarget: null,
    iso: 400,
    aperture: 8,
    shutterS: 1 / 250,
    targets: 24,
    scalebars: 4,
    heldoutBars: 1,
    levelTargets: 4,
    independentChecks: 12,
    surveyControl: false,
    tls: false,
    splats: false,
    certUncertaintyMm: 0.1,
    checksSealed: true,
    blurReject: 0.02,
    clippedHighlight: 0.01,
    imageOverride: null,
    ...rest,
    faults: faultOver ?? noFaults(),
  };
}

function shell(id: string, spec: JobSpec, createdAt: string): Job {
  return {
    id,
    createdAt,
    spec,
    reports: [],
    ladders: {},
    attempts: {},
    gates: { g0: "pending", g2: "pending", g3: "pending" },
    gateNotes: {},
    reviews: [],
    sealedHash: null,
    truths: [],
    residuals: null,
    unsealed: false,
    degraded: false,
    forcedStages: [],
    signedBy: null,
    signedAt: null,
    log: [{ at: createdAt, text: "Job opened. Thresholds are read-only." }],
    specHashAtRun: null,
  };
}

function heal(raw: Job): Job {
  const spec = blankSpec({ ...raw.spec, faults: { ...noFaults(), ...raw.spec?.faults } });
  const base = shell(raw.id || `job-${Date.now().toString(36)}`, spec, raw.createdAt || new Date().toISOString());
  return {
    ...base,
    ...raw,
    spec,
    reports: raw.reports ?? [],
    ladders: raw.ladders ?? {},
    attempts: raw.attempts ?? {},
    gates: { ...base.gates, ...raw.gates },
    gateNotes: raw.gateNotes ?? {},
    reviews: raw.reviews ?? [],
    truths: raw.truths ?? [],
    residuals: raw.residuals ?? null,
    forcedStages: raw.forcedStages ?? [],
    log: raw.log?.length ? raw.log : base.log,
  };
}

export function seedJobs(): Job[] {
  return [
    shell(
      "mil-214",
      blankSpec({
        name: "Room 214",
        site: "Milton yard office",
        ...CLASS_PRESET.S,
      }),
      "2026-10-11T14:00:00.000Z",
    ),
    shell(
      "gallery-b",
      blankSpec({
        name: "Gallery B",
        site: "North wing",
        ...CLASS_PRESET.M,
        lengthM: 18,
        widthM: 10,
        heightM: 3.6,
        faults: noFaults({ plainWalls: true, barIdMismatch: true }),
      }),
      "2026-10-11T14:05:00.000Z",
    ),
    shell(
      "hall-north",
      blankSpec({
        name: "North hall",
        site: "Assembly hall",
        ...CLASS_PRESET.L,
        surveyControl: false,
      }),
      "2026-10-11T14:10:00.000Z",
    ),
  ];
}

type Store = {
  jobs: Job[];
  hydrated: boolean;
  hydrate: () => void;
  create: (spec: JobSpec) => string;
  patchSpec: (id: string, patch: Partial<JobSpec>) => void;
  resetRun: (id: string) => void;
  runStage: (id: string, stageId: string) => Promise<void>;
  retryStage: (id: string, stageId: string) => Promise<void>;
  approveGate: (id: string, gate: GateId, note: string, waive?: boolean) => void;
  forceStage: (id: string, stageId: string, note: string) => void;
  decideReview: (id: string, reviewId: string, decision: string) => void;
  sign: (id: string, name: string) => boolean;
};

function write(jobs: Job[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(jobs));
  } catch {
    /* private mode */
  }
}

export const useCapbim = create<Store>((set, get) => ({
  jobs: seedJobs(),
  hydrated: false,
  hydrate: () => {
    if (get().hydrated) return;
    let jobs = get().jobs;
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Job[];
        if (Array.isArray(parsed) && parsed[0]?.spec?.name) jobs = parsed.map((job) => heal(job));
      }
    } catch {
      /* seeds */
    }
    set({ jobs, hydrated: true });
  },
  create: (spec) => {
    const id = `job-${Date.now().toString(36)}`;
    const jobs = [shell(id, spec, new Date().toISOString()), ...get().jobs];
    set({ jobs });
    if (get().hydrated) write(jobs);
    return id;
  },
  patchSpec: (id, patch) => {
    const jobs = get().jobs.map((job) => (job.id === id && !job.unsealed ? { ...job, spec: { ...job.spec, ...patch, faults: patch.faults ?? job.spec.faults } } : job));
    set({ jobs });
    if (get().hydrated) write(jobs);
  },
  resetRun: (id) => {
    const jobs = get().jobs.map((job) => {
      if (job.id !== id || job.unsealed) return job;
      const at = new Date().toISOString();
      return {
        ...job,
        reports: [],
        ladders: {},
        attempts: {},
        gates: { g0: "pending" as const, g2: "pending" as const, g3: "pending" as const },
        gateNotes: {},
        reviews: [],
        sealedHash: null,
        truths: [],
        residuals: null,
        degraded: false,
        forcedStages: [],
        signedBy: null,
        signedAt: null,
        specHashAtRun: null,
        log: [...job.log, { at, text: "Run cleared. The plan can be edited, then run again." }],
      };
    });
    set({ jobs });
    if (get().hydrated) write(jobs);
  },
  runStage: async (id, stageId) => {
    const job = get().jobs.find((j) => j.id === id);
    if (!job || job.unsealed) return;
    const next = await executeStage(job, stageId);
    const jobs = get().jobs.map((j) => (j.id === id ? next : j));
    set({ jobs });
    if (get().hydrated) write(jobs);
  },
  retryStage: async (id, stageId) => {
    const job = get().jobs.find((j) => j.id === id);
    if (!job || job.unsealed) return;
    const nextLadder = (job.ladders[stageId] ?? 0) + 1;
    const pred = predictionFor(job.spec);
    const spec = applyRetry(job.spec, stageId, nextLadder, pred);
    const stepped: Job = {
      ...job,
      spec,
      ladders: { ...job.ladders, [stageId]: nextLadder },
      specHashAtRun: specHash(spec),
      log: [...job.log, { at: new Date().toISOString(), text: `Ladder ${nextLadder} on stage ${stageId}.` }],
    };
    const next = await executeStage(stepped, stageId);
    const jobs = get().jobs.map((j) => (j.id === id ? next : j));
    set({ jobs });
    if (get().hydrated) write(jobs);
  },
  approveGate: (id, gate, note, waive) => {
    const jobs = get().jobs.map((job) => {
      if (job.id !== id) return job;
      const at = new Date().toISOString();
      return {
        ...job,
        gates: { ...job.gates, [gate]: waive ? "waived" : "approved" },
        gateNotes: { ...job.gateNotes, [gate]: note },
        degraded: job.degraded || Boolean(waive),
        log: [...job.log, { at, text: waive ? `Gate ${gate.toUpperCase()} waived. ${note}` : `Gate ${gate.toUpperCase()} approved. ${note}` }],
      };
    });
    set({ jobs });
    if (get().hydrated) write(jobs);
  },
  forceStage: (id, stageId, note) => {
    if (stageId === "11") return;
    const jobs = get().jobs.map((job) => {
      if (job.id !== id || job.unsealed) return job;
      const at = new Date().toISOString();
      return {
        ...job,
        degraded: true,
        forcedStages: job.forcedStages.includes(stageId) ? job.forcedStages : [...job.forcedStages, stageId],
        log: [...job.log, { at, text: `Stage ${stageId} forced through. ${note}` }],
      };
    });
    set({ jobs });
    if (get().hydrated) write(jobs);
  },
  decideReview: (id, reviewId, decision) => {
    const jobs = get().jobs.map((job) =>
      job.id === id
        ? { ...job, reviews: job.reviews.map((r) => (r.id === reviewId ? { ...r, decision } : r)) }
        : job,
    );
    set({ jobs });
    if (get().hydrated) write(jobs);
  },
  sign: (id, name) => {
    const job = get().jobs.find((j) => j.id === id);
    const report = job?.reports.find((r) => r.stage_id === "11");
    if (!job || !report || job.degraded || (report.status !== "pass" && report.status !== "warn") || !name.trim()) return false;
    const at = new Date().toISOString();
    const jobs = get().jobs.map((j) =>
      j.id === id
        ? {
            ...j,
            signedBy: name.trim(),
            signedAt: at,
            gates: { ...j.gates, g3: "approved" as const },
            log: [...j.log, { at, text: `Signed by ${name.trim()}. Synthetic statement only.` }],
          }
        : j,
    );
    set({ jobs });
    if (get().hydrated) write(jobs);
    return true;
  },
}));

export function useJob(id: string): Job | undefined {
  return useCapbim((s) => s.jobs.find((j) => j.id === id));
}
