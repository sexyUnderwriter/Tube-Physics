# Clarinet Bore Lab

React + TypeScript UI for experimenting with clarinet bore geometry and evaluating tone-hole placement using a first-order closed-open air-column model.

## What it does

- Accepts user-defined bore profile segments (length, start diameter, end diameter)
- Accepts tone-hole geometry (position, diameter, chimney height, target note)
- Computes local bore diameter at each hole
- Estimates effective acoustic length with vent correction terms
- Predicts quarter-wave fundamental and third harmonic frequencies
- Reports nearest equal-tempered note and cents error
- Suggests tuning direction for each hole
- Flags potentially tight hole spacing
- Adds a fingering table (target note + vent hole + register)
- Evaluates full-scale intonation with configurable pass-band tolerance
- Reports pass rate and mean absolute cents error across fingerings

## Physics model (first-order)

- Speed of sound: c = 331.3 + 0.606T (m/s)
- Fundamental estimate: f1 = c / (4L_eff)
- Third harmonic: f3 = 3f1
- Effective length includes hole branch inertance correction from hole diameter, local bore radius, and chimney height

This is intentionally fast for design iteration, not a full impedance solver.

## Run

1. Install Node.js 18+.
2. Install dependencies:
   npm install
3. Start dev server:
   npm run dev

## Notes

- Inputs are metric (mm, C).
- Use this as a design screen before prototype or detailed impedance modeling.
