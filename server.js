// Entry point for the real portal: pages, login, permissions and persistent data.
import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
import { startServer } from './scripts/server.mjs';

try {
  // Native Node.js loader. Environment variables supplied by hosting take priority.
  const envFile = fileURLToPath(new URL('./.env', import.meta.url));
  if (existsSync(envFile)) loadEnvFile(envFile);
  await startServer();
} catch (error) {
  const message = error.code === 'EADDRINUSE'
    ? 'A porta já está em uso. Defina outra PORT.'
    : error instanceof SyntaxError
      ? 'O arquivo de dados está inválido. Verifique DATA_DIR e restaure um backup válido.'
      : error.message;
  console.error(`Não foi possível iniciar o portal: ${message}`);
  process.exitCode = 1;
}
