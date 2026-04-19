import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { predictClosedTubeFundamentalHz, type BoreSegment } from "../src/model";

type CalibrationRow = {
  date: string;
  tubeLengthMm: number;
  tubeIdMm: number;
  tubeOdMm: number;
  mouthpiecePenetrationMm: number;
  measuredFrequencyHz: number;
  tempC: number;
  targetNote: string;
  comments: string;
};

function parseNumber(value: string, fieldName: string, lineNumber: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid ${fieldName} on line ${lineNumber}: '${value}'`);
  }
  return parsed;
}

function parseCsv(input: string): CalibrationRow[] {
  const lines = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length < 2) {
    throw new Error("Calibration CSV has no data rows");
  }

  const header = lines[0].split(",");
  const expected = [
    "date",
    "tube_length_mm",
    "tube_id_mm",
    "tube_od_mm",
    "mouthpiece_penetration_mm",
    "measured_frequency_hz",
    "temp_c",
    "target_note",
    "comments",
  ];

  if (header.length !== expected.length || !expected.every((k, i) => header[i] === k)) {
    throw new Error(`Unexpected header. Expected: ${expected.join(",")}`);
  }

  return lines.slice(1).map((line, idx) => {
    const lineNumber = idx + 2;
    const parts = line.split(",");
    if (parts.length !== expected.length) {
      throw new Error(`Invalid column count on line ${lineNumber}: got ${parts.length}`);
    }

    const [date, tubeLengthMm, tubeIdMm, tubeOdMm, penetrationMm, measuredHz, tempC, targetNote, comments] = parts;

    return {
      date,
      tubeLengthMm: parseNumber(tubeLengthMm, "tube_length_mm", lineNumber),
      tubeIdMm: parseNumber(tubeIdMm, "tube_id_mm", lineNumber),
      tubeOdMm: parseNumber(tubeOdMm, "tube_od_mm", lineNumber),
      mouthpiecePenetrationMm: parseNumber(penetrationMm, "mouthpiece_penetration_mm", lineNumber),
      measuredFrequencyHz: parseNumber(measuredHz, "measured_frequency_hz", lineNumber),
      tempC: parseNumber(tempC, "temp_c", lineNumber),
      targetNote,
      comments,
    };
  });
}

function centsError(actualHz: number, predictedHz: number): number {
  return 1200 * Math.log2(predictedHz / actualHz);
}

function buildClosedTubeSegments(totalLengthMm: number, boreMm: number): BoreSegment[] {
  return [
    { id: "tube-bell", label: "Tube Bell", zMm: 0, diameterMm: boreMm },
    { id: "tube-mouthpiece", label: "Tube Mouthpiece End", zMm: totalLengthMm, diameterMm: boreMm },
  ];
}

function requiredClosedTubeLengthMm(frequencyHz: number, tempC: number): number {
  const cMs = 331.3 + 0.606 * tempC;
  return (cMs * 1000) / (4 * frequencyHz);
}

function predictHzForRow(row: CalibrationRow, acousticAddMm: number): number {
  const modeledLengthMm = row.tubeLengthMm + acousticAddMm;
  const segments = buildClosedTubeSegments(modeledLengthMm, row.tubeIdMm);
  return predictClosedTubeFundamentalHz(segments, row.tempC);
}

function rootMeanSquare(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const meanSquare = values.reduce((sum, value) => sum + value * value, 0) / values.length;
  return Math.sqrt(meanSquare);
}

function fitConstantAcousticAddMm(rows: CalibrationRow[]): number {
  let bestAddMm = 0;
  let bestScore = Number.POSITIVE_INFINITY;

  for (let addMm = 0; addMm <= 200; addMm += 0.01) {
    let score = 0;
    for (const row of rows) {
      const predictedHz = predictHzForRow(row, addMm);
      const cents = centsError(row.measuredFrequencyHz, predictedHz);
      score += cents * cents;
    }
    if (score < bestScore) {
      bestScore = score;
      bestAddMm = addMm;
    }
  }

  return Number(bestAddMm.toFixed(2));
}

function toFixed(value: number, digits: number): string {
  return value.toFixed(digits);
}

function main(): void {
  const cwd = process.cwd();
  const inputPath = resolve(cwd, "mouthpiece-calibration-data.csv");
  const outputPath = resolve(cwd, "mouthpiece-calibration-results.csv");
  const summaryPath = resolve(cwd, "mouthpiece-calibration-fit.json");

  const raw = readFileSync(inputPath, "utf8");
  const rows = parseCsv(raw);
  const fittedAcousticAddMm = fitConstantAcousticAddMm(rows);
  const meanImpliedAcousticAddMm =
    rows.reduce(
      (sum, row) => sum + (requiredClosedTubeLengthMm(row.measuredFrequencyHz, row.tempC) - row.tubeLengthMm),
      0
    ) / rows.length;

  const outputLines = [
    [
      "date",
      "tube_length_mm",
      "tube_id_mm",
      "tube_od_mm",
      "mouthpiece_penetration_mm",
      "modeled_length_raw_mm",
      "modeled_length_fitted_mm",
      "implied_acoustic_add_mm",
      "fitted_acoustic_add_mm",
      "temp_c",
      "actual_hz",
      "predicted_hz_raw",
      "predicted_hz_fitted",
      "delta_hz_raw",
      "delta_hz_fitted",
      "percent_error_raw",
      "percent_error_fitted",
      "cents_error_raw",
      "cents_error_fitted",
      "target_note",
      "comments",
    ].join(","),
  ];

  const rawDeltaHzs: number[] = [];
  const fittedDeltaHzs: number[] = [];
  const rawCentsErrors: number[] = [];
  const fittedCentsErrors: number[] = [];

  for (const row of rows) {
    const modeledLengthRawMm = row.tubeLengthMm;
    const modeledLengthFittedMm = row.tubeLengthMm + fittedAcousticAddMm;
    const impliedAcousticAddMm = requiredClosedTubeLengthMm(row.measuredFrequencyHz, row.tempC) - row.tubeLengthMm;
    const predictedHzRaw = predictHzForRow(row, 0);
    const predictedHzFitted = predictHzForRow(row, fittedAcousticAddMm);
    const deltaHzRaw = predictedHzRaw - row.measuredFrequencyHz;
    const deltaHzFitted = predictedHzFitted - row.measuredFrequencyHz;
    const percentErrorRaw = (deltaHzRaw / row.measuredFrequencyHz) * 100;
    const percentErrorFitted = (deltaHzFitted / row.measuredFrequencyHz) * 100;
    const centsRaw = centsError(row.measuredFrequencyHz, predictedHzRaw);
    const centsFitted = centsError(row.measuredFrequencyHz, predictedHzFitted);

    rawDeltaHzs.push(deltaHzRaw);
    fittedDeltaHzs.push(deltaHzFitted);
    rawCentsErrors.push(centsRaw);
    fittedCentsErrors.push(centsFitted);

    outputLines.push(
      [
        row.date,
        toFixed(row.tubeLengthMm, 3),
        toFixed(row.tubeIdMm, 3),
        toFixed(row.tubeOdMm, 3),
        toFixed(row.mouthpiecePenetrationMm, 3),
        toFixed(modeledLengthRawMm, 3),
        toFixed(modeledLengthFittedMm, 3),
        toFixed(impliedAcousticAddMm, 4),
        toFixed(fittedAcousticAddMm, 4),
        toFixed(row.tempC, 3),
        toFixed(row.measuredFrequencyHz, 4),
        toFixed(predictedHzRaw, 4),
        toFixed(predictedHzFitted, 4),
        toFixed(deltaHzRaw, 4),
        toFixed(deltaHzFitted, 4),
        toFixed(percentErrorRaw, 4),
        toFixed(percentErrorFitted, 4),
        toFixed(centsRaw, 4),
        toFixed(centsFitted, 4),
        row.targetNote,
        row.comments,
      ].join(",")
    );
  }

  writeFileSync(outputPath, `${outputLines.join("\n")}\n`, "utf8");

  const summary = {
    sampleCount: rows.length,
    fittedAcousticAddMm,
    meanImpliedAcousticAddMm: Number(meanImpliedAcousticAddMm.toFixed(4)),
    rmsHzErrorRaw: Number(rootMeanSquare(rawDeltaHzs).toFixed(4)),
    rmsHzErrorFitted: Number(rootMeanSquare(fittedDeltaHzs).toFixed(4)),
    rmsCentsErrorRaw: Number(rootMeanSquare(rawCentsErrors).toFixed(4)),
    rmsCentsErrorFitted: Number(rootMeanSquare(fittedCentsErrors).toFixed(4)),
  };

  writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  console.log(`Wrote ${rows.length} rows to ${outputPath}`);
  console.log(`Fitted acoustic add: ${fittedAcousticAddMm.toFixed(2)} mm`);
}

main();
