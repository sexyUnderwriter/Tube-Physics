import { ChangeEvent, useMemo, useRef, useState } from "react";
import {
  BoreSegment,
  Fingering,
  ToneHole,
  diameterAtMm,
  midiToName,
  modelConfidenceWarnings,
  parseScientificPitch,
  sampleBoreProfile,
  evaluateFingerings,
  evaluateToneHoles,
  outerDiameterAtMm,
  spacingWarnings,
  speedOfSoundMs,
  totalBoreLengthMm,
} from "./model";

type MouthpiecePreset = {
  id: string;
  label: string;
  instrument: "Eb clarinet" | "Bb clarinet" | "Tenor sax";
  openingHundredthMm: number;
  openingMm: number;
  facingLength: "Short" | "Medium" | "Long";
  acousticInsertMm: number;
  shankBoreMm: number;
  overallLengthMm: number;
  sourceUrl: string;
};

type MouthpieceGeometry = {
  label: string;
  insertMm: number;
  boreMm: number;
  overallLengthMm: number;
  presetApplied: boolean;
};

type DrillBit = {
  system: "fractional" | "letter" | "number";
  label: string;
  diameterIn: number;
};

function makeId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

function buildNoteOptions(minOctave: number, maxOctave: number): string[] {
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const out: string[] = [];
  for (let octave = minOctave; octave <= maxOctave; octave += 1) {
    for (const name of names) {
      out.push(`${name}${octave}`);
    }
  }
  return out;
}

const noteOptions = buildNoteOptions(2, 6);

const initialSegments: BoreSegment[] = [
  {
    id: makeId("seg"),
    label: "Bell",
    zMm: 0,
    diameterMm: 15.2,
  },
  {
    id: makeId("seg"),
    label: "Lower joint",
    zMm: 180,
    diameterMm: 14.8,
  },
  {
    id: makeId("seg"),
    label: "Middle joint",
    zMm: 400,
    diameterMm: 14.4,
  },
  {
    id: makeId("seg"),
    label: "Upper joint",
    zMm: 640,
    diameterMm: 14.6,
  },
];

const initialHoles: ToneHole[] = [
  {
    id: makeId("hole"),
    label: "Vent",
    zMm: 490,
    angleDeg: 0,
    diameterMm: 2.2,
    chimneyMm: 2.8,
    targetNote: "B4",
  },
  {
    id: makeId("hole"),
    label: "Thumb",
    zMm: 430,
    angleDeg: 0,
    diameterMm: 8.2,
    chimneyMm: 3.1,
    targetNote: "G4",
  },
  {
    id: makeId("hole"),
    label: "Front A",
    zMm: 444,
    angleDeg: 0,
    diameterMm: 4.0,
    chimneyMm: 2.3,
    targetNote: "A4",
  },
  {
    id: makeId("hole"),
    label: "Finger 1",
    zMm: 404,
    angleDeg: 0,
    diameterMm: 7.8,
    chimneyMm: 3.0,
    targetNote: "A4",
  },
  {
    id: makeId("hole"),
    label: "Finger 2",
    zMm: 376,
    angleDeg: 0,
    diameterMm: 8.0,
    chimneyMm: 3.0,
    targetNote: "G#4",
  },
  {
    id: makeId("hole"),
    label: "Finger 3",
    zMm: 348,
    angleDeg: 0,
    diameterMm: 8.1,
    chimneyMm: 3.0,
    targetNote: "G4",
  },
  {
    id: makeId("hole"),
    label: "Finger 4",
    zMm: 316,
    angleDeg: 0,
    diameterMm: 8.3,
    chimneyMm: 3.0,
    targetNote: "F#4",
  },
  {
    id: makeId("hole"),
    label: "Finger 5",
    zMm: 282,
    angleDeg: 0,
    diameterMm: 8.4,
    chimneyMm: 3.0,
    targetNote: "F4",
  },
  {
    id: makeId("hole"),
    label: "Finger 6",
    zMm: 246,
    angleDeg: 0,
    diameterMm: 8.4,
    chimneyMm: 3.0,
    targetNote: "E4",
  },
  {
    id: makeId("hole"),
    label: "Finger 7",
    zMm: 208,
    angleDeg: 0,
    diameterMm: 8.5,
    chimneyMm: 3.0,
    targetNote: "D4",
  },
];

const initialFingerings: Fingering[] = [
  {
    id: makeId("fing"),
    label: "Chalumeau D",
    targetNote: "D4",
    ventHoleId: initialHoles[9].id,
    register: "fundamental",
    termination: "vent-hole",
  },
  {
    id: makeId("fing"),
    label: "Chalumeau E",
    targetNote: "E4",
    ventHoleId: initialHoles[8].id,
    register: "fundamental",
    termination: "vent-hole",
  },
  {
    id: makeId("fing"),
    label: "Chalumeau F",
    targetNote: "F4",
    ventHoleId: initialHoles[7].id,
    register: "fundamental",
    termination: "vent-hole",
  },
  {
    id: makeId("fing"),
    label: "Clarion B",
    targetNote: "B4",
    ventHoleId: initialHoles[0].id,
    register: "third",
    termination: "vent-hole",
  },
  {
    id: makeId("fing"),
    label: "All closed",
    targetNote: "C3",
    ventHoleId: initialHoles[0].id,
    register: "fundamental",
    termination: "bell",
  },
];

const mouthpiecePresets: MouthpiecePreset[] = [
  {
    id: "vandoren-eb-5rv",
    label: "Vandoren 5RV (Eb)",
    instrument: "Eb clarinet",
    openingHundredthMm: 106.5,
    openingMm: 1.065,
    facingLength: "Short",
    acousticInsertMm: 18,
    shankBoreMm: 12.6,
    overallLengthMm: 75,
    sourceUrl: "https://vandoren.fr/en/vandoren-mouthpieces/5rv-eb-clarinet-reeds/",
  },
  {
    id: "vandoren-bb-5rv-lyre",
    label: "Vandoren 5RV Lyre (Bb)",
    instrument: "Bb clarinet",
    openingHundredthMm: 109.1,
    openingMm: 1.091,
    facingLength: "Medium",
    acousticInsertMm: 21,
    shankBoreMm: 14.8,
    overallLengthMm: 86,
    sourceUrl: "https://vandoren.fr/en/vandoren-mouthpieces/5rv-lyre-bb-clarinet-mouthpiece/",
  },
  {
    id: "vandoren-tenor-v16-t6",
    label: "Vandoren V16 T6 (Tenor)",
    instrument: "Tenor sax",
    openingHundredthMm: 250,
    openingMm: 2.5,
    facingLength: "Long",
    acousticInsertMm: 24,
    shankBoreMm: 16.8,
    overallLengthMm: 110,
    sourceUrl: "https://vandoren.fr/en/vandoren-mouthpieces/t6-v16-tenor-saxophone-mouthpiece/",
  },
];

const defaultMouthpiecePreset = mouthpiecePresets[1];

function findMouthpiecePreset(id: string): MouthpiecePreset | undefined {
  return mouthpiecePresets.find((preset) => preset.id === id);
}

function buildMouthpieceGeometry(preset: MouthpiecePreset): MouthpieceGeometry {
  return {
    label: "Mouthpiece",
    insertMm: preset.acousticInsertMm,
    boreMm: preset.shankBoreMm,
    overallLengthMm: preset.overallLengthMm,
    presetApplied: true,
  };
}

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    const t = y;
    y = x % y;
    x = t;
  }
  return Math.max(x, 1);
}

function formatFraction(numerator: number, denominator: number): string {
  const factor = gcd(numerator, denominator);
  return `${numerator / factor}/${denominator / factor}`;
}

