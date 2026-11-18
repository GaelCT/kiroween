// Loads .env.local for scripts. Next.js does this for the app, but tsx doesn't.
// Import this first in any script that needs the AI key.

try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local: the variables may come from the shell instead.
}

export {};
