export type BoreSegment = {
  id: string;
  label: string;
  zMm: number;
  diameterMm: number;
  outerDiameterMm?: number;
};

export type ToneHole = {
  id: string;
  label: string;
  zMm: number;
  angleDeg: number;
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

function effectiveLengthForHole(hole: ToneHole, localBoreMm: number): number {
  const rb = Math.max(localBoreMm * 0.5, 0.5);
  const rh = Math.max(hole.diameterMm * 0.5, 0.3);
  const chimney = Math.max(hole.chimneyMm, 0.1);

  const boreArea = Math.PI * rb * rb;
  const holeArea = Math.PI * rh * rh;

  // Use a Keefe-style effective chimney, then add a partial contribution from
  // the downstream tube below the open hole. This better matches large clarinet
  // finger holes than the previous inertance-only approximation.
  const effectiveChimneyMm = chimney + 0.47 * rh + 0.821 * rh;
  const holeShuntTermMm = (boreArea / holeArea) * effectiveChimneyMm;
  const downstreamLoadTermMm = hole.zMm * (holeArea / (boreArea + holeArea));
  return holeShuntTermMm + downstreamLoadTermMm;
}

function correctionAdvice(centsToTarget: number | null): string {
  if (centsToTarget === null) {
    return "Add a target note for direct tuning guidance.";
  }
  if (Math.abs(centsToTarget) <= 5) {
    return "Near target. Keep geometry, then verify with impedance or prototype tests.";
  }
  if (centsToTarget > 0) {
    return "Sharp: increase effective length (move hole toward bell / lower z, reduce hole diameter, or increase chimney).";
  }
  return "Flat: decrease effective length (move hole toward mouthpiece / higher z, enlarge hole diameter, or reduce chimney).";
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

function fundamentalFromHoleTermination(
  segments: BoreSegment[],
  hole: ToneHole,
  cMs: number
): number {
  const holeDistanceMm = distanceFromMouthpieceMm(segments, hole.zMm);
  const localBoreMm = diameterAtMm(segments, holeDistanceMm);
  const effectiveLengthMm = holeDistanceMm + effectiveLengthForHole(hole, localBoreMm);
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

export function evaluateToneHoles(
  segments: BoreSegment[],
  holes: ToneHole[],
  tempC: number,
  a4Hz = 440,
  fingerings: Fingering[] = []
): HoleEvaluation[] {
  // Build per-hole usage context from fingerings.
  // Prefer fundamental if present because hole.targetNote is a chalumeau target.
  const usageMap = new Map<
    string,
    {
      register: "fundamental" | "third";
      termination: "vent-hole" | "below-open-vent-closed" | "bell";
    }
  >();
  for (const hole of holes) {
    const matches = fingerings.filter((f) => f.ventHoleId === hole.id);
    if (matches.length === 0) {
      continue;
    }
    const preferred =
      matches.find((f) => f.register === "fundamental") ??
      matches[0];
    usageMap.set(hole.id, {
      register: preferred.register,
      termination: preferred.termination,
    });
  }

  const cMs = speedOfSoundMs(tempC);

  return [...holes]
    .sort((a, b) => a.zMm - b.zMm)
    .map((hole) => {
      const holeDistanceMm = distanceFromMouthpieceMm(segments, hole.zMm);
      const localBoreMm = diameterAtMm(segments, holeDistanceMm);
      const outerDia = outerDiameterAtMm(segments, holeDistanceMm);
      const wallThicknessMm =
        outerDia !== null ? Math.max(0, (outerDia - localBoreMm) / 2) : null;
      const effectiveLengthMm = holeDistanceMm + effectiveLengthForHole(hole, localBoreMm);
      const fundamentalHz = frequencyFromQuarterWave(effectiveLengthMm, cMs);
      const thirdHz = oddHarmonic(fundamentalHz, 2);

      const usage = usageMap.get(hole.id);
      const activeRegister = usage?.register ?? "fundamental";
      const activeTermination = usage?.termination ?? "vent-hole";

      let modelFundamentalHz = fundamentalHz;
      if (activeTermination === "bell") {
        modelFundamentalHz = fundamentalFromBellTermination(segments, cMs);
      }
      if (activeTermination === "below-open-vent-closed") {
        const openBelow = firstOpenBelowHole(holes, hole.id);
        modelFundamentalHz = openBelow
          ? fundamentalFromHoleTermination(segments, openBelow, cMs)
          : fundamentalFromBellTermination(segments, cMs);
      }
      const modelThirdHz = oddHarmonic(modelFundamentalHz, 2);
      const predictedActiveHz = activeRegister === "third" ? modelThirdHz : modelFundamentalHz;

      const nearestMidi = Math.round(hzToMidi(fundamentalHz, a4Hz));
      const nearestHz = midiToHz(nearestMidi, a4Hz);
      const centsToNearest = centsError(fundamentalHz, nearestHz);

      const targetMidi = parseScientificPitch(hole.targetNote);
      const targetHz = targetMidi === null ? null : midiToHz(targetMidi, a4Hz);
      // Compare target to f1 from the same termination model used by the hole's fingerings.
      // hole.targetNote is still chalumeau, but bell-terminated notes must use bell model f1.
      const centsToTarget =
        targetHz === null ? null : centsError(modelFundamentalHz, targetHz);

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
        recommendation: correctionAdvice(centsToTarget),
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
        resolvedVentHoleLabel = `${openBelow.label} (first open below)`;
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
