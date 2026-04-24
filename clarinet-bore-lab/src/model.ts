export type BoreSegment = {
  id: string;
  label: string;
  zMm: number;
  diameterMm: number;
  outerDiameterMm?: number;
  /** 3D position along the bore. If omitted, assumes straight line along z-axis. */
  x?: number;
  y?: number;
};

export type BoreBend = {
  id: string;
  label: string;
  /** Position along acoustic path from mouthpiece (mm) */
  pathDistanceMm: number;
  /** Bend angle in degrees. Positive = rightward for XZ, upward for YZ. */
  bendAngleDeg: number;
  /** Bend axis: "xz" (bends left/right), "yz" (bends up/down). */
  bendAxisPlane: "xz" | "yz";
  /** Centerline radius of the pipe bend elbow (mm). Larger = gentler curve. Defaults to 50. */
  bendRadiusMm?: number;
};

/** A point on the 3D bore path with its corresponding acoustic z coordinate. */
export type PathPoint = Vec3 & { acousticZ: number };

export type ToneHole = {
  id: string;
  label: string;
  /** Inner bore intersection z (mm from bell). */
  zMm: number;
  /** Outer opening z (mm from bell). Defaults to inner z when omitted. */
  outerZMm?: number;
  /** If true, outer z is constrained to match inner z. */
  lockInnerOuterZ?: boolean;
  angleDeg: number;
  /** Axial drill angle in degrees. 0 = perpendicular to bore axis.
   *  Positive = tilted toward mouthpiece (outer opening shifts toward bell,
   *  inner acoustic center shifts toward mouthpiece). Clamped to ±75°. */
  drillAngleDeg?: number;
  diameterMm: number;
  chimneyMm: number;
  targetNote: string;
};

export type Fingering = {
  id: string;
  label: string;
  targetNote: string;
  ventHoleId: string;
  register: "fundamental" | "third";
  termination: "vent-hole" | "below-open-vent-closed" | "bell";
};

export type HoleEvaluation = {
  id: string;
  label: string;
  zMm: number;
  localBoreMm: number;
  wallThicknessMm: number | null;
  effectiveLengthMm: number;
  predictedFundamentalHz: number;
  predictedThirdHz: number;
  activeRegister: "fundamental" | "third";
  activeTermination: "vent-hole" | "below-open-vent-closed" | "bell";
  predictedActiveHz: number;
  targetHz: number | null;
  nearestNote: string;
  centsErrorToNearest: number;
  centsErrorToTarget: number | null;
  recommendation: string;
};

export type FingeringEvaluation = {
  id: string;
  label: string;
  targetNote: string;
  ventHoleLabel: string;
  register: "fundamental" | "third";
  predictedHz: number | null;
  nearestNote: string;
  centsErrorToTarget: number | null;
  withinTolerance: boolean;
  note: string;
};

export type HoleTriangulationSolution = {
  holeId: string;
  holeLabel: string;
  register: "fundamental" | "third";
  targetHz: number;
  solvedZMm: number;
  solvedDiameterMm: number;
  predictedHz: number;
  centsError: number;
};

export type HoleTriangulationMode = "z-and-diameter" | "z-only";

export type TuningSensitivityOptions = {
  diameterStepMm?: number;
  zStepMm?: number;
  chimneyStepMm?: number;
  maxSuggestedDiameterDeltaMm?: number;
  maxSuggestedZDeltaMm?: number;
  maxSuggestedChimneyDeltaMm?: number;
  sensitivityFloor?: number;
};

export type FingeringTuningSensitivity = {
  fingeringId: string;
  fingeringLabel: string;
  register: "fundamental" | "third";
  targetNote: string;
  predictedHz: number | null;
  centsErrorToTarget: number | null;
  soundingHoleId: string | null;
  soundingHoleLabel: string;
  centsPerMmDiameter: number | null;
  centsPerMmZ: number | null;
  centsPerMmChimney: number | null;
  suggestedDeltaDiameterMm: number | null;
  suggestedDeltaZMm: number | null;
  suggestedDeltaChimneyMm: number | null;
  note: string;
};

const NOTE_NAMES = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeHoleAngleDeg(angleDeg: number): number {
  if (!Number.isFinite(angleDeg)) {
    return 0;
  }
  let wrapped = ((angleDeg + 180) % 360 + 360) % 360 - 180;
  if (wrapped === -180) {
    wrapped = -180;
  }
  return wrapped;
}

function minimalAngleDeltaDeg(aDeg: number, bDeg: number): number {
  const a = normalizeHoleAngleDeg(aDeg);
  const b = normalizeHoleAngleDeg(bDeg);
  const raw = Math.abs(a - b);
  return Math.min(raw, 360 - raw);
}

/** 3D point */
export type Vec3 = { x: number; y: number; z: number };

