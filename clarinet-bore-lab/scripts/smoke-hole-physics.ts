import {
  evaluateFingerings,
  evaluateToneHoles,
  spacingWarnings,
  type BoreSegment,
  type Fingering,
  type ToneHole,
} from "../src/model";

type Check = {
  name: string;
  ok: boolean;
  details: string;
};

function runCheck(name: string, ok: boolean, details: string): Check {
  return { name, ok, details };
}

function summarize(checks: Check[]): void {
  let failed = 0;
  for (const check of checks) {
    if (check.ok) {
      console.log(`PASS  ${check.name} - ${check.details}`);
    } else {
      failed += 1;
      console.error(`FAIL  ${check.name} - ${check.details}`);
    }
  }

  console.log("----------------------------------------");
  console.log(`Checks: ${checks.length}, Passed: ${checks.length - failed}, Failed: ${failed}`);

  if (failed > 0) {
    process.exitCode = 1;
  }
}

const segments: BoreSegment[] = [
  { id: "seg-bell", label: "Bell", zMm: 0, diameterMm: 58.8 },
  { id: "seg-lower", label: "Lower joint", zMm: 203, diameterMm: 14.287, outerDiameterMm: 27 },
  { id: "seg-mid", label: "Middle joint", zMm: 303, diameterMm: 14.287, outerDiameterMm: 26 },
  { id: "seg-barrel", label: "Barrel socket", zMm: 478, diameterMm: 14.287, outerDiameterMm: 26 },
  { id: "seg-mouthpiece", label: "Mouthpiece point", zMm: 523, diameterMm: 12.6 },
];

const holes: ToneHole[] = [
  { id: "h1", label: "Finger 1", zMm: 369.5, angleDeg: 0, diameterMm: 6.5, chimneyMm: 5.8565, targetNote: "E4" },
  { id: "h2", label: "Finger 2", zMm: 340.5, angleDeg: 0, diameterMm: 6.9, chimneyMm: 5.8565, targetNote: "D4" },
  { id: "h3", label: "Finger 3", zMm: 311.5, angleDeg: 0, diameterMm: 6.9, chimneyMm: 5.8565, targetNote: "C4" },
  { id: "h4", label: "Finger 4", zMm: 271, angleDeg: 0, diameterMm: 6.9, chimneyMm: 5.8565, targetNote: "A#3" },
  { id: "h5", label: "Finger 5", zMm: 240, angleDeg: 0, diameterMm: 6.9, chimneyMm: 5.8898, targetNote: "A3" },
  { id: "h6", label: "Finger 6", zMm: 212, angleDeg: 0, diameterMm: 6.9, chimneyMm: 5.9732, targetNote: "G3" },
  { id: "hReg", label: "Register", zMm: 458, angleDeg: -180, diameterMm: 3.3, chimneyMm: 5, targetNote: "A4" },
];

const fingerings: Fingering[] = [
  { id: "f-h1", label: "Chal E4", targetNote: "E4", ventHoleId: "h1", register: "fundamental", termination: "bell" },
  { id: "f-h2", label: "Chal D4", targetNote: "D4", ventHoleId: "h2", register: "fundamental", termination: "bell" },
  { id: "f-h3", label: "Chal C4", targetNote: "C4", ventHoleId: "h3", register: "fundamental", termination: "bell" },
  { id: "f-h4", label: "Chal A#3", targetNote: "A#3", ventHoleId: "h4", register: "fundamental", termination: "bell" },
  { id: "f-h5", label: "Chal A3", targetNote: "A3", ventHoleId: "h5", register: "fundamental", termination: "bell" },
  { id: "f-h6", label: "Chal G3", targetNote: "G3", ventHoleId: "h6", register: "fundamental", termination: "bell" },
  { id: "f-reg", label: "Chal A4", targetNote: "A4", ventHoleId: "hReg", register: "fundamental", termination: "vent-hole" },
];

const checks: Check[] = [];

const holeEval = evaluateToneHoles(segments, holes, 20, 415, fingerings);
const fingEval = evaluateFingerings(segments, holes, fingerings, 20, 10, 415);

