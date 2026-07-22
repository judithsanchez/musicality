# Musicality

Static Salsa/Bachata rhythm calibration and practice app, deployed on GitHub Pages.

## Run Locally

Install dependencies once:

```bash
pnpm install
```

Start the dev server:

```bash
pnpm run dev
```

Vite uses port `5173` by default:

```text
http://localhost:5173
```

If `5173` is already busy, Vite automatically uses the next free port, commonly:

```text
http://localhost:5174
```

Use the URL printed by Vite in the terminal for the exact active port.

## Useful Commands

```bash
pnpm run typecheck
pnpm run build
pnpm run lint
```

Production deploys from `main` through GitHub Pages.