/** Calculate 3D bore path from segments and bends. Each point carries its acoustic z (mm from bell). */
export function calculateBorePathPoints(
  segments: BoreSegment[],
  bends: BoreBend[]
): PathPoint[] {
  if (segments.length === 0) return [];

  const sortedSegs = [...segments].sort((a, b) => a.zMm - b.zMm);
  const totalLength = totalBoreLengthMm(sortedSegs);

  const mappedBends = bends
    .map((b) => ({ ...b, zFromBell: totalLength - b.pathDistanceMm }))
    .filter((b) => b.zFromBell >= 0 && b.zFromBell <= totalLength)
    .sort((a, b) => a.zFromBell - b.zFromBell);

  // All waypoint z-positions: segment boundaries + bend positions
  const waypointSet = new Set<number>();
  sortedSegs.forEach((s) => waypointSet.add(s.zMm));
  mappedBends.forEach((b) => waypointSet.add(b.zFromBell));
  const allZ = Array.from(waypointSet).sort((a, b) => a - b);

  // Rotation helpers — sign conventions match the original model XZ/YZ matrices
  const rotXZ = (v: Vec3, rad: number): Vec3 => ({
    x: v.x * Math.cos(rad) + v.z * Math.sin(rad),
    y: v.y,
    z: v.z * Math.cos(rad) - v.x * Math.sin(rad),
  });
  const rotYZ = (v: Vec3, rad: number): Vec3 => ({
    x: v.x,
    y: v.y * Math.cos(rad) + v.z * Math.sin(rad),
    z: v.z * Math.cos(rad) - v.y * Math.sin(rad),
  });
  const rotInPlane = (v: Vec3, rad: number, plane: "xz" | "yz"): Vec3 =>
    plane === "xz" ? rotXZ(v, rad) : rotYZ(v, rad);
  const norm3 = (v: Vec3): Vec3 => {
    const len = Math.sqrt(v.x ** 2 + v.y ** 2 + v.z ** 2);
    return len > 0 ? { x: v.x / len, y: v.y / len, z: v.z / len } : v;
  };

  const points: PathPoint[] = [];
  let pos: Vec3 = { x: 0, y: 0, z: 0 };
  let dir: Vec3 = { x: 0, y: 0, z: 1 };

  for (let i = 0; i < allZ.length; i++) {
    const z = allZ[i];
    points.push({ ...pos, acousticZ: z });

    const bend = mappedBends.find((b) => Math.abs(b.zFromBell - z) < 0.5);
    if (bend) {
      const φRad = (bend.bendAngleDeg * Math.PI) / 180;
      const R = bend.bendRadiusMm ?? 50;
      const ARC_STEPS = Math.max(8, Math.ceil(Math.abs(bend.bendAngleDeg) / 4));

      // Perpendicular to dir in the bend plane toward the inside of the curve:
      // rotate dir by +90° for positive angle, -90° for negative
      const perpRad = φRad >= 0 ? Math.PI / 2 : -Math.PI / 2;
      const centerDir = norm3(rotInPlane(dir, perpRad, bend.bendAxisPlane));

      const center: Vec3 = {
        x: pos.x + R * centerDir.x,
        y: pos.y + R * centerDir.y,
        z: pos.z + R * centerDir.z,
      };
      const startVec: Vec3 = { x: pos.x - center.x, y: pos.y - center.y, z: pos.z - center.z };

      // Generate arc points; step 0 is already pushed above as the straight-arrival point
      let lastVec = startVec;
      for (let step = 1; step <= ARC_STEPS; step++) {
        const θ = (step / ARC_STEPS) * φRad;
        lastVec = rotInPlane(startVec, θ, bend.bendAxisPlane);
        points.push({
          x: center.x + lastVec.x,
          y: center.y + lastVec.y,
          z: center.z + lastVec.z,
          acousticZ: z,
        });
      }

      // Update position to arc end; update direction to post-bend direction
      pos = { x: center.x + lastVec.x, y: center.y + lastVec.y, z: center.z + lastVec.z };
      dir = norm3(rotInPlane(dir, φRad, bend.bendAxisPlane));
    }

    // Advance along current direction to the next waypoint
    if (i < allZ.length - 1) {
      const segLen = allZ[i + 1] - z;
      pos = {
        x: pos.x + dir.x * segLen,
        y: pos.y + dir.y * segLen,
        z: pos.z + dir.z * segLen,
      };
    }
  }

  points.push({ ...pos, acousticZ: totalLength });
  return points;
}

/** Calculate 3D position at a given path distance from mouthpiece. */
export function position3DAlongPath(
  segments: BoreSegment[],
  bends: BoreBend[],
  pathDistanceMm: number
): Vec3 {
  const points = calculateBorePathPoints(segments, bends);
  if (points.length < 2) {
    return { x: 0, y: 0, z: 0 };
  }

  const totalLength = totalBoreLengthMm(segments);
  const clampedDist = clamp(pathDistanceMm, 0, totalLength);

  // Find segment containing this distance
  let cumulativeLength = 0;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p1 = points[i];
    const p2 = points[i + 1];
    const segLength = Math.sqrt(
      (p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2 + (p2.z - p1.z) ** 2
    );

    if (cumulativeLength + segLength >= clampedDist) {
      const t = (clampedDist - cumulativeLength) / Math.max(segLength, 0.001);
      return {
        x: p1.x + t * (p2.x - p1.x),
        y: p1.y + t * (p2.y - p1.y),
        z: p1.z + t * (p2.z - p1.z),
      };
    }
    cumulativeLength += segLength;
  }

  return points[points.length - 1];
}

export function speedOfSoundMs(tempC: number): number {
  return 331.3 + 0.606 * tempC;
}

export function outerDiameterAtMm(segments: BoreSegment[], xMm: number): number | null {
  const points = [...segments]
    .filter((s) => s.outerDiameterMm !== undefined && s.outerDiameterMm !== null)
    .sort((a, b) => a.zMm - b.zMm);

  if (points.length === 0) {
    return null;
  }

  const total = Math.max(...segments.map((s) => Math.max(s.zMm, 0)), 0);
  const x = clamp(xMm, 0, total);
  const z = total - x;

  if (z <= points[0].zMm) {
    return points[0].outerDiameterMm!;
  }
  if (z >= points[points.length - 1].zMm) {
    return points[points.length - 1].outerDiameterMm!;
  }

  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    if (z <= b.zMm) {
      const dz = Math.max(b.zMm - a.zMm, 0.001);
      const t = (z - a.zMm) / dz;
      return a.outerDiameterMm! + t * (b.outerDiameterMm! - a.outerDiameterMm!);
    }
  }

  return points[points.length - 1].outerDiameterMm!;
}

export function totalBoreLengthMm(segments: BoreSegment[]): number {
  if (segments.length === 0) {
    return 0;
  }
  return Math.max(...segments.map((segment) => Math.max(segment.zMm, 0)));
}

