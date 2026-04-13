import { useMemo, useState } from "react";
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

function makeId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

const initialSegments: BoreSegment[] = [
  {
    id: makeId("seg"),
    lengthMm: 240,
    startDiameterMm: 14.6,
    endDiameterMm: 14.4,
  },
  {
    id: makeId("seg"),
    lengthMm: 220,
    startDiameterMm: 14.4,
    endDiameterMm: 14.8,
  },
  {
    id: makeId("seg"),
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

export default function App() {
  const [name, setName] = useState("Prototype Clarinet Bore");
  const [tempC, setTempC] = useState(20);
  const [segments, setSegments] = useState<BoreSegment[]>(initialSegments);
  const [holes, setHoles] = useState<ToneHole[]>(initialHoles);
  const [toleranceCents, setToleranceCents] = useState(10);
  const [fingerings, setFingerings] = useState<Fingering[]>(initialFingerings);

  const totalLengthMm = useMemo(() => totalBoreLengthMm(segments), [segments]);
  const cMs = useMemo(() => speedOfSoundMs(tempC), [tempC]);
  const results = useMemo(
    () => evaluateToneHoles(segments, holes, tempC),
    [segments, holes, tempC]
  );
  const warnings = useMemo(() => spacingWarnings(holes, segments), [holes, segments]);
  const fingeringResults = useMemo(
    () => evaluateFingerings(segments, holes, fingerings, tempC, toleranceCents),
    [segments, holes, fingerings, tempC, toleranceCents]
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
  const profilePoints = useMemo(() => sampleBoreProfile(segments, 140), [segments]);
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
    const holesOnBore = [...holes].sort((a, b) => a.positionMm - b.positionMm);

    return {
      width,
      height,
      centerY,
      polygon,
      holesOnBore,
      xToSvg,
      rToSvg,
    };
  }, [holes, profilePoints, totalLengthMm]);

  function updateSegment(
    id: string,
    key: keyof Omit<BoreSegment, "id">,
    value: number
  ): void {
    setSegments((prev) =>
      prev.map((s) => (s.id === id ? { ...s, [key]: Number.isFinite(value) ? value : 0 } : s))
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
                  <td>S{index + 1}</td>
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
                0 mm (mouthpiece end)
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
        </span>
      </footer>
    </div>
  );
}
