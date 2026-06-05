# Database & Validation Engine Design Choices

This document explains the architectural decisions and design choices behind the Salsa Rhythm Learning Hub's database structures, validation rules, and local development ingestion tools.

---

## 1. Static JSON Files vs. Traditional Database
### Decision
The application stores individual beatmaps as static JSON files in `/public/songs/[youtubeId].json`, indexed by a single metadata index file `catalog.json`.

### Why
1. **Serverless Deployment (GitHub Pages)**: The application is designed to be hosted on static CDNs. Storing beatmaps as static files allows the client to fetch only the relevant song map at runtime using standard HTTP request caching, keeping server cost and maintenance to zero.
2. **Catalog Indexing**: Directory scanning is not possible in standard static environments. By maintaining a single `catalog.json` index file containing key metadata (titles, artists, genres, BPM, and default clave), the client can retrieve the entire available catalog in one quick request without loading heavy individual beatmaps.

---

## 2. Polymorphic Zod Schema Model
### Decision
The data schemas use Zod discriminated unions on the `genre` field (e.g. `SALSA` vs `BACHATA`) to validate song maps, sections, and phrases.

### Why
1. **Musical Structural Diversity**: Salsa and Bachata have fundamentally different rhythm patterns and structures.
   - **Salsa** relies on 2-3 or 3-2 Clave rhythms and 8-count phrase structures.
   - **Bachata** relies on dynamic instrument transitions (Derecho, Majao, Mambo) that change step-sync behaviors.
2. **Type Safety & Maintainability**: Representing them under a unified, polymorphic schema ensures that developers cannot mistakenly define Bachata-only attributes in a Salsa map (or vice versa), preventing runtime bugs.

---

## 3. Strict Contiguity Validation Rationale
### Decision
We enforce strict contiguity (first section starts at 0, no gaps, no overlaps, ends at the last beat; phrases fit boundaries precisely) inside a custom Zod `superRefine` validation block.

### Why
1. **Stopwatch Sync Engine Precision**: High-fidelity rhythm learning requires keeping the browser visual updates and tap-scoring engine in absolute sync with the audio stream. The stopwatch engine calculates beat positions based on continuous section boundaries.
2. **Prevention of Rendering Glitches**: Any timing gap or overlap (even by a few milliseconds) between sections or phrases will introduce phase stutters or cause the beat visualizer loops to skip or lose alignment. Validating contiguity at save-time prevents corrupt beatmaps from ever being saved.
3. **Reference Verification**: Ensuring all phrases belong to exactly one section and all section phrase references exist ensures that the frontend can confidently partition the playback timeline.

---

## 4. Development-only Vite API Middleware
### Decision
A local Vite middleware `songDbPlugin` intercepts `POST /api/songs` requests during development to validate, write, and index newly calibrated beatmaps.

### Why
1. **Local Calibration Workflow**: Saving beatmaps only happens when a developer uses the Dev Calibrator tool to adjust downbeat alignments. The production build does not require any write capabilities.
2. **Zero-Backend Footprint**: By hooking into the existing Vite development server via `configureServer`, we avoid running a separate backend database or Node server during local development, keeping the developer onboarding workflow simple and unified.
3. **Strict Validation Gate**: The API runs the same Zod schemas and contiguity checks on the server side. This ensures that any hand-crafted or tool-generated JSON payloads are fully verified before they are committed to the codebase.
