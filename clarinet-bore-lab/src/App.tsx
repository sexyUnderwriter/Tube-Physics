import { ChangeEvent, useMemo, useState } from "react";
import {
  BoreSegment,
  Fingering,
  ToneHole,
  sampleBoreProfile,
  evaluateFingerings,
  evaluateToneHoles,
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
  sourceUrl: string;
};

type CsvImportDiameterMode = "avg" | "min" | "max";

type ImportSegmentDraft = {
  label: string;
  lengthMm: number;
  startDiameterMm: number;
  endDiameterMm: number;
};

type ImportHoleDraft = {
  label: string;
  positionMm: number;
  diameterMm: number;
  chimneyMm: number;
};

type CsvImportPreview = {
  instrument: string;
  catalogNumber: string;
  segments: ImportSegmentDraft[];
  holes: ImportHoleDraft[];
  warnings: string[];
};

type SectionPoint = { xMm: number; diameterMm: number };
type SectionHole = { label: string; xMm: number; diameterMm: number };

function splitCsvLine(line: string): string[] {
  return line.split(",").map((cell) => cell.trim());
}

function parseFlexibleNumber(raw: string): number | null {
  const normalized = raw.replace(/[^0-9.+-]/g, "").replace(/-+$/, "");
  if (normalized.length === 0 || normalized === "." || normalized === "-" || normalized === "+") {
    return null;
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function pickInsideDiameter(
  minValue: number | null,
  maxValue: number | null,
  mode: CsvImportDiameterMode
): number | null {
  if (mode === "min") {
    return minValue ?? maxValue;
  }
  if (mode === "max") {
    return maxValue ?? minValue;
  }
  if (minValue !== null && maxValue !== null) {
    return (minValue + maxValue) * 0.5;
  }
  return minValue ?? maxValue;
}

function extractHoleDiameterMm(text: string): number | null {
  const diameterMatch = text.match(/diameter\s*([0-9]+(?:\.[0-9]+)?)\s*mm/i);
  if (diameterMatch) {
    return Number(diameterMatch[1]);
  }
  const parentheticalMatch = text.match(/\(([0-9]+(?:\.[0-9]+)?)\s*mm\)/i);
  if (parentheticalMatch) {
    return Number(parentheticalMatch[1]);
  }
  return null;
}

function normalizeHoleLabel(text: string): string {
  return text
    .replace(/center of\s*/i, "")
    .replace(/\s*\([^)]*\)\s*/g, "")
    .replace(/\s*diameter\s*[0-9.]+\s*mm\s*/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseDennerStyleCsv(
  csvText: string,
  diameterMode: CsvImportDiameterMode,
  defaultChimneyMm: number
): CsvImportPreview {
  const lines = csvText.split(/\r?\n/);
  const warnings: string[] = [];

  const sections: Array<{
    name: string;
    points: SectionPoint[];
    holes: SectionHole[];
    maxLengthMm: number;
  }> = [];

  let instrument = "Imported Instrument";
  let catalogNumber = "";
  let currentSection: {
    name: string;
    points: SectionPoint[];
    holes: SectionHole[];
    maxLengthMm: number;
  } | null = null;

  function closeSection(): void {
    if (currentSection) {
      sections.push(currentSection);
    }
    currentSection = null;
  }

  for (const line of lines) {
    if (line.trim().length === 0) {
      continue;
    }
    const cols = splitCsvLine(line);
    const first = cols[0] ?? "";

    if (first.startsWith("Instrument:")) {
      instrument = cols.slice(0, 3).join(" ").replace(/\s+/g, " ").trim();
      continue;
    }
    if (first.startsWith("Cat. No.:")) {
      catalogNumber = cols.slice(0, 2).join(" ").replace(/\s+/g, " ").trim();
      continue;
    }

    if (/^PART:/i.test(first)) {
      closeSection();
      const name = first
        .replace(/^PART:\s*/i, "")
        .replace(/\s*\(Page[^)]*\)\s*/i, "")
        .trim();
      currentSection = {
        name,
        points: [],
        holes: [],
        maxLengthMm: 0,
      };
      continue;
    }

    if (!currentSection || /^Length\s*\(mm\)/i.test(first)) {
      continue;
    }

    const rowLengthMm = parseFlexibleNumber(first);
    if (rowLengthMm !== null) {
      currentSection.maxLengthMm = Math.max(currentSection.maxLengthMm, rowLengthMm);
    }

    const insideMin = parseFlexibleNumber(cols[1] ?? "");
    const insideMax = parseFlexibleNumber(cols[2] ?? "");
    const chosenInside = pickInsideDiameter(insideMin, insideMax, diameterMode);

    if (rowLengthMm !== null && chosenInside !== null) {
      currentSection.points.push({ xMm: rowLengthMm, diameterMm: chosenInside });
    }

    const remarkText = [first, cols[7] ?? ""].join(" ").trim();
    if (/center of .*hole/i.test(remarkText)) {
      if (rowLengthMm === null) {
        warnings.push(
          `${currentSection.name}: could not place hole row \"${first}\" because no numeric length was provided.`
        );
        continue;
      }

      const parsedHoleDiameter = extractHoleDiameterMm([first, cols[7] ?? ""].join(" "));
      const label = normalizeHoleLabel(remarkText) || `Hole @ ${rowLengthMm.toFixed(1)} mm`;
      currentSection.holes.push({
        label,
        xMm: rowLengthMm,
        diameterMm: parsedHoleDiameter ?? 7,
      });
    }
  }

  closeSection();

  const segments: ImportSegmentDraft[] = [];
  const holes: ImportHoleDraft[] = [];
  let runningOffsetMm = 0;

  for (const section of sections) {
    const dedupedPointMap = new Map<number, number>();
    for (const point of section.points) {
      dedupedPointMap.set(point.xMm, point.diameterMm);
    }
    const sortedPoints = [...dedupedPointMap.entries()]
      .map(([xMm, diameterMm]) => ({ xMm, diameterMm }))
      .sort((a, b) => a.xMm - b.xMm);

    if (sortedPoints.length < 2) {
      warnings.push(`${section.name}: not enough valid inside-diameter points to build segments.`);
    }

    for (let i = 1; i < sortedPoints.length; i += 1) {
      const prev = sortedPoints[i - 1];
      const curr = sortedPoints[i];
      const lengthMm = curr.xMm - prev.xMm;
      if (lengthMm <= 0.01) {
        continue;
      }
      segments.push({
        label: `${section.name} ${i}`,
        lengthMm,
        startDiameterMm: prev.diameterMm,
        endDiameterMm: curr.diameterMm,
      });
    }

    for (const hole of section.holes) {
      holes.push({
        label: hole.label,
        positionMm: runningOffsetMm + hole.xMm,
        diameterMm: hole.diameterMm,
        chimneyMm: defaultChimneyMm,
      });
    }

    const sectionLength =
      section.maxLengthMm > 0
        ? section.maxLengthMm
        : sortedPoints.length > 0
          ? sortedPoints[sortedPoints.length - 1].xMm
          : 0;

    runningOffsetMm += sectionLength;
  }

  if (segments.length === 0) {
    warnings.push("No bore segments were generated from this file.");
  }

  return {
    instrument,
    catalogNumber,
    segments,
    holes,
    warnings,
  };
}

function makeId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

const initialSegments: BoreSegment[] = [
  {
    id: makeId("seg"),
    label: "Upper joint",
    lengthMm: 240,
    startDiameterMm: 14.6,
    endDiameterMm: 14.4,
  },
  {
    id: makeId("seg"),
    label: "Middle joint",
    lengthMm: 220,
    startDiameterMm: 14.4,
    endDiameterMm: 14.8,
  },
  {
    id: makeId("seg"),
    label: "Lower joint",
    lengthMm: 180,
    startDiameterMm: 14.8,
    endDiameterMm: 15.2,
  },
];

const initialHoles: ToneHole[] = [
  {
    id: makeId("hole"),
    label: "Vent",
    positionMm: 150,
    diameterMm: 2.2,
    chimneyMm: 2.8,
    targetNote: "B4",
  },
  {
    id: makeId("hole"),
    label: "Thumb",
    positionMm: 210,
    diameterMm: 8.2,
    chimneyMm: 3.1,
    targetNote: "G4",
  },
  {
    id: makeId("hole"),
    label: "Front A",
    positionMm: 196,
    diameterMm: 4.0,
    chimneyMm: 2.3,
    targetNote: "A4",
  },
  {
    id: makeId("hole"),
    label: "Finger 1",
    positionMm: 236,
    diameterMm: 7.8,
    chimneyMm: 3.0,
    targetNote: "A4",
  },
  {
    id: makeId("hole"),
    label: "Finger 2",
    positionMm: 264,
    diameterMm: 8.0,
    chimneyMm: 3.0,
    targetNote: "G#4",
  },
  {
    id: makeId("hole"),
    label: "Finger 3",
    positionMm: 292,
    diameterMm: 8.1,
    chimneyMm: 3.0,
    targetNote: "G4",
  },
  {
    id: makeId("hole"),
    label: "Finger 4",
    positionMm: 324,
    diameterMm: 8.3,
    chimneyMm: 3.0,
    targetNote: "F#4",
  },
  {
    id: makeId("hole"),
    label: "Finger 5",
    positionMm: 358,
    diameterMm: 8.4,
    chimneyMm: 3.0,
    targetNote: "F4",
  },
  {
    id: makeId("hole"),
    label: "Finger 6",
    positionMm: 394,
    diameterMm: 8.4,
    chimneyMm: 3.0,
    targetNote: "E4",
  },
  {
    id: makeId("hole"),
    label: "Finger 7",
    positionMm: 432,
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
  },
  {
    id: makeId("fing"),
    label: "Chalumeau E",
    targetNote: "E4",
    ventHoleId: initialHoles[8].id,
    register: "fundamental",
  },
  {
    id: makeId("fing"),
    label: "Chalumeau F",
    targetNote: "F4",
    ventHoleId: initialHoles[7].id,
    register: "fundamental",
  },
  {
    id: makeId("fing"),
    label: "Clarion B",
    targetNote: "B4",
    ventHoleId: initialHoles[0].id,
    register: "third",
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
    sourceUrl: "https://vandoren.fr/en/vandoren-mouthpieces/t6-v16-tenor-saxophone-mouthpiece/",
  },
];

export default function App() {
  const [name, setName] = useState("Prototype Clarinet Bore");
  const [tempC, setTempC] = useState(20);
  const [pitchStandardHz, setPitchStandardHz] = useState(440);
  const [segments, setSegments] = useState<BoreSegment[]>(initialSegments);
  const [holes, setHoles] = useState<ToneHole[]>(initialHoles);
  const [toleranceCents, setToleranceCents] = useState(10);
  const [fingerings, setFingerings] = useState<Fingering[]>(initialFingerings);
  const [selectedMouthpieceId, setSelectedMouthpieceId] = useState(mouthpiecePresets[1].id);
  const [activeMouthpiece, setActiveMouthpiece] = useState<MouthpiecePreset>(
    mouthpiecePresets[1]
  );
  const [importDiameterMode, setImportDiameterMode] = useState<CsvImportDiameterMode>("avg");
  const [importDefaultChimneyMm, setImportDefaultChimneyMm] = useState(3);
  const [importFileName, setImportFileName] = useState("");
  const [importPreview, setImportPreview] = useState<CsvImportPreview | null>(null);

  const acousticSegments = useMemo<BoreSegment[]>(() => {
    const firstBore = segments[0]?.startDiameterMm ?? activeMouthpiece.shankBoreMm;
    return [
      {
        id: "mouthpiece-segment",
        label: "Mouthpiece",
        lengthMm: activeMouthpiece.acousticInsertMm,
        startDiameterMm: activeMouthpiece.shankBoreMm,
        endDiameterMm: firstBore,
      },
      ...segments,
    ];
  }, [activeMouthpiece.acousticInsertMm, activeMouthpiece.shankBoreMm, segments]);

  const offsetHoles = useMemo<ToneHole[]>(
    () =>
      holes.map((hole) => ({
        ...hole,
        positionMm: hole.positionMm + activeMouthpiece.acousticInsertMm,
      })),
    [holes, activeMouthpiece.acousticInsertMm]
  );

  const totalLengthMm = useMemo(() => totalBoreLengthMm(acousticSegments), [acousticSegments]);
  const cMs = useMemo(() => speedOfSoundMs(tempC), [tempC]);
  const results = useMemo(
    () => evaluateToneHoles(acousticSegments, offsetHoles, tempC, pitchStandardHz),
    [acousticSegments, offsetHoles, tempC, pitchStandardHz]
  );
  const warnings = useMemo(
    () => spacingWarnings(offsetHoles, acousticSegments),
    [offsetHoles, acousticSegments]
  );
  const fingeringResults = useMemo(
    () =>
      evaluateFingerings(
        acousticSegments,
        offsetHoles,
        fingerings,
        tempC,
        toleranceCents,
        pitchStandardHz
      ),
    [acousticSegments, offsetHoles, fingerings, tempC, toleranceCents, pitchStandardHz]
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
    const height = 300;
    const marginX = 24;
    const centerY = height / 2;
    const maxRadius =
      Math.max(...profilePoints.map((point) => point.diameterMm * 0.5), 8) * 1.15;
    const usableHalfHeight = 108;

    const xToSvg = (xMm: number): number => {
      if (totalLengthMm <= 0) {
        return marginX;
      }
      return marginX + (xMm / totalLengthMm) * (width - marginX * 2);
    };

    const rToSvg = (radiusMm: number): number =>
      (Math.max(radiusMm, 0) / maxRadius) * usableHalfHeight;

    const top = profilePoints.map((point) => {
      const x = xToSvg(point.xMm);
      const y = centerY - rToSvg(point.diameterMm * 0.5);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    });
    const bottom = [...profilePoints]
      .reverse()
      .map((point) => {
        const x = xToSvg(point.xMm);
        const y = centerY + rToSvg(point.diameterMm * 0.5);
        return `${x.toFixed(2)},${y.toFixed(2)}`;
      });

    const polygon = `${top.join(" ")} ${bottom.join(" ")}`;
    const holesOnBore = [...offsetHoles].sort((a, b) => a.positionMm - b.positionMm);

    return {
      width,
      height,
      centerY,
      polygon,
      holesOnBore,
      xToSvg,
      rToSvg,
    };
  }, [offsetHoles, profilePoints, totalLengthMm]);

  function applyMouthpiecePreset(presetId: string): void {
    const preset = mouthpiecePresets.find((candidate) => candidate.id === presetId);
    if (!preset) {
      return;
    }
    setActiveMouthpiece(preset);
  }

  async function handleCsvFileChange(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const text = await file.text();
    const preview = parseDennerStyleCsv(text, importDiameterMode, importDefaultChimneyMm);
    setImportFileName(file.name);
    setImportPreview(preview);
  }

  function applyImportedData(mode: "replace" | "append"): void {
    if (!importPreview) {
      return;
    }

    const importedSegments: BoreSegment[] = importPreview.segments.map((segment) => ({
      id: makeId("seg"),
      label: segment.label,
      lengthMm: segment.lengthMm,
      startDiameterMm: segment.startDiameterMm,
      endDiameterMm: segment.endDiameterMm,
    }));

    const importedHoles: ToneHole[] = importPreview.holes.map((hole) => ({
      id: makeId("hole"),
      label: hole.label,
      positionMm: hole.positionMm,
      diameterMm: hole.diameterMm,
      chimneyMm: hole.chimneyMm,
      targetNote: "",
    }));

    if (mode === "replace") {
      if (importedSegments.length > 0) {
        setSegments(importedSegments);
      }
      setHoles(importedHoles);
      setFingerings([]);
      if (importPreview.instrument) {
        setName(importPreview.instrument);
      }
      return;
    }

    if (importedSegments.length > 0) {
      setSegments((prev) => [...prev, ...importedSegments]);
    }
    setHoles((prev) => [...prev, ...importedHoles]);
  }

  function updateSegment(
    id: string,
    key: "lengthMm" | "startDiameterMm" | "endDiameterMm",
    value: number
  ): void {
    setSegments((prev) =>
      prev.map((s) => (s.id === id ? { ...s, [key]: Number.isFinite(value) ? value : 0 } : s))
    );
  }

  function updateSegmentLabel(id: string, value: string): void {
    setSegments((prev) =>
      prev.map((segment) =>
        segment.id === id ? { ...segment, label: value } : segment
      )
    );
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
      prev.map((f) => (f.id === id ? { ...f, [key]: value as never } : f))
    );
  }

  return (
    <div className="page-shell">
      <header className="hero">
        <div>
          <p className="kicker">Clarinet Air Column Designer</p>
          <h1>Clarinet Bore Lab</h1>
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

            <label>
              Data sheet import mode
              <select
                value={importDiameterMode}
                onChange={(e) => setImportDiameterMode(e.target.value as CsvImportDiameterMode)}
              >
                <option value="avg">Inside diameter = average(min, max)</option>
                <option value="min">Inside diameter = min</option>
                <option value="max">Inside diameter = max</option>
              </select>
            </label>

            <label>
              Imported hole chimney default (mm)
              <input
                type="number"
                value={importDefaultChimneyMm}
                onChange={(e) => setImportDefaultChimneyMm(Number(e.target.value))}
              />
            </label>

            <label>
              Import Denner-style CSV
              <input type="file" accept=".csv,text/csv" onChange={handleCsvFileChange} />
            </label>

            {importPreview && (
              <div>
                <p className="math">
                  Imported {importFileName}: {importPreview.segments.length} segments, {" "}
                  {importPreview.holes.length} holes.
                </p>
                <p className="math">
                  Source: {importPreview.instrument}
                  {importPreview.catalogNumber ? ` | ${importPreview.catalogNumber}` : ""}
                </p>
                {importPreview.warnings.length > 0 && (
                  <div className="warnings">
                    <h3>Import warnings ({importPreview.warnings.length})</h3>
                    <ul>
                      {importPreview.warnings.slice(0, 6).map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="badge-row">
                  <button type="button" onClick={() => applyImportedData("replace")}>
                    Replace with imported data
                  </button>
                  <button type="button" onClick={() => applyImportedData("append")}>
                    Append imported data
                  </button>
                </div>
              </div>
            )}

          <button type="button" onClick={() => applyMouthpiecePreset(selectedMouthpieceId)}>
            Apply mouthpiece preset
          </button>
          <p className="math">
            Active: {activeMouthpiece.label} ({activeMouthpiece.instrument}), tip opening{" "}
            {activeMouthpiece.openingMm.toFixed(3)} mm ({activeMouthpiece.openingHundredthMm} x
            1/100 mm), facing {activeMouthpiece.facingLength}. Acoustic insert ={" "}
            {activeMouthpiece.acousticInsertMm.toFixed(1)} mm.
          </p>
          <div className="stat-row">
            <div>
              <span>Total length</span>
              <strong>{totalLengthMm.toFixed(1)} mm</strong>
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
            <h2>Bore Profile Segments</h2>
            <button
              type="button"
              onClick={() =>
                setSegments((prev) => [
                  ...prev,
                  {
                    id: makeId("seg"),
                    label: `Segment ${prev.length + 1}`,
                    lengthMm: 120,
                    startDiameterMm: 14.8,
                    endDiameterMm: 15,
                  },
                ])
              }
            >
              Add segment
            </button>
          </div>

          <table>
            <thead>
              <tr>
                <th>Segment</th>
                <th>Length (mm)</th>
                <th>Start dia (mm)</th>
                <th>End dia (mm)</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {segments.map((segment, index) => (
                <tr key={segment.id}>
                  <td>
                    <input
                      value={segment.label}
                      placeholder={`S${index + 1}`}
                      onChange={(e) => updateSegmentLabel(segment.id, e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      value={segment.lengthMm}
                      onChange={(e) =>
                        updateSegment(segment.id, "lengthMm", Number(e.target.value))
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      value={segment.startDiameterMm}
                      onChange={(e) =>
                        updateSegment(segment.id, "startDiameterMm", Number(e.target.value))
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      value={segment.endDiameterMm}
                      onChange={(e) =>
                        updateSegment(segment.id, "endDiameterMm", Number(e.target.value))
                      }
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      className="danger"
                      onClick={() =>
                        setSegments((prev) => prev.filter((candidate) => candidate.id !== segment.id))
                      }
                      disabled={segments.length <= 1}
                    >
                      Remove
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
                    positionMm: Math.max(180, prev.length * 36 + 180),
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

          <table>
            <thead>
              <tr>
                <th>Label</th>
                <th>Position (mm)</th>
                <th>Dia (mm)</th>
                <th>Chimney (mm)</th>
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
                      value={hole.positionMm}
                      onChange={(e) => updateHole(hole.id, "positionMm", Number(e.target.value))}
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
            from mouthpiece.
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

              <polygon points={boreSvg.polygon} className="bore-shape" />

              {boreSvg.holesOnBore.map((hole) => {
                const x = boreSvg.xToSvg(hole.positionMm);
                const localRadius = boreSvg.rToSvg(hole.diameterMm * 0.5);
                return (
                  <g key={hole.id}>
                    <line
                      x1={x}
                      y1={boreSvg.centerY - localRadius - 4}
                      x2={x}
                      y2={boreSvg.centerY - localRadius - 24}
                      className="hole-stem"
                    />
                    <circle
                      cx={x}
                      cy={boreSvg.centerY - localRadius - 28}
                      r="5"
                      className="hole-dot"
                    />
                    <text x={x} y={boreSvg.centerY - localRadius - 36} className="hole-label">
                      {hole.label}
                    </text>
                  </g>
                );
              })}

              <text x="24" y={boreSvg.height - 10} className="axis-label">
                0 mm (reed tip)
              </text>
              <text x={boreSvg.width - 24} y={boreSvg.height - 10} className="axis-label axis-right">
                {totalLengthMm.toFixed(1)} mm (bell end)
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

          <table>
            <thead>
              <tr>
                <th>Hole</th>
                <th>Position</th>
                <th>Local bore</th>
                <th>L_eff</th>
                <th>f1</th>
                <th>f3</th>
                <th>Nearest</th>
                <th>Target cents</th>
                <th>Recommendation</th>
              </tr>
            </thead>
            <tbody>
              {results.map((result) => (
                <tr key={result.id}>
                  <td>{result.label}</td>
                  <td>{result.positionMm.toFixed(1)} mm</td>
                  <td>{result.localBoreMm.toFixed(2)} mm</td>
                  <td>{result.effectiveLengthMm.toFixed(2)} mm</td>
                  <td>{result.predictedFundamentalHz.toFixed(2)} Hz</td>
                  <td>{result.predictedThirdHz.toFixed(2)} Hz</td>
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
                            {hole.label} @ {hole.positionMm.toFixed(1)} mm
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
