import { useMemo, useState } from "react";

type Harmonic = 1 | 3 | 5;

const MM_PER_M = 1000;

function speedOfSound(tempC: number) {
  return 331.3 + 0.606 * tempC;
}

function nearestNote(freqHz: number) {
  if (freqHz <= 0 || !Number.isFinite(freqHz)) {
    return { note: "-", cents: 0 };
  }

  const midi = Math.round(69 + 12 * Math.log2(freqHz / 440));
  const exactHz = 440 * Math.pow(2, (midi - 69) / 12);
  const cents = 1200 * Math.log2(freqHz / exactHz);
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const name = names[(midi + 1200) % 12];
  const octave = Math.floor(midi / 12) - 1;

  return {
    note: `${name}${octave}`,
    cents,
  };
}

export default function App() {
  const [temperatureC, setTemperatureC] = useState(20);
  const [tubeLengthMm, setTubeLengthMm] = useState(340);
  const [insideDiameterMm, setInsideDiameterMm] = useState(14.8);
  const [harmonic, setHarmonic] = useState<Harmonic>(1);
  const [targetHz, setTargetHz] = useState(293.66);

  const airSpeed = useMemo(() => speedOfSound(temperatureC), [temperatureC]);
  const radiusM = insideDiameterMm / MM_PER_M / 2;
  const endCorrectionM = 0.6 * radiusM;

  const frequencyModel = useMemo(() => {
    const physicalM = tubeLengthMm / MM_PER_M;
    const effectiveM = physicalM + endCorrectionM;
    const f1 = airSpeed / (4 * effectiveM);
    const harmonicHz = f1 * harmonic;
    const note = nearestNote(harmonicHz);

    return {
      physicalM,
      effectiveM,
      f1,
      harmonicHz,
      note,
    };
  }, [airSpeed, endCorrectionM, harmonic, tubeLengthMm]);

  const targetModel = useMemo(() => {
    const oddIndex = harmonic;
    const effectiveLengthM = (oddIndex * airSpeed) / (4 * targetHz);
    const physicalLengthM = Math.max(effectiveLengthM - endCorrectionM, 0);
    const note = nearestNote(targetHz);

    return {
      effectiveLengthM,
      physicalLengthM,
      note,
    };
  }, [airSpeed, endCorrectionM, harmonic, targetHz]);

  return (
    <div className="page">
      <div className="glow glow-a" />
      <div className="glow glow-b" />
      <main className="shell">
        <header className="hero">
          <p className="eyebrow">Tube Physics</p>
          <h1>Tube Physics Lab</h1>
          <p>
            Quick first-order closed-open air-column checks for resonance and tube sizing.
            Tune dimensions before deeper simulation.
          </p>
        </header>

        <section className="card controls">
          <label>
            Air Temperature (C)
            <input
              type="number"
              value={temperatureC}
              step={0.5}
              onChange={(e) => setTemperatureC(Number(e.target.value))}
            />
          </label>

          <label>
            Inner Diameter (mm)
            <input
              type="number"
              value={insideDiameterMm}
              step={0.1}
              min={0.1}
              onChange={(e) => setInsideDiameterMm(Number(e.target.value))}
            />
          </label>

          <label>
            Harmonic
            <select
              value={harmonic}
              onChange={(e) => setHarmonic(Number(e.target.value) as Harmonic)}
            >
              <option value={1}>1st (fundamental)</option>
              <option value={3}>3rd</option>
              <option value={5}>5th</option>
            </select>
          </label>
        </section>

        <section className="grid">
          <article className="card">
            <h2>From Tube Length</h2>
            <label>
              Physical Tube Length (mm)
              <input
                type="number"
                value={tubeLengthMm}
                min={1}
                step={1}
                onChange={(e) => setTubeLengthMm(Number(e.target.value))}
              />
            </label>

            <dl>
              <div>
                <dt>Speed of sound</dt>
                <dd>{airSpeed.toFixed(2)} m/s</dd>
              </div>
              <div>
                <dt>End correction</dt>
                <dd>{(endCorrectionM * MM_PER_M).toFixed(2)} mm</dd>
              </div>
              <div>
                <dt>Effective length</dt>
                <dd>{(frequencyModel.effectiveM * MM_PER_M).toFixed(2)} mm</dd>
              </div>
              <div>
                <dt>{harmonic} harmonic frequency</dt>
                <dd>{frequencyModel.harmonicHz.toFixed(2)} Hz</dd>
              </div>
              <div>
                <dt>Nearest equal-tempered note</dt>
                <dd>
                  {frequencyModel.note.note} ({frequencyModel.note.cents >= 0 ? "+" : ""}
                  {frequencyModel.note.cents.toFixed(1)} cents)
                </dd>
              </div>
            </dl>
          </article>

          <article className="card">
            <h2>From Target Pitch</h2>
            <label>
              Target Frequency (Hz)
              <input
                type="number"
                value={targetHz}
                min={1}
                step={0.01}
                onChange={(e) => setTargetHz(Number(e.target.value))}
              />
            </label>

            <dl>
              <div>
                <dt>Nearest note</dt>
                <dd>
                  {targetModel.note.note} ({targetModel.note.cents >= 0 ? "+" : ""}
                  {targetModel.note.cents.toFixed(1)} cents)
                </dd>
              </div>
              <div>
                <dt>Required effective length</dt>
                <dd>{(targetModel.effectiveLengthM * MM_PER_M).toFixed(2)} mm</dd>
              </div>
              <div>
                <dt>Estimated physical length</dt>
                <dd>{(targetModel.physicalLengthM * MM_PER_M).toFixed(2)} mm</dd>
              </div>
            </dl>
          </article>
        </section>
      </main>
    </div>
  );
}
