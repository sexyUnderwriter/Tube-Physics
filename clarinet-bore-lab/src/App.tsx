import { ChangeEvent, useMemo, useRef, useState } from "react";
import {
  BoreSegment,
  Fingering,
  ToneHole,
  midiToName,
  parseScientificPitch,
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
    diameterMm: 2.2,
    chimneyMm: 2.8,
    targetNote: "B4",
  },
  {
    id: makeId("hole"),
    label: "Thumb",
    zMm: 430,
    diameterMm: 8.2,
    chimneyMm: 3.1,
    targetNote: "G4",
  },
  {
    id: makeId("hole"),
    label: "Front A",
    zMm: 444,
    diameterMm: 4.0,
    chimneyMm: 2.3,
    targetNote: "A4",
  },
  {
    id: makeId("hole"),
    label: "Finger 1",
    zMm: 404,
    diameterMm: 7.8,
    chimneyMm: 3.0,
    targetNote: "A4",
  },
  {
    id: makeId("hole"),
    label: "Finger 2",
    zMm: 376,
    diameterMm: 8.0,
    chimneyMm: 3.0,
    targetNote: "G#4",
  },
  {
    id: makeId("hole"),
    label: "Finger 3",
    zMm: 348,
    diameterMm: 8.1,
    chimneyMm: 3.0,
    targetNote: "G4",
  },
  {
    id: makeId("hole"),
    label: "Finger 4",
    zMm: 316,
    diameterMm: 8.3,
    chimneyMm: 3.0,
    targetNote: "F#4",
  },
  {
    id: makeId("hole"),
    label: "Finger 5",
    zMm: 282,
    diameterMm: 8.4,
    chimneyMm: 3.0,
    targetNote: "F4",
  },
  {
    id: makeId("hole"),
    label: "Finger 6",
    zMm: 246,
    diameterMm: 8.4,
    chimneyMm: 3.0,
    targetNote: "E4",
  },
  {
    id: makeId("hole"),
    label: "Finger 7",
    zMm: 208,
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
  holes: ToneHole[];
  fingerings: Fingering[];
};