function buildFractionalDrillBits(): DrillBit[] {
  const out: DrillBit[] = [];
  for (let numerator = 1; numerator <= 64; numerator += 1) {
    out.push({
      system: "fractional",
      label: formatFraction(numerator, 64),
      diameterIn: numerator / 64,
    });
  }
  return out;
}

const FRACTIONAL_DRILL_BITS: DrillBit[] = buildFractionalDrillBits();

const LETTER_DRILL_SOURCE: Array<[string, number]> = [
  ["A", 0.234],
  ["B", 0.238],
  ["C", 0.242],
  ["D", 0.246],
  ["E", 0.25],
  ["F", 0.257],
  ["G", 0.261],
  ["H", 0.266],
  ["I", 0.272],
  ["J", 0.277],
  ["K", 0.281],
  ["L", 0.29],
  ["M", 0.295],
  ["N", 0.302],
  ["O", 0.316],
  ["P", 0.323],
  ["Q", 0.332],
  ["R", 0.339],
  ["S", 0.348],
  ["T", 0.358],
  ["U", 0.368],
  ["V", 0.377],
  ["W", 0.386],
  ["X", 0.397],
  ["Y", 0.404],
  ["Z", 0.413],
];

const LETTER_DRILL_BITS: DrillBit[] = LETTER_DRILL_SOURCE.map(([label, diameterIn]) => ({
  system: "letter" as const,
  label,
  diameterIn,
}));

const NUMBER_DRILL_SOURCE: Array<[string, number]> = [
  ["80", 0.0135], ["79", 0.0145], ["78", 0.016], ["77", 0.018], ["76", 0.02],
  ["75", 0.021], ["74", 0.0225], ["73", 0.024], ["72", 0.025], ["71", 0.026],
  ["70", 0.028], ["69", 0.0292], ["68", 0.031], ["67", 0.032], ["66", 0.033],
  ["65", 0.035], ["64", 0.036], ["63", 0.037], ["62", 0.038], ["61", 0.039],
  ["60", 0.04], ["59", 0.041], ["58", 0.042], ["57", 0.043], ["56", 0.0465],
  ["55", 0.052], ["54", 0.055], ["53", 0.0595], ["52", 0.0635], ["51", 0.067],
  ["50", 0.07], ["49", 0.073], ["48", 0.076], ["47", 0.0785], ["46", 0.081],
  ["45", 0.082], ["44", 0.086], ["43", 0.089], ["42", 0.0935], ["41", 0.096],
  ["40", 0.098], ["39", 0.0995], ["38", 0.1015], ["37", 0.104], ["36", 0.1065],
  ["35", 0.11], ["34", 0.111], ["33", 0.113], ["32", 0.116], ["31", 0.12],
  ["30", 0.1285], ["29", 0.136], ["28", 0.1405], ["27", 0.144], ["26", 0.147],
  ["25", 0.1495], ["24", 0.152], ["23", 0.154], ["22", 0.157], ["21", 0.159],
  ["20", 0.161], ["19", 0.166], ["18", 0.1695], ["17", 0.173], ["16", 0.177],
  ["15", 0.18], ["14", 0.182], ["13", 0.185], ["12", 0.189], ["11", 0.191],
  ["10", 0.1935], ["9", 0.196], ["8", 0.199], ["7", 0.201], ["6", 0.204],
  ["5", 0.2055], ["4", 0.209], ["3", 0.213], ["2", 0.221], ["1", 0.228],
];

const NUMBER_DRILL_BITS: DrillBit[] = NUMBER_DRILL_SOURCE.map(([label, diameterIn]) => ({
  system: "number" as const,
  label,
  diameterIn,
}));

const ALL_DRILL_BITS: DrillBit[] = [
  ...FRACTIONAL_DRILL_BITS,
  ...LETTER_DRILL_BITS,
  ...NUMBER_DRILL_BITS,
].sort((a, b) => a.diameterIn - b.diameterIn);

function findClosestNotOverDrillBitIndex(targetIn: number, bits: DrillBit[]): number {
  let bestIndex = -1;
  for (let i = 0; i < bits.length; i += 1) {
    if (bits[i].diameterIn <= targetIn) {
      bestIndex = i;
    } else {
      break;
    }
  }
  return bestIndex;
}

function formatDrillBitLabel(bit: DrillBit): string {
  if (bit.system === "number") {
    return `#${bit.label}`;
  }
  return bit.label;
}

function formatDrillFamily(bit: DrillBit): string {
  if (bit.system === "fractional") {
    return "Fractional";
  }
  if (bit.system === "letter") {
    return "Letter";
  }
  return "Number";
}

function inchesToMm(valueInches: number): number {
  return valueInches * 25.4;
}

function normalizeHoleAngleDeg(angleDeg: number): number {
  if (!Number.isFinite(angleDeg)) {
    return 0;
  }
  return ((angleDeg + 180) % 360 + 360) % 360 - 180;
}

const FILE_HEADER = "CLARINET_BORE_LAB_MODEL_V1";

type DesignSnapshot = {
  version: 1;
  name: string;
  tempC: number;
  pitchStandardHz: number;
  toleranceCents: number;
  firstChalumeauNote: string;
  selectedMouthpieceId: string;
  segments: BoreSegment[];
  mouthpiece: MouthpieceGeometry;
  holes: ToneHole[];
  fingerings: Fingering[];
};

type LegacyToneHole = Omit<ToneHole, "zMm" | "angleDeg"> & {
  positionMm: number;
  angleDeg?: number;
};
type LegacyFingering = Omit<Fingering, "termination"> & {
  termination?: "vent-hole" | "below-open-vent-closed" | "bell";
};
type SnapshotV1 = Omit<DesignSnapshot, "holes" | "mouthpiece" | "fingerings"> & {
  holes: Array<ToneHole | LegacyToneHole>;
  fingerings: Array<Fingering | LegacyFingering>;
  mouthpiece?: Partial<MouthpieceGeometry>;
};

function serializeSnapshot(snapshot: DesignSnapshot): string {
  return [FILE_HEADER, JSON.stringify(snapshot, null, 2)].join("\n");
}

