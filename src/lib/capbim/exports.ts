import { elementsOf, roomOf } from "./room";
import type { Job, JobSpec } from "./types";

export function jobYaml(spec: JobSpec, id: string): string {
  const lines = [
    `job_id: ${id}`,
    `name: ${JSON.stringify(spec.name)}`,
    `site: ${JSON.stringify(spec.site)}`,
    `space_class: ${spec.spaceClass}`,
    `camera: ${spec.camera}`,
    `length_m: ${spec.lengthM}`,
    `width_m: ${spec.widthM}`,
    `height_m: ${spec.heightM}`,
    `overlap: ${spec.overlap}`,
    `targets: ${spec.targets}`,
    `scalebars: ${spec.scalebars}`,
    `scalebars_heldout: ${spec.heldoutBars}`,
    `level_targets: ${spec.levelTargets}`,
    `independent_checks: ${spec.independentChecks}`,
    `survey_control: ${spec.surveyControl}`,
    `tls: ${spec.tls}`,
    `checks_sealed: ${spec.checksSealed}`,
    `cert_uncertainty_mm: ${spec.certUncertaintyMm}`,
  ];
  return lines.join("\n") + "\n";
}

export function ifcOf(spec: JobSpec, id: string): string {
  const room = roomOf(spec);
  const els = elementsOf(room);
  const header = `ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('Capbim synthetic room — not a survey deliverable'),'2;1');
FILE_NAME('${id}.ifc','2026-10-11',('Capbim'),('Capbim'),'Capbim 2.0','Capbim','');
FILE_SCHEMA(('IFC4'));
ENDSEC;
DATA;
#1=IFCPROJECT('${guid(1)}',$,'${esc(spec.name)}',$,$,$,$,(#2),#3);
#2=IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.0E-5,#4,$);
#3=IFCUNITASSIGNMENT((#5,#6));
#4=IFCAXIS2PLACEMENT3D(#10,$,$);
#5=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);
#6=IFCSIUNIT(*,.PLANEANGLEUNIT.,$,.RADIAN.);
#10=IFCCARTESIANPOINT((0.,0.,0.));
#11=IFCCARTESIANPOINT((0.,0.,1.));
#12=IFCDIRECTION((0.,0.,1.));
#13=IFCDIRECTION((1.,0.,0.));
#20=IFCSITE('${guid(20)}',$,'${esc(spec.site)}',$,$,#21,$,$,.ELEMENT.,$,$,$,$,$);
#21=IFCLOCALPLACEMENT($,#4);
#22=IFCBUILDING('${guid(22)}',$,'Building',$,$,#21,$,$,.ELEMENT.,$,$,$);
#23=IFCBUILDINGSTOREY('${guid(23)}',$,'Level 1',$,$,#21,$,$,.ELEMENT.,0.);
#24=IFCRELAGGREGATES('${guid(24)}',$,$,$,#1,(#20));
#25=IFCRELAGGREGATES('${guid(25)}',$,$,$,#20,(#22));
#26=IFCRELAGGREGATES('${guid(26)}',$,$,$,#22,(#23));
#30=IFCSPACE('${guid(30)}',$,'Room',$,$,#21,$,$,.ELEMENT.,.INTERNAL.,$);
#31=IFCRELCONTAINEDINSPATIALSTRUCTURE('${guid(31)}',$,$,$,(#30),#23);
`;
  const bodies = els.map((el, i) => {
    const n = 100 + i * 10;
    return `#${n}=IFC${el.ifcType.replace("Ifc", "").toUpperCase()}('${guid(n)}',$,'${esc(el.name)}','${esc(el.quantity)}',$,#21,$,$,$);
#${n + 1}=IFCPROPERTYSINGLEVALUE('FitNote',$,IFCTEXT('Synthetic fixture. Pset_CaptureEvidence lives in the viewer.'),$);
#${n + 2}=IFCPROPERTYSET('${guid(n + 2)}',$,'Pset_CaptureEvidence',$,(#${n + 1}));
#${n + 3}=IFCRELDEFINESBYPROPERTIES('${guid(n + 3)}',$,$,$,(#${n}),#${n + 2});`;
  });
  const contain = els.map((_, i) => `#${100 + i * 10}`).join(",");
  const tail = `#900=IFCRELCONTAINEDINSPATIALSTRUCTURE('${guid(900)}',$,$,$,(${contain}),#23);
ENDSEC;
END-ISO-10303-21;
`;
  return header + bodies.join("\n") + "\n" + tail;
}