type LegacyToneHole = Omit<ToneHole, "zMm"> & { positionMm: number };
type SnapshotV1 = Omit<DesignSnapshot, "holes"> & { holes: Array<ToneHole | LegacyToneHole> };

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

    const baseLengthMm = Math.max(
      0,
      ...parsed.segments.map((segment) => Math.max(segment.zMm, 0))
    );

    const normalizedHoles: ToneHole[] = parsed.holes.map((hole) => {
      if ("zMm" in hole && Number.isFinite(hole.zMm)) {
        return {
          id: hole.id,
          label: hole.label,
          zMm: hole.zMm,
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
          diameterMm: hole.diameterMm,
          chimneyMm: hole.chimneyMm,
          targetNote: hole.targetNote,
        };
      }
      return {
        id: hole.id,
        label: hole.label,
        zMm: 0,
        diameterMm: hole.diameterMm,
        chimneyMm: hole.chimneyMm,
        targetNote: hole.targetNote,
      };
    });

    return {
      ...parsed,
      holes: normalizedHoles,
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
  const [selectedMouthpieceId, setSelectedMouthpieceId] = useState(mouthpiecePresets[1].id);
  const [activeMouthpiece, setActiveMouthpiece] = useState<MouthpiecePreset>(
    mouthpiecePresets[1]
  );
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [loadStatus, setLoadStatus] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const acousticSegments = useMemo<BoreSegment[]>(() => {
    const baseLength = totalBoreLengthMm(segments);
    return [
      ...segments,
      {
        id: "mouthpiece-point",
        label: "Mouthpiece",
        zMm: baseLength + activeMouthpiece.acousticInsertMm,
        diameterMm: activeMouthpiece.shankBoreMm,
      },
    ];
  }, [activeMouthpiece.acousticInsertMm, activeMouthpiece.shankBoreMm, segments]);

  const totalLengthMm = useMemo(() => totalBoreLengthMm(acousticSegments), [acousticSegments]);
  const cMs = useMemo(() => speedOfSoundMs(tempC), [tempC]);
  const results = useMemo(
    () => evaluateToneHoles(acousticSegments, holes, tempC, pitchStandardHz),
    [acousticSegments, holes, tempC, pitchStandardHz]
  );
  const warnings = useMemo(
    () => spacingWarnings(holes, acousticSegments),
    [holes, acousticSegments]
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
    const height = 300;
    const marginX = 24;
    const centerY = height / 2;
    const maxRadius =
      Math.max(...profilePoints.map((point) => point.diameterMm * 0.5), 8) * 1.15;
    const usableHalfHeight = 108;

    const zToSvg = (zMm: number): number => {
      if (totalLengthMm <= 0) {
        return marginX;
      }
      return marginX + (zMm / totalLengthMm) * (width - marginX * 2);
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
    const holesOnBore = [...holes].sort((a, b) => a.zMm - b.zMm);

    return {
      width,
      height,
      centerY,
      polygon,
      holesOnBore,
      zToSvg,
      rToSvg,
    };
  }, [holes, profilePoints, totalLengthMm]);

  function applySnapshot(saved: DesignSnapshot): void {
    setName(saved.name);
    setTempC(saved.tempC);
    setPitchStandardHz(saved.pitchStandardHz);
    setToleranceCents(saved.toleranceCents);
    setFirstChalumeauNote(saved.firstChalumeauNote);
    setSegments(saved.segments);
    setHoles(saved.holes);
    setFingerings(saved.fingerings);

    const preset = mouthpiecePresets.find((candidate) => candidate.id === saved.selectedMouthpieceId);
    if (preset) {
      setSelectedMouthpieceId(preset.id);
      setActiveMouthpiece(preset);
    }
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
      holes,
      fingerings,
    };
  }

  function applyMouthpiecePreset(presetId: string): void {
    const preset = mouthpiecePresets.find((candidate) => candidate.id === presetId);
    if (!preset) {
      return;
    }
    setActiveMouthpiece(preset);
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

      updatedTargets.set(hole.id, chalumeauNote);

      generatedFingerings.push({
        id: makeId("fing"),
        label: `Chalumeau ${chalumeauNote}`,
        targetNote: chalumeauNote,
        ventHoleId: hole.id,
        register: "fundamental",
      });

      generatedFingerings.push({
        id: makeId("fing"),
        label: `Clarion ${clarionNote}`,
        targetNote: clarionNote,
        ventHoleId: hole.id,
        register: "third",
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
                <th>z (mm)</th>
                <th>Diameter (mm)</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {segments.map((segment, index) => (
                <tr key={segment.id}>
                  <td>
                    <input
                      value={segment.label}
                      placeholder={`P${index + 1}`}
                      onChange={(e) => updateSegmentLabel(segment.id, e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      value={segment.zMm}
                      onChange={(e) =>
                        updateSegment(segment.id, "zMm", Number(e.target.value))
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      value={segment.diameterMm}
                      onChange={(e) =>
                        updateSegment(segment.id, "diameterMm", Number(e.target.value))
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
                    zMm: Math.max(180, prev.length * 36 + 180),
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
                <th>z (mm)</th>
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
                      value={hole.zMm}
                      onChange={(e) => updateHole(hole.id, "zMm", Number(e.target.value))}
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

              <polygon points={boreSvg.polygon} className="bore-shape" />

              {boreSvg.holesOnBore.map((hole) => {
                const x = boreSvg.zToSvg(Math.max(hole.zMm, 0));
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
                0 mm (bell end)
              </text>
              <text x={boreSvg.width - 24} y={boreSvg.height - 10} className="axis-label axis-right">
                {totalLengthMm.toFixed(1)} mm (mouthpiece side)
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
                <th>z</th>
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
                  <td>{result.zMm.toFixed(1)} mm</td>
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