function parseSnapshotFile(text: string): DesignSnapshot | null {
  const trimmed = text.trim();
  const jsonText = trimmed.startsWith(FILE_HEADER)
    ? trimmed.slice(FILE_HEADER.length).trim()
    : trimmed;

  try {
    const parsed = JSON.parse(jsonText) as SnapshotV1;
    if (parsed.version !== 1) {
      return null;
    }

    const preset = findMouthpiecePreset(parsed.selectedMouthpieceId) ?? defaultMouthpiecePreset;

    const baseLengthMm = Math.max(
      0,
      ...parsed.segments.map((segment) => Math.max(segment.zMm, 0))
    );

    const normalizedHoles: ToneHole[] = parsed.holes.map((hole) => {
      const angleDeg =
        "angleDeg" in hole && typeof hole.angleDeg === "number" && Number.isFinite(hole.angleDeg)
          ? normalizeHoleAngleDeg(hole.angleDeg)
          : 0;

      if ("zMm" in hole && Number.isFinite(hole.zMm)) {
        return {
          id: hole.id,
          label: hole.label,
          zMm: hole.zMm,
          angleDeg,
          diameterMm: hole.diameterMm,
          chimneyMm: hole.chimneyMm,
          targetNote: hole.targetNote,
        };
      }
      if ("positionMm" in hole && Number.isFinite(hole.positionMm)) {
        return {
          id: hole.id,
          label: hole.label,
          zMm: Math.max(baseLengthMm - hole.positionMm, 0),
          angleDeg,
          diameterMm: hole.diameterMm,
          chimneyMm: hole.chimneyMm,
          targetNote: hole.targetNote,
        };
      }
      return {
        id: hole.id,
        label: hole.label,
        zMm: 0,
        angleDeg,
        diameterMm: hole.diameterMm,
        chimneyMm: hole.chimneyMm,
        targetNote: hole.targetNote,
      };
    });

    const normalizedFingerings: Fingering[] = parsed.fingerings.map((fingering) => {
      const inferredTermination =
        typeof fingering.label === "string" && /all\s*closed/i.test(fingering.label)
          ? "bell"
          : "vent-hole";

      return {
        ...fingering,
        termination: fingering.termination ?? inferredTermination,
      };
    });

    const mouthpiece: MouthpieceGeometry = parsed.mouthpiece
      ? {
          label:
            typeof parsed.mouthpiece.label === "string" && parsed.mouthpiece.label.trim().length > 0
              ? parsed.mouthpiece.label
              : "Mouthpiece",
          insertMm:
            Number.isFinite(parsed.mouthpiece.insertMm) && parsed.mouthpiece.insertMm !== undefined
              ? Math.max(parsed.mouthpiece.insertMm, 0)
              : preset.acousticInsertMm,
          boreMm:
            Number.isFinite(parsed.mouthpiece.boreMm) && parsed.mouthpiece.boreMm !== undefined
              ? Math.max(parsed.mouthpiece.boreMm, 0)
              : preset.shankBoreMm,
          overallLengthMm:
            Number.isFinite(parsed.mouthpiece.overallLengthMm) && parsed.mouthpiece.overallLengthMm !== undefined
              ? Math.max(parsed.mouthpiece.overallLengthMm, 0)
              : preset.overallLengthMm,
          presetApplied: parsed.mouthpiece.presetApplied !== false,
        }
      : buildMouthpieceGeometry(preset);

    return {
      ...parsed,
      selectedMouthpieceId: preset.id,
      mouthpiece,
      holes: normalizedHoles,
      fingerings: normalizedFingerings,
    };
  } catch {
    return null;
  }
}

