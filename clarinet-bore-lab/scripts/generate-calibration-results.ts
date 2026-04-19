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

function toFixed(value: number, digits: number): string {
  return value.toFixed(digits);
}

function main(): void {
  const cwd = process.cwd();
  const inputPath = resolve(cwd, "mouthpiece-calibration-data.csv");
  const outputPath = resolve(cwd, "mouthpiece-calibration-results.csv");

  const raw = readFileSync(inputPath, "utf8");
  const rows = parseCsv(raw);

  const outputLines = [
    [
      "date",
      "tube_length_mm",
      "tube_id_mm",
      "tube_od_mm",
      "mouthpiece_penetration_mm",
      "modeled_length_mm",
      "temp_c",
      "actual_hz",
      "predicted_hz",
      "delta_hz",
      "percent_error",
      "cents_error",
      "target_note",
      "comments",
    ].join(","),
  ];

  for (const row of rows) {
    // Tube length from the calibration CSV is treated as the full acoustic tube length.
    // Keep mouthpiece_penetration_mm as metadata only to avoid double-counting.
    const modeledLengthMm = row.tubeLengthMm;
    const segments = buildClosedTubeSegments(modeledLengthMm, row.tubeIdMm);
    const predictedHz = predictClosedTubeFundamentalHz(segments, row.tempC);
    const deltaHz = predictedHz - row.measuredFrequencyHz;
    const percentError = (deltaHz / row.measuredFrequencyHz) * 100;
    const cents = centsError(row.measuredFrequencyHz, predictedHz);

    outputLines.push(
      [
        row.date,
        toFixed(row.tubeLengthMm, 3),
        toFixed(row.tubeIdMm, 3),
        toFixed(row.tubeOdMm, 3),
        toFixed(row.mouthpiecePenetrationMm, 3),
        toFixed(modeledLengthMm, 3),
        toFixed(row.tempC, 3),
        toFixed(row.measuredFrequencyHz, 4),
        toFixed(predictedHz, 4),
        toFixed(deltaHz, 4),
        toFixed(percentError, 4),
        toFixed(cents, 4),
        row.targetNote,
        row.comments,
      ].join(",")
    );
  }

  writeFileSync(outputPath, `${outputLines.join("\n")}\n`, "utf8");
  console.log(`Wrote ${rows.length} rows to ${outputPath}`);
}

main();
