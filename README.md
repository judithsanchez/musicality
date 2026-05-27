# Salsa Rhythm Learning Hub

An interactive, serverless ear-training tool and rhythm game designed for Salsa and Bachata dancers, hosted on GitHub Pages.

---

## ⚠️ CRITICAL DEVELOPER & AI DIRECTIVES (STRICT ENFORCEMENT)

### 1. Package Management & Locking Rules
* **Exclusively `pnpm`**: We use `pnpm` exclusively for managing package dependencies.
* **Strict Version Locking**: Version ranges are strictly fixed. Auto-updates of packages are **strictly forbidden** under any circumstance.
* **Explicit Upgrade/Add Commands Only**: Under no circumstance should `pnpm install`, `pnpm run dev`, `pnpm run build`, or `pnpm run test` automatically update any package. Any addition, upgrade, or version change of dependencies must be done through an **explicit, manual, and separate command** (e.g. `pnpm add [package]@[exact-version]`).
* **Do not use npm or yarn**.

### 2. Development Workflow Rules
* **TDD (Test-Driven Development)**: All core logic (sync math, scoring engines, combo calculations) must be built and validated via Test-Driven Development (TDD) using **Vitest**.
* **Feature Branching**: Do all work on clean feature branches (`git checkout -b feature/name`) and merge through Pull Requests.
* **Documentation Rule**: AI agents (including Antigravity, Codex, etc.) are strictly prohibited from touching or editing documentation files (`README.md`, `salsa_rhythm_prd_mvp.md`) during the step-by-step feature coding loop. Documentation files are ONLY allowed to be modified or expanded at the very end of a fully completed and tested task before a final commit is prepared, or when explicitly requested by the user.
* **Git Hygiene**: Keep `*.json` test maps or Rekordbox XML dumps uncommitted. Verify they are caught by `.gitignore`.

---

## Technical Stack
* **Frontend**: React + Vite (Javascript template) + Vanilla CSS (variables, keyframe animations, glassmorphism)
* **Hosting**: GitHub Pages
* **Sync Engine**: Internal dead-reckoning stopwatch hook (`useSyncEngine.js`) synced to the YouTube IFrame API
* **Analysis Pipeline**: Python 3.12 (`librosa`, `aubio`, `madmom`) for beat-mapping research and percussion stem isolation

---

## Commands

### Setup
```bash
pnpm install
```

### Run Locally (Dev Server)
```bash
pnpm dev
```

### Build Production Bundle
```bash
pnpm build
```

### Run Unit Tests
```bash
pnpm test
```