export default function App() {
  const [name, setName] = useState("Prototype Clarinet Bore");
  const [tempC, setTempC] = useState(20);
  const [pitchStandardHz, setPitchStandardHz] = useState(440);
  const [segments, setSegments] = useState<BoreSegment[]>(initialSegments);
  const [holes, setHoles] = useState<ToneHole[]>(initialHoles);
  const [toleranceCents, setToleranceCents] = useState(10);
  const [fingerings, setFingerings] = useState<Fingering[]>(initialFingerings);
  const [firstChalumeauNote, setFirstChalumeauNote] = useState("D3");
  const [selectedMouthpieceId, setSelectedMouthpieceId] = useState(defaultMouthpiecePreset.id);
  const [activeMouthpiece, setActiveMouthpiece] = useState<MouthpiecePreset>(
    defaultMouthpiecePreset
  );
  const [mouthpiece, setMouthpiece] = useState<MouthpieceGeometry>(
    buildMouthpieceGeometry(defaultMouthpiecePreset)
  );
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [loadStatus, setLoadStatus] = useState<string | null>(null);
  const [converterMm, setConverterMm] = useState("8");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const converterMmValue = Number(converterMm);
  const hasConverterInput = Number.isFinite(converterMmValue) && converterMmValue > 0;
  const converterInches = hasConverterInput ? converterMmValue / 25.4 : null;
  const closestNotOverIndex =
    converterInches === null ? -1 : findClosestNotOverDrillBitIndex(converterInches, ALL_DRILL_BITS);
  const closestNotOver =
    closestNotOverIndex >= 0 ? ALL_DRILL_BITS[closestNotOverIndex] : null;
  const belowBestFit =
    closestNotOverIndex > 0 ? ALL_DRILL_BITS[closestNotOverIndex - 1] : null;
  const aboveBestFit =
    closestNotOverIndex >= 0 && closestNotOverIndex < ALL_DRILL_BITS.length - 1
      ? ALL_DRILL_BITS[closestNotOverIndex + 1]
      : null;

  const bodyLengthMm = useMemo(() => totalBoreLengthMm(segments), [segments]);
  const mouthpieceSegment = useMemo<BoreSegment>(
    () => ({
      id: "mouthpiece-point",
      label: mouthpiece.label,
      zMm: bodyLengthMm + Math.max(mouthpiece.insertMm, 0),
      diameterMm: Math.max(mouthpiece.boreMm, 0),
    }),
    [bodyLengthMm, mouthpiece.boreMm, mouthpiece.insertMm, mouthpiece.label]
  );
  const acousticSegments = useMemo<BoreSegment[]>(
    () => [...segments, mouthpieceSegment],
    [mouthpieceSegment, segments]
  );
  const profileRows = useMemo(
    () => [
      ...segments.map((segment) => ({ segment, source: "body" as const })),
      { segment: mouthpieceSegment, source: "mouthpiece" as const },
    ],
    [mouthpieceSegment, segments]
  );

  const partLengthById = useMemo(() => {
    const sortedRows = [...profileRows].sort((a, b) => a.segment.zMm - b.segment.zMm);
    const lengths = new Map<string, number | null>();

    for (let i = 0; i < sortedRows.length; i += 1) {
      const current = sortedRows[i];
      const next = i < sortedRows.length - 1 ? sortedRows[i + 1] : null;
      if (!next) {
        lengths.set(current.segment.id, null);
        continue;
      }

      lengths.set(current.segment.id, Math.max(next.segment.zMm - current.segment.zMm, 0));
    }

    return lengths;
  }, [profileRows]);

  const totalLengthMm = useMemo(() => totalBoreLengthMm(acousticSegments), [acousticSegments]);
  const physicalInstrumentLengthMm = useMemo(
    () =>
      bodyLengthMm + Math.max(mouthpiece.insertMm, 0) + Math.max(mouthpiece.overallLengthMm, 0),
    [bodyLengthMm, mouthpiece.insertMm, mouthpiece.overallLengthMm]
  );
  const cMs = useMemo(() => speedOfSoundMs(tempC), [tempC]);
  const results = useMemo(
    () => evaluateToneHoles(acousticSegments, holes, tempC, pitchStandardHz, fingerings),
    [acousticSegments, holes, tempC, pitchStandardHz, fingerings]
  );
  const warnings = useMemo(
    () => spacingWarnings(holes, acousticSegments),
    [holes, acousticSegments]
  );
  const modelWarnings = useMemo(
    () => modelConfidenceWarnings(holes, acousticSegments, fingerings),
    [holes, acousticSegments, fingerings]
  );
  const fingeringResults = useMemo(
    () =>
      evaluateFingerings(
        acousticSegments,
        holes,
        fingerings,
        tempC,
        toleranceCents,
        pitchStandardHz
      ),
    [acousticSegments, holes, fingerings, tempC, toleranceCents, pitchStandardHz]
  );
  const passCount = useMemo(
    () => fingeringResults.filter((result) => result.withinTolerance).length,
    [fingeringResults]
  );
  const meanAbsCents = useMemo(() => {
    const withTargets = fingeringResults.filter((result) => result.centsErrorToTarget !== null);
    if (withTargets.length === 0) {
      return null;
    }
    const sum = withTargets.reduce(
      (acc, result) => acc + Math.abs(result.centsErrorToTarget ?? 0),
      0
    );
    return sum / withTargets.length;
  }, [fingeringResults]);
  const profilePoints = useMemo(
    () => sampleBoreProfile(acousticSegments, 140),
    [acousticSegments]
  );
  const boreSvg = useMemo(() => {
    const width = 980;
    const height = 330;
    const marginX = 24;
    const centerY = height / 2;
    const maxRadius =
      Math.max(...profilePoints.map((point) => point.diameterMm * 0.5), 8) * 1.15;
    const usableHalfHeight = 108;

    // Physical extent beyond acoustic endpoint uses the full mouthpiece length.
    // Acoustic total already includes insert depth; adding overall length yields
    // body + insert + full mouthpiece physical extent.
    const mouthpiecePhysicalLengthMm = Math.max(mouthpiece.overallLengthMm, 0);
    const visualTotalMm = totalLengthMm + mouthpiecePhysicalLengthMm;

    const zToSvg = (zMm: number): number => {
      if (visualTotalMm <= 0) {
        return marginX;
      }
      return marginX + (zMm / visualTotalMm) * (width - marginX * 2);
    };

    const rToSvg = (radiusMm: number): number =>
      (Math.max(radiusMm, 0) / maxRadius) * usableHalfHeight;

    const top = profilePoints.map((point) => {
      const zMm = Math.max(totalLengthMm - point.xMm, 0);
      const x = zToSvg(zMm);
      const y = centerY - rToSvg(point.diameterMm * 0.5);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    });
    const bottom = [...profilePoints]
      .reverse()
      .map((point) => {
        const zMm = Math.max(totalLengthMm - point.xMm, 0);
        const x = zToSvg(zMm);
        const y = centerY + rToSvg(point.diameterMm * 0.5);
        return `${x.toFixed(2)},${y.toFixed(2)}`;
      });

    const polygon = `${top.join(" ")} ${bottom.join(" ")}`;
    const labelLaneHeight = 18;
    const minLabelGap = 10;
    const topLaneRightEdges: number[] = [];
    const bottomLaneRightEdges: number[] = [];
    const holesOnBore = [...holes]
      .sort((a, b) => a.zMm - b.zMm)
      .map((hole) => {
        const x = zToSvg(Math.max(hole.zMm, 0));
        const localRadius = rToSvg(hole.diameterMm * 0.5);
        const labelWidth = Math.max(hole.label.length * 6.6 + 12, 44);
        const leftEdge = x - labelWidth / 2;
        const angle = Number.isFinite(hole.angleDeg) ? hole.angleDeg : 0;
        const isBackHole = Math.abs(Math.abs(angle) - 180) <= 20;
        const laneRightEdges = isBackHole ? bottomLaneRightEdges : topLaneRightEdges;

        let laneIndex = 0;
        while (
          laneIndex < laneRightEdges.length &&
          leftEdge <= laneRightEdges[laneIndex] + minLabelGap
        ) {
          laneIndex += 1;
        }

        laneRightEdges[laneIndex] = x + labelWidth / 2;

        return {
          ...hole,
          x,
          localRadius,
          labelWidth,
          labelY: isBackHole
            ? centerY + localRadius + 36 + laneIndex * labelLaneHeight
            : centerY - localRadius - 36 - laneIndex * labelLaneHeight,
          dotY: isBackHole ? centerY + localRadius + 28 : centerY - localRadius - 28,
          stemFromY: isBackHole ? centerY + localRadius + 4 : centerY - localRadius - 4,
          stemToY: isBackHole ? centerY + localRadius + 24 : centerY - localRadius - 24,
          leaderFromY: isBackHole ? centerY + localRadius + 33 : centerY - localRadius - 33,
          leaderToY: isBackHole
            ? centerY + localRadius + 30 + laneIndex * labelLaneHeight
            : centerY - localRadius - 30 - laneIndex * labelLaneHeight,
        };
      });

    // Segment boundary lines – one vertical line per segment at its z position.
    // We clip the line to the bore profile radius at that z so it spans exactly
    // from the top wall to the bottom wall.
    const segmentLines = acousticSegments.map((seg) => {
      const x = zToSvg(Math.max(seg.zMm, 0));
      const localRadius = rToSvg(diameterAtMm(acousticSegments, totalLengthMm - seg.zMm) * 0.5);
      return {
        id: seg.id,
        label: seg.label,
        x,
        y1: centerY - localRadius,
        y2: centerY + localRadius,
      };
    });

    // Generate ruler ticks at regular intervals (every 50mm for visualTotalMm >= 500, else every 100mm)
    const tickInterval = visualTotalMm >= 500 ? 50 : 100;
    const rulerTicks = [];
    for (let zMm = tickInterval; zMm < visualTotalMm; zMm += tickInterval) {
      rulerTicks.push({
        zMm,
        x: zToSvg(zMm),
        label: `${zMm}`,
      });
    }

    // Label each segment at the midpoint of its horizontal span.
    // Use lane-based collision avoidance so narrow segments don't overlap.
    const sortedSegs = [...segmentLines].sort((a, b) => a.x - b.x);
    const rightEdge = width - marginX;
    const laneBaseY = centerY + usableHalfHeight + 55; // Extra space for ruler ticks
    const laneStep = 15;
    const minLabelPad = 8;
    const segLaneRightEdges: number[] = [];
    const segmentLabels = sortedSegs.map((seg, i) => {
      const nextX = i < sortedSegs.length - 1 ? sortedSegs[i + 1].x : rightEdge;
      const midX = (seg.x + nextX) / 2;
      // Get z-value from segment object for label
      const segmentObj = acousticSegments.find((s) => s.id === seg.id);
      const zEnd = segmentObj?.zMm ?? 0;
      const labelText = segmentObj
        ? `${seg.label} (${zEnd.toFixed(0)}mm)`
        : seg.label;
      const labelW = Math.max(labelText.length * 6.2 + 10, 30);
      const leftEdge = midX - labelW / 2;

      let lane = 0;
      while (
        lane < segLaneRightEdges.length &&
        leftEdge <= segLaneRightEdges[lane] + minLabelPad
      ) {
        lane += 1;
      }
      segLaneRightEdges[lane] = midX + labelW / 2;

      return {
        id: seg.id,
        label: seg.label,
        labelText,
        x: midX,
        y: laneBaseY + lane * laneStep,
        labelW,
        boreBottomY: seg.y2,
        lane,
      };
    });

    // Expand SVG height to fit however many lanes were needed.
    const maxLane = Math.max(...segmentLabels.map((s) => s.lane), 0);
    const adjustedHeight = laneBaseY + maxLane * laneStep + 18;

    // Mouthpiece tip polygon: tapers from acoustic endpoint bore diameter to the physical beak tip.
    const tipX0 = zToSvg(totalLengthMm);
    const tipX1 = zToSvg(visualTotalMm);
    const tipR0 = rToSvg(mouthpiece.boreMm * 0.5);
    const tipR1 = rToSvg(2);
    const mouthpieceTip = mouthpiecePhysicalLengthMm > 0
      ? [
          `${tipX0.toFixed(2)},${(centerY - tipR0).toFixed(2)}`,
          `${tipX1.toFixed(2)},${(centerY - tipR1).toFixed(2)}`,
          `${tipX1.toFixed(2)},${(centerY + tipR1).toFixed(2)}`,
          `${tipX0.toFixed(2)},${(centerY + tipR0).toFixed(2)}`,
        ].join(" ")
      : null;

    return {
      width,
      height: adjustedHeight,
      centerY,
      polygon,
      holesOnBore,
      segmentLines,
      segmentLabels,
      rulerTicks,
      zToSvg,
      rToSvg,
      mouthpieceTip,
      visualTotalMm,
    };
  }, [acousticSegments, holes, mouthpiece, profilePoints, totalLengthMm]);

  function applySnapshot(saved: DesignSnapshot): void {
    setName(saved.name);
    setTempC(saved.tempC);
    setPitchStandardHz(saved.pitchStandardHz);
    setToleranceCents(saved.toleranceCents);
    setFirstChalumeauNote(saved.firstChalumeauNote);
    setSegments(saved.segments);
    setMouthpiece(saved.mouthpiece);
    setHoles(saved.holes);
    setFingerings(saved.fingerings);

    const preset = findMouthpiecePreset(saved.selectedMouthpieceId) ?? defaultMouthpiecePreset;
    setSelectedMouthpieceId(preset.id);
    setActiveMouthpiece(preset);
  }

  function buildCurrentSnapshot(): DesignSnapshot {
    return {
      version: 1,
      name,
      tempC,
      pitchStandardHz,
      toleranceCents,
      firstChalumeauNote,
      selectedMouthpieceId,
      segments,
      mouthpiece,
      holes,
      fingerings,
    };
  }

  function applyMouthpiecePreset(presetId: string): void {
    const preset = findMouthpiecePreset(presetId);
    if (!preset) {
      return;
    }
    setSelectedMouthpieceId(preset.id);
    setActiveMouthpiece(preset);
    setMouthpiece(buildMouthpieceGeometry(preset));
  }

  function saveToTextFile(): void {
    const snapshot = buildCurrentSnapshot();
    const fileText = serializeSnapshot(snapshot);
    const blob = new Blob([fileText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const safeName = (snapshot.name || "clarinet-model")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    anchor.href = url;
    anchor.download = `${safeName || "clarinet-model"}.txt`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    setLastSavedAt(new Date().toLocaleTimeString());
    setLoadStatus(null);
  }

  function openTextFileDialog(): void {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  }

  async function handleLoadTextFile(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    const text = await file.text();
    const snapshot = parseSnapshotFile(text);
    if (!snapshot) {
      setLoadStatus("Could not read this file. Expected Clarinet Bore Lab text format.");
      event.target.value = "";
      return;
    }

    applySnapshot(snapshot);
    setLoadStatus(`Loaded ${file.name}`);
    event.target.value = "";
  }

  function updateSegment(
    id: string,
    key: "zMm" | "diameterMm",
    value: number
  ): void {
    setSegments((prev) =>
      prev.map((s) => (s.id === id ? { ...s, [key]: Number.isFinite(value) ? value : 0 } : s))
    );
  }

  function updateSegmentCumulativeZ(id: string, rawValue: number): void {
    const nextZ = Number.isFinite(rawValue) ? Math.max(rawValue, 0) : 0;
    setSegments((prev) => {
      const ordered = prev
        .map((segment, index) => ({ id: segment.id, index, zMm: segment.zMm }))
        .sort((a, b) => a.zMm - b.zMm);
      const targetPos = ordered.findIndex((point) => point.id === id);
      if (targetPos < 0) {
        return prev;
      }

      const delta = nextZ - ordered[targetPos].zMm;
      const posByIndex = new Map<number, number>();
      ordered.forEach((point, pos) => {
        posByIndex.set(point.index, pos);
      });

      return prev.map((segment, index) => {
        const pos = posByIndex.get(index);
        if (pos === undefined || pos < targetPos) {
          return segment;
        }
        if (pos === targetPos) {
          return { ...segment, zMm: nextZ };
        }
        return { ...segment, zMm: Math.max(segment.zMm + delta, 0) };
      });
    });
  }

  function updateSegmentPhysicalLength(id: string, rawValue: number): void {
    const nextLength = Number.isFinite(rawValue) ? Math.max(rawValue, 0) : 0;
    let nextInsertMm: number | null = null;

    setSegments((prev) => {
      const ordered = prev
        .map((segment, index) => ({ id: segment.id, index, zMm: segment.zMm }))
        .sort((a, b) => a.zMm - b.zMm);
      const targetPos = ordered.findIndex((point) => point.id === id);
      if (targetPos < 0) {
        return prev;
      }

      // Last body point length is the mouthpiece insert length.
      if (targetPos === ordered.length - 1) {
        nextInsertMm = nextLength;
        return prev;
      }

      const current = ordered[targetPos];
      const next = ordered[targetPos + 1];
      const oldLength = Math.max(next.zMm - current.zMm, 0);
      const delta = nextLength - oldLength;
      const posByIndex = new Map<number, number>();
      ordered.forEach((point, pos) => {
        posByIndex.set(point.index, pos);
      });

      return prev.map((segment, index) => {
        const pos = posByIndex.get(index);
        if (pos === undefined || pos <= targetPos) {
          return segment;
        }
        return { ...segment, zMm: Math.max(segment.zMm + delta, 0) };
      });
    });

    if (nextInsertMm !== null) {
      setMouthpiece((prev) => ({
        ...prev,
        insertMm: nextInsertMm as number,
        presetApplied: false,
      }));
    }
  }

  function updateSegmentLabel(id: string, value: string): void {
    setSegments((prev) =>
      prev.map((segment) =>
        segment.id === id ? { ...segment, label: value } : segment
      )
    );
  }

  function updateSegmentOuterDiameter(id: string, raw: string): void {
    const parsed = parseFloat(raw);
    const value = raw === "" || !Number.isFinite(parsed) ? undefined : parsed;
    setSegments((prev) =>
      prev.map((s) => (s.id === id ? { ...s, outerDiameterMm: value } : s))
    );
  }

  function updateMouthpieceSegment(
    key: "label" | "zMm" | "diameterMm" | "overallLengthMm",
    value: string | number
  ): void {
    setMouthpiece((prev) => {
      if (key === "label") {
        return { ...prev, label: String(value) };
      }

      if (key === "zMm") {
        return {
          ...prev,
          insertMm: Math.max(Number(value) - bodyLengthMm, 0),
          presetApplied: false,
        };
      }

      if (key === "overallLengthMm") {
        return {
          ...prev,
          overallLengthMm: Math.max(Number(value), 0),
          presetApplied: false,
        };
      }

      return {
        ...prev,
        boreMm: Math.max(Number(value), 0),
        presetApplied: false,
      };
    });
  }

  function updateHole(
    id: string,
    key: keyof Omit<ToneHole, "id">,
    value: string | number
  ): void {
    setHoles((prev) =>
      prev.map((h) => (h.id === id ? { ...h, [key]: value as never } : h))
    );
  }

  function updateFingering(
    id: string,
    key: keyof Omit<Fingering, "id">,
    value: string
  ): void {
    setFingerings((prev) =>
      prev.map((f) => {
        if (f.id !== id) {
          return f;
        }

        const updated = { ...f, [key]: value as never };
        
        // Auto-infer termination if label changed to "all closed"
        if (key === "label" && typeof value === "string") {
          const shouldBeBell = /all\s*closed|all\s*covered/i.test(value);
          updated.termination = shouldBeBell ? "bell" : f.termination;
        }

        return updated;
      })
    );
  }

  function autoPopulateIntonationTargets(): void {
    const firstMidi = parseScientificPitch(firstChalumeauNote);
    if (firstMidi === null) {
      return;
    }

    const diatonicMajorSteps = [0, 2, 4, 5, 7, 9, 11];
    const orderedHoles = [...holes].sort((a, b) => a.zMm - b.zMm);
    const updatedTargets = new Map<string, string>();
    const generatedFingerings: Fingering[] = [];

    for (let i = 0; i < orderedHoles.length; i += 1) {
      const hole = orderedHoles[i];
      const scaleDegree = i % diatonicMajorSteps.length;
      const octaveOffset = Math.floor(i / diatonicMajorSteps.length) * 12;
      const chalumeauMidi = firstMidi + octaveOffset + diatonicMajorSteps[scaleDegree];
      const clarionMidi = chalumeauMidi + 19;
      const chalumeauNote = midiToName(chalumeauMidi);
      const clarionNote = midiToName(clarionMidi);
      const termination = i === 0 ? "bell" : "below-open-vent-closed";

      updatedTargets.set(hole.id, chalumeauNote);

      generatedFingerings.push({
        id: makeId("fing"),
        label: i === 0 ? `All covered ${chalumeauNote}` : `Chalumeau ${chalumeauNote}`,
        targetNote: chalumeauNote,
        ventHoleId: hole.id,
        register: "fundamental",
        termination,
      });

      generatedFingerings.push({
        id: makeId("fing"),
        label: `Clarion ${clarionNote}`,
        targetNote: clarionNote,
        ventHoleId: hole.id,
        register: "third",
        termination,
      });
    }

    setHoles((prev) =>
      prev.map((hole) => {
        const target = updatedTargets.get(hole.id);
        return target ? { ...hole, targetNote: target } : hole;
      })
    );
    setFingerings(generatedFingerings);
  }

  return (
    <div className="page-shell">
      <header className="hero">
        <div>
          <p className="kicker">Clarinet Air Column Designer</p>
          <h1>Clarinet Bore Lab</h1>
          <div className="quick-calc" aria-label="Millimeter to imperial drill size converter">
            <h3>Quick Drill Converter</h3>
            <div className="quick-calc-row">
              <label>
                Millimeters
                <input
                  type="number"
                  step={0.01}
                  min={0}
                  value={converterMm}
                  onChange={(e) => setConverterMm(e.target.value)}
                />
              </label>
              <div className="quick-calc-readout">
                <span>Inches</span>
                <strong>
                  {converterInches === null ? "--" : `${converterInches.toFixed(4)} in`}
                </strong>
              </div>
            </div>
            <div className="quick-calc-grid">
              <div>
                <span>One below</span>
                <strong>
                  {belowBestFit === null
                    ? "--"
                    : `${formatDrillBitLabel(belowBestFit)} (${belowBestFit.diameterIn.toFixed(4)} in)`}
                </strong>
                <span>
                  {belowBestFit === null
                    ? ""
                    : `${formatDrillFamily(belowBestFit)} · ${inchesToMm(belowBestFit.diameterIn).toFixed(3)} mm`}
                </span>
              </div>
              <div>
                <span>Best fit (not over)</span>
                <strong>
                  {closestNotOver === null
                    ? "--"
                    : `${formatDrillBitLabel(closestNotOver)} (${closestNotOver.diameterIn.toFixed(4)} in)`}
                </strong>
                <span>
                  {closestNotOver === null ? "No standard drill <= target" : formatDrillFamily(closestNotOver)}
                </span>
                <span>
                  {closestNotOver === null
                    ? ""
                    : `Exact metric: ${inchesToMm(closestNotOver.diameterIn).toFixed(3)} mm`}
                </span>
              </div>
              <div>
                <span>One above</span>
                <strong>
                  {aboveBestFit === null
                    ? "--"
                    : `${formatDrillBitLabel(aboveBestFit)} (${aboveBestFit.diameterIn.toFixed(4)} in)`}
                </strong>
                <span>
                  {aboveBestFit === null
                    ? ""
                    : `${formatDrillFamily(aboveBestFit)} · ${inchesToMm(aboveBestFit.diameterIn).toFixed(3)} mm`}
                </span>
              </div>
            </div>
          </div>
          <p>
            Enter bore geometry and tone-hole dimensions, then evaluate quarter-wave air-column
            behavior to guide hole placement decisions.
          </p>
        </div>
        <div className="hero-card">
          <label>
            Design name
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            Air temperature (C)
            <input
              type="number"
              value={tempC}
              onChange={(e) => setTempC(Number(e.target.value))}
            />
          </label>
            <label>
              Pitch standard A4 (Hz)
              <input
                type="number"
                min={380}
                max={450}
                step={0.1}
                value={pitchStandardHz}
                onChange={(e) => setPitchStandardHz(Number(e.target.value))}
              />
            </label>
            <div className="badge-row">
              <button type="button" onClick={() => setPitchStandardHz(442)}>
                A=442
              </button>
              <button type="button" onClick={() => setPitchStandardHz(415)}>
                A=415
              </button>
              <button type="button" onClick={() => setPitchStandardHz(392)}>
                A=392
              </button>
            </div>
          <label>
            Mouthpiece preset
            <select
              value={selectedMouthpieceId}
              onChange={(e) => setSelectedMouthpieceId(e.target.value)}
            >
              {mouthpiecePresets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
            </select>
          </label>

          <button type="button" onClick={() => applyMouthpiecePreset(selectedMouthpieceId)}>
            Apply mouthpiece preset
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,text/plain,application/json"
            style={{ display: "none" }}
            onChange={handleLoadTextFile}
          />
          <div className="badge-row">
            <button type="button" onClick={saveToTextFile}>Save to text file</button>
            <button type="button" onClick={openTextFileDialog}>Load from text file</button>
            {lastSavedAt && <span className="badge neutral">Saved at {lastSavedAt}</span>}
          </div>
          {loadStatus && <p className="math">{loadStatus}</p>}
          <div className="badge-row">
            {mouthpiece.presetApplied ? (
              <span className="badge good">Preset geometry active</span>
            ) : (
              <span className="badge warn">Preset no longer applicable after mouthpiece edits</span>
            )}
          </div>
          <p className="math">
            Selected preset: {activeMouthpiece.label} ({activeMouthpiece.instrument}), tip opening{" "}
            {activeMouthpiece.openingMm.toFixed(3)} mm ({activeMouthpiece.openingHundredthMm} x
            1/100 mm), facing {activeMouthpiece.facingLength}. Current mouthpiece insert ={" "}
            {mouthpiece.insertMm.toFixed(1)} mm, bore point = {mouthpiece.boreMm.toFixed(2)} mm.
          </p>
          <div className="stat-row">
            <div>
              <span>Acoustic length</span>
              <strong>{totalLengthMm.toFixed(1)} mm</strong>
            </div>
            <div>
              <span>Physical length</span>
              <strong>{physicalInstrumentLengthMm.toFixed(1)} mm</strong>
            </div>
            <div>
              <span>Speed of sound</span>
              <strong>{cMs.toFixed(2)} m/s</strong>
            </div>
          </div>
        </div>
      </header>

      <main className="grid">
        <section className="panel">
          <div className="panel-head">
            <h2>Bore Profile Points (z from bell)</h2>
            <button
              type="button"
              onClick={() =>
                setSegments((prev) => [
                  ...prev,
                  {
                    id: makeId("seg"),
                    label: `Point ${prev.length + 1}`,
                    zMm: Math.max(...prev.map((segment) => segment.zMm), 0) + 40,
                    diameterMm: 14.8,
                  },
                ])
              }
            >
              Add point
            </button>
          </div>
          <p className="math">
            z convention: 0 mm is the point farthest from the mouthpiece (bell end).
          </p>

          <table>
            <thead>
              <tr>
                <th>Part label</th>
                <th>Source</th>
                <th>z (mm)</th>
                <th>Inner dia (mm)</th>
                <th>Outer dia (mm)</th>
                <th>Phys. L (mm)</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {profileRows.map(({ segment, source }, index) => (
                <tr key={segment.id}>
                  <td>
                    <input
                      value={segment.label}
                      placeholder={`P${index + 1}`}
                      onChange={(e) =>
                        source === "mouthpiece"
                          ? updateMouthpieceSegment("label", e.target.value)
                          : updateSegmentLabel(segment.id, e.target.value)
                      }
                    />
                  </td>
                  <td>
                    <span
                      className={`badge ${
                        source === "mouthpiece"
                          ? mouthpiece.presetApplied
                            ? "good"
                            : "warn"
                          : "neutral"
                      }`}
                    >
                      {source === "mouthpiece"
                        ? mouthpiece.presetApplied
                          ? "Preset mouthpiece"
                          : "Custom mouthpiece"
                        : "Body"}
                    </span>
                  </td>
                  <td>
                    <input
                      type="number"
                      value={segment.zMm}
                      onChange={(e) =>
                        source === "mouthpiece"
                          ? updateMouthpieceSegment("zMm", Number(e.target.value))
                          : updateSegmentCumulativeZ(segment.id, Number(e.target.value))
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      value={segment.diameterMm}
                      onChange={(e) =>
                        source === "mouthpiece"
                          ? updateMouthpieceSegment("diameterMm", Number(e.target.value))
                          : updateSegment(segment.id, "diameterMm", Number(e.target.value))
                      }
                    />
                  </td>
                  <td>
                    {source === "mouthpiece" ? (
                      <span className="muted-cell">—</span>
                    ) : (
                      <input
                        type="number"
                        placeholder="optional"
                        value={segment.outerDiameterMm ?? ""}
                        onChange={(e) =>
                          updateSegmentOuterDiameter(segment.id, e.target.value)
                        }
                      />
                    )}
                  </td>
                  <td>
                    {source === "mouthpiece" ? (
                      <input
                        type="number"
                        value={mouthpiece.overallLengthMm}
                        onChange={(e) =>
                          updateMouthpieceSegment("overallLengthMm", Number(e.target.value))
                        }
                      />
                    ) : (
                      <input
                        type="number"
                        value={partLengthById.get(segment.id) ?? ""}
                        onChange={(e) =>
                          updateSegmentPhysicalLength(segment.id, Number(e.target.value))
                        }
                      />
                    )}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="danger"
                      onClick={() =>
                        setSegments((prev) => prev.filter((candidate) => candidate.id !== segment.id))
                      }
                      disabled={source === "mouthpiece" || segments.length <= 1}
                    >
                      {source === "mouthpiece" ? "Preset" : "Remove"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2>Tone Holes</h2>
            <button
              type="button"
              onClick={() =>
                setHoles((prev) => [
                  ...prev,
                  {
                    id: makeId("hole"),
                    label: `H${prev.length + 1}`,
                    zMm: Math.max(180, prev.length * 36 + 180),
                    angleDeg: 0,
                    diameterMm: 7,
                    chimneyMm: 3,
                    targetNote: "",
                  },
                ])
              }
            >
              Add hole
            </button>
          </div>

          <p className="math">
            Tone-hole z uses the same convention as the bore profile: 0 mm is the bell end, and
            larger z values move upward toward the barrel and mouthpiece.
          </p>
          <p className="math">
            Circumferential location uses degrees from the front centerline: front = 0, back =
            -180, side keys = +/-90.
          </p>

          <table>
            <thead>
              <tr>
                <th>Label</th>
                <th>z from bell (mm)</th>
                <th>Angle (deg)</th>
                <th>Dia (mm)</th>
                <th>Chimney (mm)</th>
                <th>Wall (mm)</th>
                <th>Target</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {holes.map((hole) => (
                <tr key={hole.id}>
                  <td>
                    <input
                      value={hole.label}
                      onChange={(e) => updateHole(hole.id, "label", e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      value={hole.zMm}
                      onChange={(e) => updateHole(hole.id, "zMm", Number(e.target.value))}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      step="1"
                      min={-180}
                      max={180}
                      value={hole.angleDeg}
                      onChange={(e) =>
                        updateHole(
                          hole.id,
                          "angleDeg",
                          normalizeHoleAngleDeg(Number(e.target.value))
                        )
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      value={hole.diameterMm}
                      onChange={(e) => updateHole(hole.id, "diameterMm", Number(e.target.value))}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      value={hole.chimneyMm}
                      onChange={(e) => updateHole(hole.id, "chimneyMm", Number(e.target.value))}
                    />
                  </td>
                  <td>
                    {(() => {
                      const distMm = totalBoreLengthMm(acousticSegments) - hole.zMm;
                      const outerDia = outerDiameterAtMm(acousticSegments, distMm);
                      const innerDia = results.find((r) => r.id === hole.id)?.localBoreMm;
                      const wallMm =
                        outerDia !== null && innerDia !== undefined
                          ? Math.max(0, (outerDia - innerDia) / 2)
                          : null;
                      return wallMm !== null ? (
                        <div className="wall-cell">
                          <span>{wallMm.toFixed(2)}</span>
                          <button
                            type="button"
                            className="sync-btn"
                            title="Set chimney = wall thickness"
                            onClick={() => updateHole(hole.id, "chimneyMm", wallMm)}
                          >
                            ← use
                          </button>
                        </div>
                      ) : (
                        <span className="muted-cell">—</span>
                      );
                    })()}
                  </td>
                  <td>
                    <input
                      placeholder="E4"
                      value={hole.targetNote}
                      onChange={(e) => updateHole(hole.id, "targetNote", e.target.value)}
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      className="danger"
                      onClick={() =>
                        setHoles((prev) => prev.filter((candidate) => candidate.id !== hole.id))
                      }
                      disabled={holes.length <= 1}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="panel full-width">
          <div className="panel-head">
            <h2>Bore Geometry Visualization</h2>
          </div>
          <p className="math">
            Profile view of the modeled air column. Tone-hole markers are positioned by distance
            in z-space from bell end.
          </p>

          <div className="bore-figure-wrap">
            <svg
              className="bore-figure"
              viewBox={`0 0 ${boreSvg.width} ${boreSvg.height}`}
              preserveAspectRatio="xMidYMid meet"
              role="img"
              aria-label="Clarinet bore profile visualization"
            >
              <rect x="0" y="0" width={boreSvg.width} height={boreSvg.height} fill="#f8fbff" />

              <line
                x1="24"
                y1={boreSvg.centerY}
                x2={boreSvg.width - 24}
                y2={boreSvg.centerY}
                className="bore-centerline"
              />

              {boreSvg.segmentLines.map((seg) => (
                <line
                  key={seg.id}
                  x1={seg.x}
                  y1={seg.y1}
                  x2={seg.x}
                  y2={seg.y2}
                  className="segment-divider"
                />
              ))}

              <polygon points={boreSvg.polygon} className="bore-shape" />
              {boreSvg.mouthpieceTip !== null && (
                <polygon points={boreSvg.mouthpieceTip} className="mouthpiece-shape" />
              )}

              {boreSvg.holesOnBore.map((hole) => {
                return (
                  <g key={hole.id}>
                    <line
                      x1={hole.x}
                      y1={hole.stemFromY}
                      x2={hole.x}
                      y2={hole.stemToY}
                      className="hole-stem"
                    />
                    <circle
                      cx={hole.x}
                      cy={hole.dotY}
                      r="5"
                      className="hole-dot"
                    />
                    <line
                      x1={hole.x}
                      y1={hole.leaderFromY}
                      x2={hole.x}
                      y2={hole.leaderToY}
                      className="hole-label-leader"
                    />
                    <rect
                      x={hole.x - hole.labelWidth / 2}
                      y={hole.labelY - 11}
                      width={hole.labelWidth}
                      height="16"
                      rx="4"
                      className="hole-label-box"
                    />
                    <text x={hole.x} y={hole.labelY} className="hole-label">
                      {hole.label}
                    </text>
                  </g>
                );
              })}

              {boreSvg.rulerTicks.map((tick) => (
                <g key={`ruler-${tick.zMm}`}>
                  <line
                    x1={tick.x}
                    y1={boreSvg.centerY + 108}
                    x2={tick.x}
                    y2={boreSvg.centerY + 113}
                    className="ruler-tick"
                  />
                  <text x={tick.x} y={boreSvg.centerY + 128} className="ruler-label">
                    {tick.label}
                  </text>
                </g>
              ))}

              {boreSvg.segmentLabels.map((seg) => (
                <g key={seg.id}>
                  <circle cx={seg.x} cy={seg.boreBottomY + 5} r="3.5" className="segment-dot" />
                  <line
                    x1={seg.x}
                    y1={seg.boreBottomY + 9}
                    x2={seg.x}
                    y2={seg.y - 9}
                    className="segment-leader"
                  />
                  <rect
                    x={seg.x - seg.labelW / 2}
                    y={seg.y - 9}
                    width={seg.labelW}
                    height="15"
                    rx="4"
                    className="segment-label-box"
                  />
                  <text x={seg.x} y={seg.y} className="segment-label">
                    {seg.labelText}
                  </text>
                </g>
              ))}

              <text x="24" y={boreSvg.height - 4} className="axis-label">
                0 mm (bell end)
              </text>
              <text x={boreSvg.width - 24} y={boreSvg.height - 4} className="axis-label axis-right">
                {boreSvg.visualTotalMm.toFixed(1)} mm (mouthpiece tip)
              </text>
            </svg>
          </div>
        </section>

        <section className="panel full-width">
          <h2>Tone Hole Physics Evaluation</h2>
          <p className="math">
            Base relation: f = c / (4L_eff), with hole vent correction added to L_eff from bore and
            chimney geometry.
          </p>
          <p className="math">
            Note: Target cents and recommendation are evaluated against f1 (chalumeau).
          </p>

          <table>
            <thead>
              <tr>
                <th>Hole</th>
                <th>z</th>
                <th>Local bore</th>
                <th>Wall</th>
                <th>L_eff</th>
                <th>f1</th>
                <th>f3</th>
                <th>Target Hz</th>
                <th>Nearest</th>
                <th>Target cents</th>
                <th>Recommendation</th>
              </tr>
            </thead>
            <tbody>
              {results.map((result) => (
                <tr key={result.id}>
                  <td>{result.label}</td>
                  <td>{result.zMm.toFixed(1)} mm</td>
                  <td>{result.localBoreMm.toFixed(2)} mm</td>
                  <td>
                    {result.wallThicknessMm !== null
                      ? `${result.wallThicknessMm.toFixed(2)} mm`
                      : "—"}
                  </td>
                  <td>{result.effectiveLengthMm.toFixed(2)} mm</td>
                  <td>{result.predictedFundamentalHz.toFixed(2)} Hz</td>
                  <td>{result.predictedThirdHz.toFixed(2)} Hz</td>
                  <td className="target-hz-cell">
                    {result.targetHz !== null
                      ? `${result.targetHz.toFixed(2)} Hz`
                      : "—"}
                  </td>
                  <td>
                    {result.nearestNote} ({result.centsErrorToNearest.toFixed(1)} cents)
                  </td>
                  <td>
                    {result.centsErrorToTarget === null
                      ? "N/A"
                      : `${result.centsErrorToTarget.toFixed(1)} cents`}
                  </td>
                  <td className="advice">{result.recommendation}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="warnings">
            <h3>Placement Flags</h3>
            {warnings.length === 0 ? (
              <p>No spacing conflicts detected with the current profile.</p>
            ) : (
              <ul>
                {warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            )}

            <h3>Model Confidence Flags</h3>
            {modelWarnings.length === 0 ? (
              <p>No obvious out-of-range geometry detected for the current approximation.</p>
            ) : (
              <ul>
                {modelWarnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="panel full-width">
          <div className="panel-head">
            <h2>Fingering and Full-Scale Intonation</h2>
            <button
              type="button"
              onClick={() =>
                setFingerings((prev) => [
                  ...prev,
                  {
                    id: makeId("fing"),
                    label: `Fingering ${prev.length + 1}`,
                    targetNote: "",
                    ventHoleId: holes[0]?.id ?? "",
                    register: "fundamental",
                    termination: "vent-hole",
                  },
                ])
              }
            >
              Add fingering
            </button>
          </div>

          <div className="settings-row">
            <label>
              Pass band (cents)
              <input
                type="number"
                value={toleranceCents}
                onChange={(e) => setToleranceCents(Number(e.target.value))}
              />
            </label>
            <label>
              First chalumeau note
              <select
                value={firstChalumeauNote}
                onChange={(e) => setFirstChalumeauNote(e.target.value)}
              >
                {noteOptions.map((note) => (
                  <option key={note} value={note}>
                    {note}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" onClick={autoPopulateIntonationTargets}>
              Auto populate intonation
            </button>
            <div className="badge-row">
              <span className="badge good">
                Pass rate: {passCount}/{fingeringResults.length}
              </span>
              <span className="badge neutral">
                Mean abs error: {meanAbsCents === null ? "N/A" : `${meanAbsCents.toFixed(1)} cents`}
              </span>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Target</th>
                <th>Vent hole</th>
                <th>Register</th>
                <th>Termination</th>
                <th>Predicted</th>
                <th>Nearest</th>
                <th>Error to target</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {fingerings.map((fingering) => {
                const result = fingeringResults.find((entry) => entry.id === fingering.id);
                return (
                  <tr key={fingering.id}>
                    <td>
                      <input
                        value={fingering.label}
                        onChange={(e) => updateFingering(fingering.id, "label", e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        placeholder="E4"
                        value={fingering.targetNote}
                        onChange={(e) =>
                          updateFingering(fingering.id, "targetNote", e.target.value)
                        }
                      />
                    </td>
                    <td>
                      <select
                        value={fingering.ventHoleId}
                        onChange={(e) =>
                          updateFingering(fingering.id, "ventHoleId", e.target.value)
                        }
                      >
                        {holes.map((hole) => (
                          <option key={hole.id} value={hole.id}>
                            {hole.label} @ z {hole.zMm.toFixed(1)} mm
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <select
                        value={fingering.register}
                        onChange={(e) =>
                          updateFingering(
                            fingering.id,
                            "register",
                            e.target.value as "fundamental" | "third"
                          )
                        }
                      >
                        <option value="fundamental">Fundamental (chalumeau)</option>
                        <option value="third">Third harmonic (clarion)</option>
                      </select>
                    </td>
                    <td>
                      <select
                        value={fingering.termination}
                        onChange={(e) =>
                          updateFingering(
                            fingering.id,
                            "termination",
                            e.target.value as
                              | "vent-hole"
                              | "below-open-vent-closed"
                              | "bell"
                          )
                        }
                      >
                        <option value="vent-hole">Vent hole</option>
                        <option value="below-open-vent-closed">
                          Holes below open, vent closed
                        </option>
                        <option value="bell">Bell (all covered)</option>
                      </select>
                    </td>
                    <td>
                      {result?.predictedHz === null
                        ? "N/A"
                        : `${result?.predictedHz.toFixed(2)} Hz`}
                    </td>
                    <td>{result?.nearestNote ?? "N/A"}</td>
                    <td>
                      {result?.centsErrorToTarget === null
                        ? "N/A"
                        : `${result?.centsErrorToTarget?.toFixed(1)} cents`}
                    </td>
                    <td>
                      <span
                        className={`badge ${result?.withinTolerance ? "good" : "warn"}`}
                      >
                        {result?.note ?? "Pending"}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="danger"
                        onClick={() =>
                          setFingerings((prev) =>
                            prev.filter((candidate) => candidate.id !== fingering.id)
                          )
                        }
                        disabled={fingerings.length <= 1}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      </main>

      <footer>
        <strong>{name}</strong>
        <span>
          Model scope: first-order closed-open clarinet approximation with hole branch correction.
          Validate final dimensions with impedance or prototype measurements.
          Active preset source: <a href={activeMouthpiece.sourceUrl}>{activeMouthpiece.sourceUrl}</a>.
        </span>
      </footer>
    </div>
  );
}
