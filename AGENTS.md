# Notes for agents

- The whole app is a single static `index.html` (Portuguese, SESI-SP "Terrário Virtual"). No build step, no package.json.
- Served in dev by Browsersync (`docker-compose.base44.yml`) on port 3000 with live reload on `index.html`.
- Firebase (Firestore, compat SDK v9.22 via CDN) is optional: `FIREBASE_CONFIG` in `index.html` still has `COLE_AQUI_*` placeholders, so the app runs in in-memory fallback mode and shows an orange banner. Filling real config values enables persistence — those are user-owned credentials, don't invent them.
- Verify: load `/`, the class/team screens render and the fallback banner is visible.
