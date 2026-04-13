export type BoreSegment = {
  id: string;
  label: string;
  zMm: number;
  diameterMm: number;
};

export type ToneHole = {
  id: string;
  label: string;
  positionMm: number;
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
};

export type HoleEvaluation = {
  id: string;
  label: string;
  positionMm: number;
  localBoreMm: number;
  effectiveLengthMm: number;
  predictedFundamentalHz: number;
  predictedThirdHz: number;
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

export function speedOfSoundMs(tempC: number): number {
  return 331.3 + 0.606 * tempC;
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

  // Approximate closed-open clarinet vent correction from branch inertance.
  const branchInertanceTerm = ((rb * rb) / (rh * rh)) * (0.45 * chimney + 0.25 * rh);
  const openEndTerm = 0.3 * rb;
  return hole.positionMm + branchInertanceTerm + openEndTerm;
}

function correctionAdvice(centsToTarget: number | null): string {
  if (centsToTarget === null) {
    return "Add a target note for direct tuning guidance.";
  }
  if (Math.abs(centsToTarget) <= 5) {
    return "Near target. Keep geometry, then verify with impedance or prototype tests.";
  }
  if (centsToTarget > 0) {
    return "Sharp: increase effective length (move hole farther from mouthpiece, reduce hole diameter, or increase chimney).";
  }
  return "Flat: decrease effective length (move hole closer to mouthpiece, enlarge hole diameter, or reduce chimney).";
}

function findHoleById(holes: ToneHole[], id: string): ToneHole | null {
  for (const hole of holes) {
    if (hole.id === id) {
      return hole;
    }
  }
  return null;
}

export function evaluateToneHoles(
  segments: BoreSegment[],
  holes: ToneHole[],
  tempC: number,
  a4Hz = 440
): HoleEvaluation[] {
  const cMs = speedOfSoundMs(tempC);

  return [...holes]
    .sort((a, b) => a.positionMm - b.positionMm)
    .map((hole) => {
      const localBoreMm = diameterAtMm(segments, hole.positionMm);
      const effectiveLengthMm = effectiveLengthForHole(hole, localBoreMm);
      const fundamentalHz = frequencyFromQuarterWave(effectiveLengthMm, cMs);
      const thirdHz = oddHarmonic(fundamentalHz, 2);
      const nearestMidi = Math.round(hzToMidi(fundamentalHz, a4Hz));
      const nearestHz = midiToHz(nearestMidi, a4Hz);
      const centsToNearest = centsError(fundamentalHz, nearestHz);

      const targetMidi = parseScientificPitch(hole.targetNote);
      const centsToTarget =
        targetMidi === null ? null : centsError(fundamentalHz, midiToHz(targetMidi, a4Hz));

      return {
        id: hole.id,
        label: hole.label,
        positionMm: hole.positionMm,
        localBoreMm,
        effectiveLengthMm,
        predictedFundamentalHz: fundamentalHz,
        predictedThirdHz: thirdHz,
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

    const localBoreMm = diameterAtMm(segments, hole.positionMm);
    const effectiveLengthMm = effectiveLengthForHole(hole, localBoreMm);
    const fundamentalHz = frequencyFromQuarterWave(effectiveLengthMm, cMs);
    const predictedHz =
      fingering.register === "third" ? oddHarmonic(fundamentalHz, 2) : fundamentalHz;

    const targetMidi = parseScientificPitch(fingering.targetNote);
    if (targetMidi === null) {
      return {
        id: fingering.id,
        label: fingering.label,
        targetNote: fingering.targetNote,
        ventHoleLabel: hole.label,
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
      ventHoleLabel: hole.label,
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
  const ordered = [...holes].sort((a, b) => a.positionMm - b.positionMm);
  const warnings: string[] = [];

  for (let i = 1; i < ordered.length; i += 1) {
    const prev = ordered[i - 1];
    const curr = ordered[i];
    const gap = curr.positionMm - prev.positionMm;
    const localBore = diameterAtMm(segments, curr.positionMm);
    const threshold = Math.max(localBore * 0.8, 8);

    if (gap < threshold) {
      warnings.push(
        `${prev.label} to ${curr.label} spacing (${gap.toFixed(1)} mm) may be too tight for stable venting and finger ergonomics.`
      );
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
