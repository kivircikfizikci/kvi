# KVI Dark War: Survival Planner

An expandable, local-first planning and organization suite for Dark War: Survival alliance operations.

## Modules

- **Alliance** — alliance roster, growth comparisons and game-data imports.
- **State** — public player and alliance rankings, with power charts for signed-in members.
- **Rally Planner** — player roster, two-round Frankenstein rally planning, validation and optimization.
- **Battle Map** — captured alliance positions on Game Map and timed Black Gold Battlefield plans for Team A and Team B.
- **Officer Notes** — shared requests and site updates.

New tools are registered in `src/app/moduleRegistry.ts`. Each feature owns its UI and domain logic under `src/features/<module>`, keeping the application shell independent from individual event mechanics.

## Run locally

```bash
npm install
npm run dev
```

Open the URL printed by Vite. The app uses IndexedDB as a browser cache for the shared cloud workspace. R4 and R5 can edit shared data. R1 through R3 have read-only access, and visitors can open the public State rankings.

## Verify

```bash
npm test
npm run build
```

## GitHub Pages

Push the project to a GitHub repository using `main` as the default branch, then set **Settings → Pages → Source** to **GitHub Actions**. The included workflow tests, builds, and deploys the app automatically. Vite uses relative asset paths, so project Pages URLs work without a repository-specific base path.

## Data safety

Keep original game-data JSON captures so they can be imported again from **Alliance → Game data**. These files contain capture data. Back up the shared cloud workspace separately to preserve plans, notes, and map assignments.
