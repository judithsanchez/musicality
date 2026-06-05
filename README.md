# Salsa Rhythm Learning Hub

An interactive, serverless ear-training tool and rhythm game designed for Salsa and Bachata dancers, hosted on GitHub Pages.

---

## ⚠️ CRITICAL DEVELOPER & AI DIRECTIVES (STRICT ENFORCEMENT)

### 1. Package Management & Locking Rules
* **Exclusively `pnpm`**: We use `pnpm` exclusively for managing package dependencies.
* **Strict Version Locking**: Version ranges are strictly fixed. Auto-updates of packages are **strictly forbidden** under any circumstance.
* **Explicit Upgrade/Add Commands Only**: Under no circumstance should `pnpm install`, `pnpm run dev`, `pnpm run build`, or `pnpm run test` automatically update any package. Any addition, upgrade, or version change of dependencies must be done through an **explicit, manual, and separate command** (e.g. `pnpm add [package]@[exact-version]`).
* **Human Approval Before Package Mutation**: AI agents must stop and notify the user before running dependency installs, package-manager commands, dev-server commands, or build/test commands that may download packages, rewrite `pnpm-lock.yaml`, modify `package.json`, mutate `node_modules`, or otherwise change dependency state. Agents must provide the exact command for the user to run or explicitly approve.
* **Do not use npm or yarn**.