export function gltfOf(spec: JobSpec): string {
  const room = roomOf(spec);
  const positions: number[] = [];
  const indices: number[] = [];
  const addBox = (x: number, y: number, z: number, dx: number, dy: number, dz: number) => {
    const base = positions.length / 3;
    const pts = [
      [x, y, z],
      [x + dx, y, z],
      [x + dx, y + dy, z],
      [x, y + dy, z],
      [x, y, z + dz],
      [x + dx, y, z + dz],
      [x + dx, y + dy, z + dz],
      [x, y + dy, z + dz],
    ];
    pts.forEach((p) => positions.push(p[0] ?? 0, p[1] ?? 0, p[2] ?? 0));
    const faces = [
      [0, 1, 2, 3],
      [4, 5, 6, 7],
      [0, 1, 5, 4],
      [2, 3, 7, 6],
      [1, 2, 6, 5],
      [0, 3, 7, 4],
    ];
    for (const f of faces) {
      const a = f[0] ?? 0;
      const b = f[1] ?? 0;
      const c = f[2] ?? 0;
      const d = f[3] ?? 0;
      indices.push(base + a, base + b, base + c, base + a, base + c, base + d);
    }
  };
  const t = 0.2;
  addBox(0, -t, 0, room.L, t, room.H);
  addBox(0, room.W, 0, room.L, t, room.H);
  addBox(-t, 0, 0, t, room.W, room.H);
  addBox(room.L, 0, 0, t, room.W, room.H);
  addBox(0, 0, -0.12, room.L, room.W, 0.12);
  addBox(room.column.x, room.column.y, 0, room.column.w, room.column.d, room.H);
  let min = [Infinity, Infinity, Infinity];
  let max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const v = positions[i + k] ?? 0;
      min[k] = Math.min(min[k] ?? 0, v);
      max[k] = Math.max(max[k] ?? 0, v);
    }
  }
  return JSON.stringify({
    asset: { version: "2.0", generator: "Capbim synthetic fixture" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: spec.name }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, mode: 4 }] }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: positions.length / 3, type: "VEC3", min, max },
      { bufferView: 1, componentType: 5125, count: indices.length, type: "SCALAR" },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positions.length * 4, target: 34962 },
      { buffer: 1, byteOffset: positions.length * 4, byteLength: indices.length * 4, target: 34963 },
    ],
    buffers: [{ uri: `data:application/octet-stream;base64,${pack(positions, indices)}`, byteLength: (positions.length + indices.length) * 4 }],
  });
}

function pack(positions: number[], indices: number[]): string {
  const buf = new ArrayBuffer((positions.length + indices.length) * 4);
  const f = new Float32Array(buf, 0, positions.length);
  f.set(positions);
  const u = new Uint32Array(buf, positions.length * 4, indices.length);
  u.set(indices);
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i] ?? 0);
  return btoa(bin);
}

export function cloudCsv(spec: JobSpec): string {
  const room = roomOf(spec);
  const lines = ["x_m,y_m,z_m,surface"];
  const step = Math.max(0.5, Math.min(room.L, room.W) / 12);
  for (let x = 0; x <= room.L; x += step) {
    for (let z = 0; z <= room.H; z += step) {
      lines.push(`${x.toFixed(3)},0.000,${z.toFixed(3)},wall-s`);
      lines.push(`${x.toFixed(3)},${room.W.toFixed(3)},${z.toFixed(3)},wall-n`);
    }
  }
  return lines.join("\n") + "\n";
}

export function accuracyText(job: Job): string {
  const report = job.reports.find((r) => r.stage_id === "11");
  const lines = [
    "CAPBIM ACCURACY STATEMENT",
    "SYNTHETIC REHEARSAL — NOT A SURVEY CERTIFICATE",
    "",
    `Job: ${job.spec.name}`,
    `Site: ${job.spec.site}`,
    `Class: ${job.spec.spaceClass}`,
    `Signed by: ${job.signedBy ?? "unsigned"}`,
    `Signed at: ${job.signedAt ?? "—"}`,
    "",
    "Stage 00 figures are the Fraser / GSD predictor.",
    "Later figures are the QC state machine on a parametric room.",
    "They are not measurements of a real building.",
    "",
  ];
  if (report) {
    lines.push(`Status: ${report.status}`);
    for (const c of report.checks) {
      lines.push(`- ${c.metric}: ${String(c.value)} ${c.operator} ${String(c.threshold)} → ${c.result}`);
    }
    lines.push("", report.diagnosis);
  } else {
    lines.push("Blind checks are still sealed.");
  }
  if (job.degraded) lines.push("", "A gate was waived or a failed stage was forced. Do not publish a claim.");
  return lines.join("\n") + "\n";
}

function guid(n: number): string {
  const s = n.toString(16).padStart(8, "0");
  return `capbim-${s}-4000-8000-000000000000`.slice(0, 22);
}

function esc(s: string): string {
  return s.replace(/'/g, "''");
}
