import { mkdir } from 'node:fs/promises';
import { createApp } from './app.js';
import { connectDatabase } from './db.js';
import { loadConfig } from './config.js';

async function start(): Promise<void> {
  const config = loadConfig();
  await mkdir(config.uploadDirectory, { recursive: true });
  await connectDatabase(config.mongoUri);

  const app = createApp(config);
  const server = app.listen(config.port, '0.0.0.0', () => {
    console.info(`API server listening on port ${config.port}`);
  });

  const shutdown = (signal: string) => {
    console.info(`Received ${signal}; shutting down.`);
    server.close(() => {
      void import('mongoose').then(({ default: mongoose }) => mongoose.disconnect())
        .finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

start().catch((error: unknown) => {
  const name = error instanceof Error ? error.name : 'UnknownError';
  if (error instanceof Error && error.message.startsWith('Invalid server configuration:')) {
    console.error('server_configuration_invalid', { message: error.message });
  } else {
    console.error('server_start_failed', { name });
  }
  process.exitCode = 1;
});
