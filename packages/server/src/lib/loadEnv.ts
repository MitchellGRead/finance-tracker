// Loads packages/server/.env into process.env before anything reads config.
// Must be imported first in src/index.ts. Node 24 is pinned, so process.loadEnvFile
// is available; the try/catch keeps a fresh clone (no .env) booting normally.
try {
  process.loadEnvFile();
} catch {
  // No .env file — every setting falls back to its default and AI suggestions stay disabled.
}
