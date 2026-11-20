# Frankenstein Rally Planner

A local-first rally planning dashboard for the Frankenstein event in Dark War: Survival.

## Run locally

```bash
npm install
npm run dev
```

Open the URL printed by Vite. Data is stored in the browser with IndexedDB.

## Verify

```bash
npm test
npm run build
```

## GitHub Pages

Push the project to a GitHub repository using `main` as the default branch, then set **Settings → Pages → Source** to **GitHub Actions**. The included workflow tests, builds, and deploys the app automatically. Vite uses relative asset paths, so project Pages URLs work without a repository-specific base path.

## Data safety

Use **Data tools → Export JSON** to create a complete backup. CSV export/import is available for roster editing. Formations, troop counts, availability, and rally capacity begin unknown and must be entered before optimization can use a player.
