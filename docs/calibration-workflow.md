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

## Phase 3: Micro-Events Annotation
### What Happens
After slicing is complete, the developer marks accents, fills, vocal cues, instrument entries, build-ups, and energy drops.

### Rationale
- **Single Marks**: Short hits and cues use one `timestampMs`.
- **Time Ranges**: Sustained fills and build-ups add `durationMs`.
- **Section Scope**: Events must remain inside the sliced section where they begin.
- **Explicit Completion**: Tapping remains locked until the event pass is saved, including when a song intentionally has no events.

## Phase 4: The "Tapping the 1s" Calibration
### What Happens
The developer taps on the downbeat while listening to the song. The calibrated taps generate phrases without assigning musical section labels.

### Rationale
- **Delay Compensation**: Human reaction time is compensated before storing taps.
- **Phrase Generation**: Consensus downbeats partition the sliced timeline into phrases.
- **Stage Isolation**: Labeling remains locked until the tap pass is saved.

---

## Phase 5: Labeling & Review
### What Happens
The developer assigns section labels, energy states, instruments, and any Salsa clave overrides after timing work is complete.

### Rationale
- **The "Cruzado" (4-Count Override)**: Salsa is occasionally played with irregular 4-count breaks to realign the dancers. The schema supports `type: 'HALF_PHRASE_4_COUNT'`, allowing the phrase container to dynamically shrink without breaking timeline contiguity.
- **Drift Correction Override**: If the machine-ingested beat-map drifts due to audio noise, the developer can nudge individual beats, which are persisted in the optional `calibratedBeats: Beat[]` array for that phrase, taking precedence over the global beat-map.