// 1) Tone-hole and fingering cents must agree in sign for same target/termination context.
for (const f of fingEval) {
  if (f.centsErrorToTarget === null) {
    continue;
  }
  const original = fingerings.find((item) => item.id === f.id);
  const h = original ? holeEval.find((e) => e.id === original.ventHoleId) : undefined;
  if (!h || h.centsErrorToTarget === null) {
    continue;
  }
  const sameSign = Math.sign(h.centsErrorToTarget) === Math.sign(f.centsErrorToTarget) || Math.abs(h.centsErrorToTarget) < 1 || Math.abs(f.centsErrorToTarget) < 1;
  checks.push(
    runCheck(
      `Cents sign consistency ${f.label}`,
      sameSign,
      `hole=${h.centsErrorToTarget.toFixed(1)}c, fingering=${f.centsErrorToTarget.toFixed(1)}c`
    )
  );
}

// 2) For vent-hole mode, moving a hole toward mouthpiece (higher z) should sharpen.
const ventBase: Fingering[] = [
  { id: "vent-base", label: "Vent base", targetNote: "A4", ventHoleId: "hReg", register: "fundamental", termination: "vent-hole" },
];
const holeBase = evaluateFingerings(segments, holes, ventBase, 20, 10, 415)[0];
const movedHoles = holes.map((h) => (h.id === "hReg" ? { ...h, zMm: h.zMm + 8 } : h));
const holeMoved = evaluateFingerings(segments, movedHoles, ventBase, 20, 10, 415)[0];
checks.push(
  runCheck(
    "Vent-hole z increase sharpens",
    (holeBase.predictedHz ?? 0) < (holeMoved.predictedHz ?? 0),
    `base=${holeBase.predictedHz?.toFixed(2)}Hz, moved=${holeMoved.predictedHz?.toFixed(2)}Hz`
  )
);

// 3) For vent-hole mode, increasing chimney should flatten.
const tallerHoles = holes.map((h) => (h.id === "hReg" ? { ...h, chimneyMm: h.chimneyMm + 2 } : h));
const holeTaller = evaluateFingerings(segments, tallerHoles, ventBase, 20, 10, 415)[0];
checks.push(
  runCheck(
    "Vent-hole chimney increase flattens",
    (holeTaller.predictedHz ?? 0) < (holeBase.predictedHz ?? 0),
    `base=${holeBase.predictedHz?.toFixed(2)}Hz, taller=${holeTaller.predictedHz?.toFixed(2)}Hz`
  )
);

// 4) For bell termination, hole geometry changes should not materially alter pitch.
const bellSingle: Fingering[] = [
  { id: "bell-single", label: "Bell test", targetNote: "G3", ventHoleId: "h6", register: "fundamental", termination: "bell" },
];
const bellBase = evaluateFingerings(segments, holes, bellSingle, 20, 10, 415)[0];
const wildlyChangedHoles = holes.map((h) =>
  h.id === "h6" ? { ...h, zMm: h.zMm + 30, diameterMm: h.diameterMm + 2, chimneyMm: h.chimneyMm + 3 } : h
);
const bellChanged = evaluateFingerings(segments, wildlyChangedHoles, bellSingle, 20, 10, 415)[0];
checks.push(
  runCheck(
    "Bell termination invariance to hole geometry",
    Math.abs((bellChanged.predictedHz ?? 0) - (bellBase.predictedHz ?? 0)) < 1e-9,
    `base=${bellBase.predictedHz?.toFixed(6)}Hz, changed=${bellChanged.predictedHz?.toFixed(6)}Hz`
  )
);

// 5) Spacing warnings logic should detect tight same-angle holes and allow opposite-side separation at same z.
const spacingHoles: ToneHole[] = [
  { id: "s1", label: "S1", zMm: 300, angleDeg: 0, diameterMm: 6, chimneyMm: 3, targetNote: "" },
  { id: "s2", label: "S2", zMm: 300, angleDeg: 0, diameterMm: 6, chimneyMm: 3, targetNote: "" },
  { id: "s3", label: "S3", zMm: 300, angleDeg: -180, diameterMm: 6, chimneyMm: 3, targetNote: "" },
];
const spacing = spacingWarnings(spacingHoles, segments);
checks.push(
  runCheck(
    "Spacing warning catches same-position overlap",
    spacing.some((w) => w.includes("S1") && w.includes("S2")),
    `warnings=${spacing.length}`
  )
);
checks.push(
  runCheck(
    "Spacing warning allows opposite-side same-z",
    !spacing.some((w) => w.includes("S1") && w.includes("S3")),
    `warnings=${spacing.length}`
  )
);

summarize(checks);