export function diameterAtMm(segments: BoreSegment[], xMm: number): number {
  if (segments.length === 0) {
    return 14;
  }

  const points = [...segments].sort((a, b) => a.zMm - b.zMm);
  const total = totalBoreLengthMm(points);

  // x increases from mouthpiece to bell, while z=0 is bell end.
  const x = clamp(xMm, 0, total);
  const z = total - x;

  if (z <= points[0].zMm) {
    return points[0].diameterMm;
  }
  if (z >= points[points.length - 1].zMm) {
    return points[points.length - 1].diameterMm;
  }

  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    if (z <= b.zMm) {
      const dz = Math.max(b.zMm - a.zMm, 0.001);
      const t = (z - a.zMm) / dz;
      return a.diameterMm + t * (b.diameterMm - a.diameterMm);
    }
  }

  return points[points.length - 1].diameterMm;
}

function frequencyFromQuarterWave(lengthMm: number, cMs: number): number {
  const lengthM = Math.max(lengthMm, 5) / 1000;
  return cMs / (4 * lengthM);
}

function lengthFromQuarterWave(frequencyHz: number, cMs: number): number {
  const hz = Math.max(frequencyHz, 0.001);
  return (cMs / (4 * hz)) * 1000;
}

function oddHarmonic(fundamentalHz: number, harmonicIndex: number): number {
  const n = 2 * harmonicIndex - 1;
  return fundamentalHz * n;
}

function hzToMidi(freq: number, a4Hz: number): number {
  return 69 + 12 * Math.log2(freq / a4Hz);
}

function midiToHz(midi: number, a4Hz: number): number {
  return a4Hz * Math.pow(2, (midi - 69) / 12);
}

export function scientificPitchToHz(note: string, a4Hz = 440): number | null {
  const midi = parseScientificPitch(note);
  if (midi === null) {
    return null;
  }
  return midiToHz(midi, a4Hz);
}

export function midiToName(midi: number): string {
  const rounded = Math.round(midi);
  const note = NOTE_NAMES[((rounded % 12) + 12) % 12];
  const octave = Math.floor(rounded / 12) - 1;
  return `${note}${octave}`;
}

