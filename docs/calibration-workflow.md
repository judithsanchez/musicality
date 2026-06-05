# Calibration Workflow & Schema Mapping Design

This document details the design and rationale behind the 5-phase Calibration Workflow. It explains why each phase is musically and technically necessary, and how it maps to our TypeScript schemas.

---

## Phase 1: Machine Ingestion (The Foundation)
### What Happens
When a new audio/video track is imported, the system runs source separation (isolating Conga, Bass, and Percussion stems) and beat detection algorithms.

### Rationale
- **Flexible Ruler**: Live recordings and acoustic bands suffer from natural tempo drift. We cannot rely on a constant grid. The ingestion process builds an absolute beat-map array (`absoluteBeatMap: number[]`) containing the exact milliseconds of every single beat. This serves as our flexible timeline ruler.
- **Unbiased Initial State**: At this stage, the ingestion algorithm is not allowed to guess the Salsa Clave direction. The song map is initialized with `defaultClave: 'NOT_SET'` to ensure we do not store unverified assumptions.

---

## Phase 2: Macro Sectioning (The Slicer / The Containers)
### What Happens
The developer slices the song timeline into contiguous blocks (markers) representing sections like Intro, Verse, Chorus, Montuno, or Mambo.

### Rationale
- **Structural Firewalls**: Enforcing that sections are strictly contiguous (no gaps, no overlaps, starting at 0, ending at the last beat) ensures that we have a mathematical partition of the track. These act as "firewalls." Calibrating or shifting timing grids in one section will never leak or cascade into neighboring sections, isolating Breaks and phase shifts.
- **Local Scope**: By containing phrases inside sections (`phraseIds: string[]`), the sync engine can limit its math calculations to the active section boundary, reducing browser processing overhead.

---

## Phase 3: The "Tapping the 1s" Calibration (The Auto-Clave Inferrer)
### What Happens
The developer taps on the downbeat ("1" count of an 8-count phrase) while listening to isolated instrument stems (Metronome and beat-pulses are hidden/muted to ensure pure listening).

### Rationale
- **Delay Compensation**: Human reaction times introduce latency. The calibrator subtracts a configurable reaction delay (default 200ms) to ensure tapped timestamps reflect the true downbeat.
- **Anchor Snapping**: The corrected timestamp snaps to the nearest machine-detected beat. The phrase boundaries are calculated based on the indices of the absolute beat-map (e.g. 8 beats later for a standard Salsa phrase).
- **Auto-Clave Inference**: The backend compares isolated conga/bass stem energy peaks against template patterns to auto-determine if the phrase is `2-3` or `3-2`.
- **Human-in-the-Loop Override**: While auto-inference is highly accurate, syncopations and complex breaks can fool algorithms. The schema explicitly models `claveIsVerified` and `claveSource: 'MANUAL' | 'AI'` to allow manual overrides for edge cases.

---

## Phase 4: Micro-Events Annotation (The Styling & Accents)
### What Happens
The developer marks individual hit timestamps or durational blocks representing accents, fill-ins, vocal cues, or build-ups.

### Rationale
- **Instant vs. Sustained Visuals**:
  - **Hit Events** (like a brass stab or cowbell hit) are point-in-time and use `timestampMs`.
  - **Sustained Events** (like a drum roll or brass crescendo) utilize `durationMs` to allow the UI to render an escalating energy block, giving dancers visual anticipation cues.
- **UI Highlights**: The boolean `uiHighlight` flag allows the UI to decide which micro-events should trigger high-priority animations on the dance visualizer.

---

## Phase 5: Micro-Adjustments & Edge Cases (The Override)
### What Happens
The developer reviews generated phrases and performs overrides on irregular bars or drift areas.

### Rationale
- **The "Cruzado" (4-Count Override)**: Salsa is occasionally played with irregular 4-count breaks to realign the dancers. The schema supports `type: 'HALF_PHRASE_4_COUNT'`, allowing the phrase container to dynamically shrink without breaking timeline contiguity.
- **Drift Correction Override**: If the machine-ingested beat-map drifts due to audio noise, the developer can nudge individual beats, which are persisted in the optional `calibratedBeats: Beat[]` array for that phrase, taking precedence over the global beat-map.
