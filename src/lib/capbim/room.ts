import type { JobSpec, SpaceClass } from "./types";

export type Opening = { x: number; y: number; w: number; h: number };

export type RoomGeom = {
  L: number;
  W: number;
  H: number;
  wallT: number;
  door: Opening;
  window: Opening & { sill: number };
  column: { x: number; y: number; w: number; d: number };
};

export type Bar = {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  z: number;
  lengthM: number;
  role: "control" | "check";
};

export type Marker = { id: string; x: number; y: number; z: number; kind: "coded" | "level" };

export type ElementRec = {
  id: string;
  name: string;
  ifcType: string;
  parent: string;
  quantity: string;
  material: string;
};

export function roomOf(spec: Pick<JobSpec, "lengthM" | "widthM" | "heightM">): RoomGeom {
  const L = spec.lengthM;
  const W = spec.widthM;
  const H = spec.heightM;
  const doorW = Math.min(0.9, Math.max(0.7, L * 0.12));
  const doorH = Math.min(2.1, H - 0.15);
  const doorX = Math.min(Math.max(0.8, L * 0.28), L - doorW - 0.5);
  const winW = Math.min(1.4, Math.max(0.8, W * 0.22));
  const winH = Math.min(1.2, H * 0.4);
  const winY = Math.min(Math.max(0.6, W * 0.38), W - winW - 0.4);
  const winZ = Math.min(0.9, H * 0.32);
  const col = Math.min(0.4, Math.max(0.25, Math.min(L, W) * 0.04));
  return {
    L,
    W,
    H,
    wallT: 0.2,
    door: { x: round3(doorX), y: 0, w: round3(doorW), h: round3(doorH) },
    window: { x: L, y: round3(winY), w: round3(winW), h: round3(winH), sill: round3(winZ) },
    column: {
      x: round3(L * 0.62),
      y: round3(W * 0.46),
      w: round3(col),
      d: round3(col),
    },
  };
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function elementsOf(room: RoomGeom): ElementRec[] {
  return [
    { id: "floor", name: "Floor slab", ifcType: "IfcSlab", parent: "Room", quantity: `${room.L.toFixed(2)} × ${room.W.toFixed(2)} m`, material: "Sealed concrete" },
    { id: "ceiling", name: "Ceiling", ifcType: "IfcCovering", parent: "Room", quantity: `height ${room.H.toFixed(2)} m`, material: "Painted gypsum" },
    { id: "wall-s", name: "Wall south", ifcType: "IfcWall", parent: "Room", quantity: `${room.L.toFixed(2)} × ${room.H.toFixed(2)} m`, material: "Painted gypsum" },
    { id: "wall-n", name: "Wall north", ifcType: "IfcWall", parent: "Room", quantity: `${room.L.toFixed(2)} × ${room.H.toFixed(2)} m`, material: "Painted gypsum" },
    { id: "wall-w", name: "Wall west", ifcType: "IfcWall", parent: "Room", quantity: `${room.W.toFixed(2)} × ${room.H.toFixed(2)} m`, material: "Painted gypsum" },
    { id: "wall-e", name: "Wall east", ifcType: "IfcWall", parent: "Room", quantity: `${room.W.toFixed(2)} × ${room.H.toFixed(2)} m`, material: "Painted gypsum" },
    { id: "door-1", name: "Door D1", ifcType: "IfcDoor", parent: "Wall south", quantity: `${room.door.w.toFixed(2)} × ${room.door.h.toFixed(2)} m`, material: "Painted timber" },
    { id: "window-1", name: "Window W1", ifcType: "IfcWindow", parent: "Wall east", quantity: `${room.window.w.toFixed(2)} × ${room.window.h.toFixed(2)} m`, material: "Aluminium, clear glass" },
    { id: "column-1", name: "Column C1", ifcType: "IfcColumn", parent: "Room", quantity: `${room.column.w.toFixed(2)} m square`, material: "Concrete" },
  ];
}

export function barsOf(spec: JobSpec): Bar[] {
  const room = roomOf(spec);
  const n = Math.max(0, spec.scalebars);
  const held = Math.min(spec.heldoutBars, n);
  const out: Bar[] = [];
  for (let i = 0; i < n; i++) {
    const role = i >= n - held ? "check" : "control";
    const ang = (i * Math.PI) / 3;
    const len = 1.2;
    const cx = room.L * (0.22 + (0.56 * i) / Math.max(1, n - 1 || 1));
    const cy = room.W * (0.3 + (i % 2) * 0.28);
    const x1 = clamp(cx - (Math.cos(ang) * len) / 2, 0.3, room.L - 0.3);
    const y1 = clamp(cy - (Math.sin(ang) * len) / 2, 0.3, room.W - 0.3);
    const x2 = clamp(cx + (Math.cos(ang) * len) / 2, 0.3, room.L - 0.3);
    const y2 = clamp(cy + (Math.sin(ang) * len) / 2, 0.3, room.W - 0.3);
    const lengthM = Math.hypot(x2 - x1, y2 - y1);
    out.push({ id: `SB-${String(i + 1).padStart(2, "0")}`, x1, y1, x2, y2, z: 0.02, lengthM: round3(lengthM), role });
  }
  return out;
}

export function markersOf(spec: JobSpec): Marker[] {
  const room = roomOf(spec);
  const coded: Marker[] = [];
  const walls: { n: number; at: (t: number, z: number) => { x: number; y: number } }[] = [
    { n: 0.4, at: (t, _z) => ({ x: 0.15 + t * (room.L - 0.3), y: 0.04 }) },
    { n: 0.25, at: (t, _z) => ({ x: 0.15 + t * (room.L - 0.3), y: room.W - 0.04 }) },
    { n: 0.2, at: (t, _z) => ({ x: 0.04, y: 0.15 + t * (room.W - 0.3) }) },
    { n: 0.15, at: (t, _z) => ({ x: room.L - 0.04, y: 0.15 + t * (room.W - 0.3) }) },
  ];
  const count = Math.max(0, spec.targets);
  let i = 0;
  const weights = walls.map((w) => w.n);
  const sum = weights.reduce((a, b) => a + b, 0);
  walls.forEach((w, wi) => {
    const c = wi === walls.length - 1 ? count - i : Math.round((count * w.n) / sum);
    for (let k = 0; k < c; k++) {
      const t = (k + 0.5) / c;
      const z = 0.4 + ((k % 3) * (room.H - 0.7)) / 2;
      const p = w.at(t, z);
      coded.push({ id: `T${String(i + 1).padStart(2, "0")}`, x: p.x, y: p.y, z, kind: "coded" });
      i++;
    }
  });
  const level: Marker[] = [];
  const ln = Math.max(0, spec.levelTargets);
  for (let k = 0; k < ln; k++) {
    const along = ((k + 0.5) / ln) * room.L * 0.8 + room.L * 0.1;
    const wall = k % 3;
    const p =
      wall === 0 ? { x: along, y: 0.05 } : wall === 1 ? { x: along, y: room.W - 0.05 } : { x: room.L - 0.05, y: room.W * (0.2 + 0.6 * ((k % 2) + 0.5) / 2) };
    level.push({ id: `LV${k + 1}`, x: p.x, y: p.y, z: Math.min(1.5, room.H - 0.3), kind: "level" });
  }
  return [...coded, ...level];
}

export function designTruths(spec: JobSpec): { id: string; label: string; distanceM: number }[] {
  const room = roomOf(spec);
  const base = [
    { id: "len", label: "Long wall, inside face", distanceM: room.L },
    { id: "wid", label: "Short wall, inside face", distanceM: room.W },
    { id: "hgt", label: "Floor to ceiling", distanceM: room.H },
    { id: "diag", label: "Floor diagonal", distanceM: Math.hypot(room.L, room.W) },
    { id: "door-w", label: "Door D1 width", distanceM: room.door.w },
    { id: "door-h", label: "Door D1 height", distanceM: room.door.h },
    { id: "win-w", label: "Window W1 width", distanceM: room.window.w },
    { id: "win-h", label: "Window W1 height", distanceM: room.window.h },
    { id: "col", label: "Column C1 width", distanceM: room.column.w },
  ];
  const need = Math.max(spec.independentChecks, base.length);
  const out = base.map((b) => ({ ...b, distanceM: round3(b.distanceM) }));
  let k = 0;
  while (out.length < need) {
    const seg = round3(Math.min(2, room.L / 4));
    out.push({ id: `seg-${k + 1}`, label: `Wall segment ${k + 1}`, distanceM: seg });
    k++;
  }
  return out.slice(0, need);
}

function clamp(n: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, n));
}

export function bowMmFor(cls: SpaceClass, plain: boolean): number {
  const base = cls === "S" ? 3.5 : cls === "M" ? 6 : 9;
  return plain ? base + 4 : base;
}