export function parseScientificPitch(note: string): number | null {
  const trimmed = note.trim().toUpperCase();
  const match = trimmed.match(/^([A-G])(#|B)?(-?\d)$/);
  if (!match) {
    return null;
  }
  const [, base, accidental, octaveRaw] = match;
  const octave = Number(octaveRaw);
  const baseIndex = NOTE_NAMES.indexOf(base);
  if (baseIndex < 0) {
    return null;
  }

  let semitone = baseIndex;
  if (accidental === "#") {
    semitone += 1;
  }
  if (accidental === "B") {
    semitone -= 1;
  }

  return 12 * (octave + 1) + semitone;
}

function centsError(actualHz: number, targetHz: number): number {
  return 1200 * Math.log2(actualHz / targetHz);
}

function effectiveLengthForHole(
  hole: ToneHole,
  localBoreMm: number,
  acousticZMm: number,
  drillAngleDeg: number
): number {
  const rb = Math.max(localBoreMm * 0.5, 0.5);
  const rh = Math.max(hole.diameterMm * 0.5, 0.3);
  const chimney = Math.max(hole.chimneyMm, 0.1);

  // Oblique drilling corrections:
  // - chimneyMm is already stored as drill-path length (inner-to-outer opening)
  // - Bore-side aperture is an ellipse with area π·rh²/cos(φ)
  const phi = (drillAngleDeg * Math.PI) / 180;
  const cosφ = Math.max(Math.cos(phi), 0.1); // guard against ≥90°
  const obliqueChimney = chimney;
  const obliqueHoleArea = Math.PI * rh * rh / cosφ;

  const boreArea = Math.PI * rb * rb;

  // Use a Keefe-style effective chimney, then add a partial contribution from
  // the downstream tube below the open hole. This better matches large clarinet
  // finger holes than the previous inertance-only approximation.
  const effectiveChimneyMm = obliqueChimney + 0.47 * rh + 0.821 * rh;
  const holeShuntTermMm = (boreArea / obliqueHoleArea) * effectiveChimneyMm;
  const downstreamLoadTermMm = acousticZMm * (obliqueHoleArea / (boreArea + obliqueHoleArea));
  return holeShuntTermMm + downstreamLoadTermMm;
}

function correctionAdvice(targetNote: string, centsToTarget: number | null): string {
  const trimmedTarget = targetNote.trim();

  if (trimmedTarget.length === 0) {
    return "Add a target note for direct tuning guidance.";
  }

  if (centsToTarget === null) {
    return `Target note \"${trimmedTarget}\" is invalid. Use scientific pitch like E4, F#4, or Bb3.`;
  }
  if (Math.abs(centsToTarget) <= 5) {
    return `Near target (${trimmedTarget}). Keep geometry, then verify with impedance or prototype tests.`;
  }
  if (centsToTarget > 0) {
    return `Sharp vs target ${trimmedTarget}: increase effective length (move hole toward bell / lower z, reduce hole diameter, or increase chimney).`;
  }
  return `Flat vs target ${trimmedTarget}: decrease effective length (move hole toward mouthpiece / higher z, enlarge hole diameter, or reduce chimney).`;
}

function distanceFromMouthpieceMm(segments: BoreSegment[], holeZMm: number): number {
  const total = totalBoreLengthMm(segments);
  return clamp(total - holeZMm, 0, total);
}

function findHoleById(holes: ToneHole[], id: string): ToneHole | null {
  for (const hole of holes) {
    if (hole.id === id) {
      return hole;
    }
  }
  return null;
}

function fundamentalFromBellTermination(segments: BoreSegment[], cMs: number): number {
  return frequencyFromQuarterWave(Math.max(totalBoreLengthMm(segments), 0.1), cMs);
}

export function predictClosedTubeFundamentalHz(
  segments: BoreSegment[],
  tempC: number
): number {
  const cMs = speedOfSoundMs(tempC);
  return fundamentalFromBellTermination(segments, cMs);
}

export function requiredClosedTubeAcousticLengthMm(
  targetFundamentalHz: number,
  tempC: number
): number | null {
  if (!Number.isFinite(targetFundamentalHz) || targetFundamentalHz <= 0) {
    return null;
  }

  const cMs = speedOfSoundMs(tempC);
  return lengthFromQuarterWave(targetFundamentalHz, cMs);
}

function fundamentalFromHoleTermination(
  segments: BoreSegment[],
  hole: ToneHole,
  cMs: number
): number {
  const drillAngleDeg = hole.drillAngleDeg ?? 0;
  const nominalDistanceMm = distanceFromMouthpieceMm(segments, hole.zMm);
  const nominalBoreMm = diameterAtMm(segments, nominalDistanceMm);
  const phi = (drillAngleDeg * Math.PI) / 180;
  // Acoustic center of the bore-wall intersection shifts toward the mouthpiece
  // (higher z) by rb·tan(φ) when the hole is tilted toward the mouthpiece.
  const acousticZMm = hole.zMm + nominalBoreMm * 0.5 * Math.tan(phi);
  const holeDistanceMm = distanceFromMouthpieceMm(segments, acousticZMm);
  const localBoreMm = diameterAtMm(segments, holeDistanceMm);
  const effectiveLengthMm = holeDistanceMm + effectiveLengthForHole(hole, localBoreMm, acousticZMm, drillAngleDeg);
  return frequencyFromQuarterWave(effectiveLengthMm, cMs);
}

function firstOpenBelowHole(
  holes: ToneHole[],
  referenceHoleId: string
): ToneHole | null {
  const ordered = [...holes].sort((a, b) => a.zMm - b.zMm);
  const index = ordered.findIndex((hole) => hole.id === referenceHoleId);
  if (index <= 0) {
    return null;
  }
  return ordered[index - 1];
}

function resolveSoundingHoleForFingering(
  holes: ToneHole[],
  fingering: Fingering
): ToneHole | null {
  if (fingering.termination === "bell") {
    return null;
  }

  const selected = findHoleById(holes, fingering.ventHoleId);
  if (!selected) {
    return null;
  }

  if (fingering.termination !== "below-open-vent-closed") {
    return selected;
  }

  const openBelow = firstOpenBelowHole(holes, selected.id);
  return openBelow ?? null;
}

function evaluateSingleFingering(
  segments: BoreSegment[],
  holes: ToneHole[],
  fingering: Fingering,
  tempC: number,
  a4Hz: number
): FingeringEvaluation {
  const result = evaluateFingerings(
    segments,
    holes,
    [fingering],
    tempC,
    10,
    a4Hz
  )[0];
  return result;
}

function perturbHoleGeometry(
  holes: ToneHole[],
  holeId: string,
  key: "diameterMm" | "zMm" | "chimneyMm",
  deltaMm: number
): ToneHole[] {
  return holes.map((hole) => {
    if (hole.id !== holeId) {
      return hole;
    }

    const nextValue = Math.max(hole[key] + deltaMm, 0.01);
    return {
      ...hole,
      [key]: nextValue,
    };
  });
}

function centralDifferenceSensitivity(
  segments: BoreSegment[],
  holes: ToneHole[],
  fingering: Fingering,
  holeId: string,
  key: "diameterMm" | "zMm" | "chimneyMm",
  stepMm: number,
  tempC: number,
  a4Hz: number
): number | null {
  const step = Math.max(stepMm, 0.001);
  const plusHoles = perturbHoleGeometry(holes, holeId, key, step);
  const minusHoles = perturbHoleGeometry(holes, holeId, key, -step);

  const plus = evaluateSingleFingering(segments, plusHoles, fingering, tempC, a4Hz);
  const minus = evaluateSingleFingering(segments, minusHoles, fingering, tempC, a4Hz);

  if (plus.centsErrorToTarget === null || minus.centsErrorToTarget === null) {
    return null;
  }

  return (plus.centsErrorToTarget - minus.centsErrorToTarget) / (2 * step);
}

function suggestedDeltaFromSensitivity(
  centsErrorToTarget: number,
  sensitivity: number | null,
  maxAbsDeltaMm: number,
  sensitivityFloor: number
): number | null {
  if (sensitivity === null || Math.abs(sensitivity) < sensitivityFloor) {
    return null;
  }

  const raw = -centsErrorToTarget / sensitivity;
  return clamp(raw, -Math.abs(maxAbsDeltaMm), Math.abs(maxAbsDeltaMm));
}

function predictedHoleRegisterHz(
  segments: BoreSegment[],
  hole: ToneHole,
  cMs: number,
  register: "fundamental" | "third"
): number {
  const fundamentalHz = fundamentalFromHoleTermination(segments, hole, cMs);
  return register === "third" ? oddHarmonic(fundamentalHz, 2) : fundamentalHz;
}

function targetScore(
  predictedHz: number,
  targetHz: number,
  candidateZMm: number,
  candidateDiameterMm: number,
  anchorZMm: number,
  anchorDiameterMm: number
): number {
  const cents = Math.abs(centsError(predictedHz, targetHz));
  const zPenalty = Math.abs(candidateZMm - anchorZMm) * 0.05;
  const diameterPenalty = Math.abs(candidateDiameterMm - anchorDiameterMm) * 1.8;
  return cents + zPenalty + diameterPenalty;
}

export function triangulateHoleForTargetHz(
  segments: BoreSegment[],
  holes: ToneHole[],
  holeId: string,
  targetHz: number,
  tempC: number,
  register: "fundamental" | "third" = "fundamental",
  mode: HoleTriangulationMode = "z-and-diameter"
): HoleTriangulationSolution | null {
  if (!Number.isFinite(targetHz) || targetHz <= 0) {
    return null;
  }

  const cMs = speedOfSoundMs(tempC);
  const sourceHole = findHoleById(holes, holeId);
  if (!sourceHole) {
    return null;
  }

  const totalLengthMm = totalBoreLengthMm(segments);
  const zMin = 0.5;
  const zMax = Math.max(totalLengthMm - 0.5, zMin + 1);

  const initialZMin = clamp(sourceHole.zMm - 95, zMin, zMax);
  const initialZMax = clamp(sourceHole.zMm + 95, zMin, zMax);
  const initialDiaMin =
    mode === "z-only" ? sourceHole.diameterMm : Math.max(0.8, sourceHole.diameterMm - 4.5);
  const initialDiaMax =
    mode === "z-only" ? sourceHole.diameterMm : Math.min(14, sourceHole.diameterMm + 4.5);

  let best = {
    zMm: sourceHole.zMm,
    diameterMm: sourceHole.diameterMm,
    predictedHz: predictedHoleRegisterHz(segments, sourceHole, cMs, register),
    score: Number.POSITIVE_INFINITY,
  };

  const evaluateCandidate = (zMm: number, diameterMm: number): void => {
    const candidate: ToneHole = {
      ...sourceHole,
      zMm: clamp(zMm, zMin, zMax),
      diameterMm: clamp(diameterMm, 0.5, 16),
    };
    const predictedHz = predictedHoleRegisterHz(segments, candidate, cMs, register);
    const score = targetScore(
      predictedHz,
      targetHz,
      candidate.zMm,
      candidate.diameterMm,
      sourceHole.zMm,
      sourceHole.diameterMm
    );
    if (score < best.score) {
      best = {
        zMm: candidate.zMm,
        diameterMm: candidate.diameterMm,
        predictedHz,
        score,
      };
    }
  };

  let zLow = initialZMin;
  let zHigh = initialZMax;
  let diaLow = initialDiaMin;
  let diaHigh = initialDiaMax;

  const passes =
    mode === "z-only"
      ? [
          { zSteps: 40, diaSteps: 1 },
          { zSteps: 34, diaSteps: 1 },
          { zSteps: 28, diaSteps: 1 },
        ]
      : [
          { zSteps: 30, diaSteps: 24 },
          { zSteps: 26, diaSteps: 22 },
          { zSteps: 20, diaSteps: 18 },
        ];

  for (const pass of passes) {
    const zDen = Math.max(pass.zSteps - 1, 1);
    const diaDen = Math.max(pass.diaSteps - 1, 1);

    for (let i = 0; i < pass.zSteps; i += 1) {
      const z = zLow + ((zHigh - zLow) * i) / zDen;
      for (let j = 0; j < pass.diaSteps; j += 1) {
        const dia = diaLow + ((diaHigh - diaLow) * j) / diaDen;
        evaluateCandidate(z, dia);
      }
    }

    const zSpan = Math.max((zHigh - zLow) * 0.22, 3.5);
    const diaSpan = mode === "z-only" ? 0 : Math.max((diaHigh - diaLow) * 0.22, 0.4);
    zLow = clamp(best.zMm - zSpan, zMin, zMax);
    zHigh = clamp(best.zMm + zSpan, zMin, zMax);
    if (mode === "z-only") {
      diaLow = sourceHole.diameterMm;
      diaHigh = sourceHole.diameterMm;
    } else {
      diaLow = Math.max(0.8, best.diameterMm - diaSpan);
      diaHigh = Math.min(14, best.diameterMm + diaSpan);
    }
  }

  const cents = centsError(best.predictedHz, targetHz);

  return {
    holeId: sourceHole.id,
    holeLabel: sourceHole.label,
    register,
    targetHz,
    solvedZMm: best.zMm,
    solvedDiameterMm: best.diameterMm,
    predictedHz: best.predictedHz,
    centsError: cents,
  };
}

export function evaluateToneHoles(
  segments: BoreSegment[],
  holes: ToneHole[],
  tempC: number,
  a4Hz = 440,
  _fingerings: Fingering[] = []
): HoleEvaluation[] {
  const cMs = speedOfSoundMs(tempC);

  return [...holes]
    .sort((a, b) => a.zMm - b.zMm)
    .map((hole) => {
      const drillAngleDeg = hole.drillAngleDeg ?? 0;
      const nominalDistanceMm = distanceFromMouthpieceMm(segments, hole.zMm);
      const nominalBoreMm = diameterAtMm(segments, nominalDistanceMm);
      const phi = (drillAngleDeg * Math.PI) / 180;
      const acousticZMm = hole.zMm + nominalBoreMm * 0.5 * Math.tan(phi);
      const holeDistanceMm = distanceFromMouthpieceMm(segments, acousticZMm);
      const localBoreMm = diameterAtMm(segments, holeDistanceMm);
      const outerDia = outerDiameterAtMm(segments, nominalDistanceMm);
      const wallThicknessMm =
        outerDia !== null ? Math.max(0, (outerDia - localBoreMm) / 2) : null;
      const effectiveLengthMm = holeDistanceMm + effectiveLengthForHole(hole, localBoreMm, acousticZMm, drillAngleDeg);
      const fundamentalHz = frequencyFromQuarterWave(effectiveLengthMm, cMs);
      const thirdHz = oddHarmonic(fundamentalHz, 2);

      // Tone-hole table is always per-row-hole-open.
      const activeRegister: "fundamental" = "fundamental";
      const activeTermination: "vent-hole" = "vent-hole";
      const predictedActiveHz = fundamentalHz;

      const nearestMidi = Math.round(hzToMidi(fundamentalHz, a4Hz));
      const nearestHz = midiToHz(nearestMidi, a4Hz);
      const centsToNearest = centsError(fundamentalHz, nearestHz);

      const targetMidi = parseScientificPitch(hole.targetNote);
      const targetHz = targetMidi === null ? null : midiToHz(targetMidi, a4Hz);
      const centsToTarget =
        targetHz === null ? null : centsError(fundamentalHz, targetHz);

      return {
        id: hole.id,
        label: hole.label,
        zMm: hole.zMm,
        localBoreMm,
        wallThicknessMm,
        effectiveLengthMm,
        predictedFundamentalHz: fundamentalHz,
        predictedThirdHz: thirdHz,
        activeRegister,
        activeTermination,
        predictedActiveHz,
        targetHz,
        nearestNote: midiToName(nearestMidi),
        centsErrorToNearest: centsToNearest,
        centsErrorToTarget: centsToTarget,
        recommendation: correctionAdvice(hole.targetNote, centsToTarget),
      };
    });
}

export function evaluateFingerings(
  segments: BoreSegment[],
  holes: ToneHole[],
  fingerings: Fingering[],
  tempC: number,
  toleranceCents: number,
  a4Hz = 440
): FingeringEvaluation[] {
  const cMs = speedOfSoundMs(tempC);
  const tol = Math.max(Math.abs(toleranceCents), 0.1);

  return fingerings.map((fingering) => {
    if (fingering.termination === "bell") {
      const fundamentalHz = fundamentalFromBellTermination(segments, cMs);
      const predictedHz =
        fingering.register === "third" ? oddHarmonic(fundamentalHz, 2) : fundamentalHz;

      const targetMidi = parseScientificPitch(fingering.targetNote);
      if (targetMidi === null) {
        return {
          id: fingering.id,
          label: fingering.label,
          targetNote: fingering.targetNote,
          ventHoleLabel: "Bell termination",
          register: fingering.register,
          predictedHz,
          nearestNote: midiToName(Math.round(hzToMidi(predictedHz, a4Hz))),
          centsErrorToTarget: null,
          withinTolerance: false,
          note: "Target note format should look like E4, F#4, or Bb3.",
        };
      }

      const targetHz = midiToHz(targetMidi, a4Hz);
      const cents = centsError(predictedHz, targetHz);

      return {
        id: fingering.id,
        label: fingering.label,
        targetNote: fingering.targetNote,
        ventHoleLabel: "Bell termination",
        register: fingering.register,
        predictedHz,
        nearestNote: midiToName(Math.round(hzToMidi(predictedHz, a4Hz))),
        centsErrorToTarget: cents,
        withinTolerance: Math.abs(cents) <= tol,
        note:
          Math.abs(cents) <= tol
            ? "In band"
            : cents > 0
              ? "Sharp"
              : "Flat",
      };
    }

    const hole = findHoleById(holes, fingering.ventHoleId);
    if (!hole) {
      return {
        id: fingering.id,
        label: fingering.label,
        targetNote: fingering.targetNote,
        ventHoleLabel: "(missing)",
        register: fingering.register,
        predictedHz: null,
        nearestNote: "N/A",
        centsErrorToTarget: null,
        withinTolerance: false,
        note: "Selected vent hole no longer exists.",
      };
    }

    let soundingHole = hole;
    let resolvedVentHoleLabel = hole.label;
    if (fingering.termination === "below-open-vent-closed") {
      const openBelow = firstOpenBelowHole(holes, hole.id);
      if (openBelow) {
        soundingHole = openBelow;
        resolvedVentHoleLabel =
          `${openBelow.label} (first open below selected ${hole.label})`;
      } else {
        const bellFundamentalHz = fundamentalFromBellTermination(segments, cMs);
        const predictedHz =
          fingering.register === "third" ? oddHarmonic(bellFundamentalHz, 2) : bellFundamentalHz;

        const targetMidi = parseScientificPitch(fingering.targetNote);
        if (targetMidi === null) {
          return {
            id: fingering.id,
            label: fingering.label,
            targetNote: fingering.targetNote,
            ventHoleLabel: "Bell termination (no lower hole)",
            register: fingering.register,
            predictedHz,
            nearestNote: midiToName(Math.round(hzToMidi(predictedHz, a4Hz))),
            centsErrorToTarget: null,
            withinTolerance: false,
            note: "Target note format should look like E4, F#4, or Bb3.",
          };
        }

        const targetHz = midiToHz(targetMidi, a4Hz);
        const cents = centsError(predictedHz, targetHz);
        return {
          id: fingering.id,
          label: fingering.label,
          targetNote: fingering.targetNote,
          ventHoleLabel: "Bell termination (no lower hole)",
          register: fingering.register,
          predictedHz,
          nearestNote: midiToName(Math.round(hzToMidi(predictedHz, a4Hz))),
          centsErrorToTarget: cents,
          withinTolerance: Math.abs(cents) <= tol,
          note:
            Math.abs(cents) <= tol
              ? "In band"
              : cents > 0
                ? "Sharp"
                : "Flat",
        };
      }
    }

    const fundamentalHz = fundamentalFromHoleTermination(segments, soundingHole, cMs);
    const predictedHz =
      fingering.register === "third" ? oddHarmonic(fundamentalHz, 2) : fundamentalHz;

    const targetMidi = parseScientificPitch(fingering.targetNote);
    if (targetMidi === null) {
      return {
        id: fingering.id,
        label: fingering.label,
        targetNote: fingering.targetNote,
        ventHoleLabel: resolvedVentHoleLabel,
        register: fingering.register,
        predictedHz,
        nearestNote: midiToName(Math.round(hzToMidi(predictedHz, a4Hz))),
        centsErrorToTarget: null,
        withinTolerance: false,
        note: "Target note format should look like E4, F#4, or Bb3.",
      };
    }

    const targetHz = midiToHz(targetMidi, a4Hz);
    const cents = centsError(predictedHz, targetHz);

    return {
      id: fingering.id,
      label: fingering.label,
      targetNote: fingering.targetNote,
      ventHoleLabel: resolvedVentHoleLabel,
      register: fingering.register,
      predictedHz,
      nearestNote: midiToName(Math.round(hzToMidi(predictedHz, a4Hz))),
      centsErrorToTarget: cents,
      withinTolerance: Math.abs(cents) <= tol,
      note:
        Math.abs(cents) <= tol
          ? "In band"
          : cents > 0
            ? "Sharp"
            : "Flat",
    };
  });
}

export function evaluateFingeringTuningSensitivity(
  segments: BoreSegment[],
  holes: ToneHole[],
  fingering: Fingering,
  tempC: number,
  a4Hz = 440,
  options: TuningSensitivityOptions = {}
): FingeringTuningSensitivity {
  const diameterStepMm = Math.max(options.diameterStepMm ?? 0.1, 0.01);
  const zStepMm = Math.max(options.zStepMm ?? 0.5, 0.01);
  const chimneyStepMm = Math.max(options.chimneyStepMm ?? 0.1, 0.01);
  const maxSuggestedDiameterDeltaMm = Math.max(options.maxSuggestedDiameterDeltaMm ?? 1.5, 0.01);
  const maxSuggestedZDeltaMm = options.maxSuggestedZDeltaMm != null ? Math.max(options.maxSuggestedZDeltaMm, 0.01) : Infinity;
  const maxSuggestedChimneyDeltaMm = Math.max(options.maxSuggestedChimneyDeltaMm ?? 2.5, 0.01);
  const sensitivityFloor = Math.max(options.sensitivityFloor ?? 1e-3, 1e-6);

  const base = evaluateSingleFingering(segments, holes, fingering, tempC, a4Hz);
  const soundingHole = resolveSoundingHoleForFingering(holes, fingering);

  if (base.centsErrorToTarget === null) {
    return {
      fingeringId: fingering.id,
      fingeringLabel: fingering.label,
      register: fingering.register,
      targetNote: fingering.targetNote,
      predictedHz: base.predictedHz,
      centsErrorToTarget: null,
      soundingHoleId: soundingHole?.id ?? null,
      soundingHoleLabel: soundingHole?.label ?? "N/A",
      centsPerMmDiameter: null,
      centsPerMmZ: null,
      centsPerMmChimney: null,
      suggestedDeltaDiameterMm: null,
      suggestedDeltaZMm: null,
      suggestedDeltaChimneyMm: null,
      note: "Target note format is invalid for sensitivity analysis.",
    };
  }

  if (soundingHole === null) {
    return {
      fingeringId: fingering.id,
      fingeringLabel: fingering.label,
      register: fingering.register,
      targetNote: fingering.targetNote,
      predictedHz: base.predictedHz,
      centsErrorToTarget: base.centsErrorToTarget,
      soundingHoleId: null,
      soundingHoleLabel: "Bell termination",
      centsPerMmDiameter: null,
      centsPerMmZ: null,
      centsPerMmChimney: null,
      suggestedDeltaDiameterMm: null,
      suggestedDeltaZMm: null,
      suggestedDeltaChimneyMm: null,
      note: "Bell termination does not map to a single adjustable hole.",
    };
  }

  const centsPerMmDiameter = centralDifferenceSensitivity(
    segments,
    holes,
    fingering,
    soundingHole.id,
    "diameterMm",
    diameterStepMm,
    tempC,
    a4Hz
  );
  const centsPerMmZ = centralDifferenceSensitivity(
    segments,
    holes,
    fingering,
    soundingHole.id,
    "zMm",
    zStepMm,
    tempC,
    a4Hz
  );
  const centsPerMmChimney = centralDifferenceSensitivity(
    segments,
    holes,
    fingering,
    soundingHole.id,
    "chimneyMm",
    chimneyStepMm,
    tempC,
    a4Hz
  );

  const suggestedDeltaDiameterMm = suggestedDeltaFromSensitivity(
    base.centsErrorToTarget,
    centsPerMmDiameter,
    maxSuggestedDiameterDeltaMm,
    sensitivityFloor
  );
  const suggestedDeltaZMm = suggestedDeltaFromSensitivity(
    base.centsErrorToTarget,
    centsPerMmZ,
    maxSuggestedZDeltaMm,
    sensitivityFloor
  );
  const suggestedDeltaChimneyMm = suggestedDeltaFromSensitivity(
    base.centsErrorToTarget,
    centsPerMmChimney,
    maxSuggestedChimneyDeltaMm,
    sensitivityFloor
  );

  return {
    fingeringId: fingering.id,
    fingeringLabel: fingering.label,
    register: fingering.register,
    targetNote: fingering.targetNote,
    predictedHz: base.predictedHz,
    centsErrorToTarget: base.centsErrorToTarget,
    soundingHoleId: soundingHole.id,
    soundingHoleLabel: soundingHole.label,
    centsPerMmDiameter,
    centsPerMmZ,
    centsPerMmChimney,
    suggestedDeltaDiameterMm,
    suggestedDeltaZMm,
    suggestedDeltaChimneyMm,
    note: "Computed via local finite differences around current geometry.",
  };
}

export function evaluateFingeringTuningSensitivities(
  segments: BoreSegment[],
  holes: ToneHole[],
  fingerings: Fingering[],
  tempC: number,
  a4Hz = 440,
  options: TuningSensitivityOptions = {}
): FingeringTuningSensitivity[] {
  return fingerings.map((fingering) =>
    evaluateFingeringTuningSensitivity(
      segments,
      holes,
      fingering,
      tempC,
      a4Hz,
      options
    )
  );
}

export function spacingWarnings(
  holes: ToneHole[],
  segments: BoreSegment[]
): string[] {
  const ordered = [...holes].sort((a, b) => a.zMm - b.zMm);
  const warnings: string[] = [];

  for (let i = 0; i < ordered.length; i += 1) {
    for (let j = i + 1; j < ordered.length; j += 1) {
      const a = ordered[i];
      const b = ordered[j];
      const axialGapMm = Math.abs(b.zMm - a.zMm);

      const localBoreA = diameterAtMm(segments, distanceFromMouthpieceMm(segments, a.zMm));
      const localBoreB = diameterAtMm(segments, distanceFromMouthpieceMm(segments, b.zMm));
      const avgRadiusMm = Math.max((localBoreA + localBoreB) * 0.25, 0.5);

      const deltaAngleRad = (minimalAngleDeltaDeg(a.angleDeg, b.angleDeg) * Math.PI) / 180;
      const circumferentialGapMm = avgRadiusMm * deltaAngleRad;
      const centerDistanceMm = Math.hypot(axialGapMm, circumferentialGapMm);

      const localBore = Math.max((localBoreA + localBoreB) * 0.5, 1);
      const threshold = Math.max(localBore * 0.8, 8);

      if (centerDistanceMm < threshold) {
        warnings.push(
          `${a.label} to ${b.label} separation (${centerDistanceMm.toFixed(1)} mm along body) may be too tight for stable venting and finger ergonomics.`
        );
      }
    }
  }

  return warnings;
}

export function modelConfidenceWarnings(
  holes: ToneHole[],
  segments: BoreSegment[],
  fingerings: Fingering[] = []
): string[] {
  const warnings: string[] = [];
  const minSegmentDiameterMm = segments.reduce(
    (minDiameter, segment) => Math.min(minDiameter, Math.max(segment.diameterMm, 0.1)),
    Number.POSITIVE_INFINITY
  );

  for (const hole of holes) {
    const holeDistanceMm = distanceFromMouthpieceMm(segments, hole.zMm);
    const localBoreMm = diameterAtMm(segments, holeDistanceMm);
    const rb = Math.max(localBoreMm * 0.5, 0.5);
    const rh = Math.max(hole.diameterMm * 0.5, 0.3);
    const boreArea = Math.PI * rb * rb;
    const holeArea = Math.PI * rh * rh;
    const areaFraction = holeArea / boreArea;

    if (areaFraction > 0.2) {
      warnings.push(
        `${hole.label} is a large tone hole relative to the local bore (${(areaFraction * 100).toFixed(0)}% of bore area). The current first-order hole model becomes less reliable as hole size approaches bore size.`
      );
    }

    if (
      Number.isFinite(minSegmentDiameterMm) &&
      localBoreMm > minSegmentDiameterMm * 1.15
    ) {
      warnings.push(
        `${hole.label} sits in a strongly flared bore region (${localBoreMm.toFixed(1)} mm local bore versus ${minSegmentDiameterMm.toFixed(1)} mm minimum bore). Bell-flare holes often need a full impedance model for accurate pitch prediction.`
      );
    }
  }

  for (const fingering of fingerings) {
    if (fingering.termination !== "below-open-vent-closed") {
      continue;
    }

    const hole = findHoleById(holes, fingering.ventHoleId);
    if (!hole) {
      continue;
    }

    const holeDistanceMm = distanceFromMouthpieceMm(segments, hole.zMm);
    const localBoreMm = diameterAtMm(segments, holeDistanceMm);
    const rb = Math.max(localBoreMm * 0.5, 0.5);
    const rh = Math.max(hole.diameterMm * 0.5, 0.3);
    const areaFraction = (rh * rh) / (rb * rb);

    if (areaFraction < 0.1) {
      warnings.push(
        `${fingering.label} uses a small vent (${hole.label}) with the "holes below open, vent closed" termination. Small keyed vents are especially sensitive to impedance interactions, so treat this prediction as low confidence.`
      );
    }
  }

  return [...new Set(warnings)];
}

/**
 * Returns a copy of `holes` with each hole's zMm reassigned so they are
 * evenly spaced across the body bore (z = 0 at bell, z = totalBoreLengthMm at
 * the barrel/mouthpiece end).  All other hole properties (label, diameter,
 * chimney, target note, angle, id) are preserved.  Holes are ordered from
 * bell to mouthpiece in the returned array.  Intended as a clean-slate
 * starting point when laying out a new bore.
 *
 * The bore is divided into (N + 1) equal intervals and one hole is placed at
 * each internal boundary, so the first and last holes sit one interval away
 * from the bell and mouthpiece ends respectively.
 */
export function evenlySpaceHoles(
  holes: ToneHole[],
  segments: BoreSegment[]
): ToneHole[] {
  if (holes.length === 0) {
    return [];
  }

  const totalMm = totalBoreLengthMm(segments);
  if (totalMm <= 0) {
    return holes;
  }

  // Sort from bell (low z) to mouthpiece (high z) to preserve relative order.
  const sorted = [...holes].sort((a, b) => a.zMm - b.zMm);
  const n = sorted.length;
  const step = totalMm / (n + 1);

  return sorted.map((hole, i) => ({
    ...hole,
    zMm: Math.round((step * (i + 1)) * 100) / 100,
  }));
}

export function sampleBoreProfile(
  segments: BoreSegment[],
  sampleCount: number
): Array<{ xMm: number; diameterMm: number }> {
  const totalMm = totalBoreLengthMm(segments);
  const count = Math.max(Math.floor(sampleCount), 2);
  if (totalMm <= 0) {
    return [
      { xMm: 0, diameterMm: diameterAtMm(segments, 0) },
      { xMm: 1, diameterMm: diameterAtMm(segments, 1) },
    ];
  }

  const out: Array<{ xMm: number; diameterMm: number }> = [];
  for (let i = 0; i < count; i += 1) {
    const t = i / (count - 1);
    const xMm = t * totalMm;
    out.push({ xMm, diameterMm: diameterAtMm(segments, xMm) });
  }
  return out;
}
