import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';
import type { AppConfig } from './config.js';

const testConfig: AppConfig = {
  nodeEnv: 'test',
  port: 4000,
  clientOrigin: 'http://localhost:5173',
  mongoUri: 'mongodb://127.0.0.1:27017/test',
  sessionSecret: 'test-only-session-secret-with-more-than-32-characters',
  uploadDirectory: '/tmp/pagewise-test-uploads',
  maxUploadBytes: 15 * 1024 * 1024,
  maxPdfPages: 300,
  embeddingProvider: 'local-hash',
  chatProvider: 'extractive',
  embeddingBaseUrl: '',
  embeddingApiKey: '',
  embeddingModel: '',
  chatBaseUrl: '',
  chatApiKey: '',
  chatModel: '',
  aiRequestTimeoutMs: 30_000,
  ragTopK: 5,
  ragMaxCandidates: 5_000,
  ragMinScore: 0.08,
};

const app = createApp(testConfig);

describe('API security baseline', () => {
  it('returns a minimal health response without exposing database configuration', async () => {
    const response = await request(app).get('/api/health').expect(200);
    expect(response.body).toEqual({ data: { status: 'ok' } });
    expect(JSON.stringify(response.body)).not.toContain('mongodb');
  });

  it('does not allow unauthenticated document access', async () => {
    const response = await request(app).get('/api/documents').expect(401);
    expect(response.body.error.code).toBe('AUTH_REQUIRED');
  });

  it('rejects unsafe requests from an untrusted origin', async () => {
    const response = await request(app)
      .post('/api/auth/logout')
      .set('Origin', 'https://untrusted.example')
      .expect(403);
    expect(response.body.error.code).toBe('ORIGIN_REJECTED');
  });
});
