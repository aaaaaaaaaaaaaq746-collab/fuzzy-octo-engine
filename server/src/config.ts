import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

const serverDirectory = path.dirname(fileURLToPath(import.meta.url));
export const projectRoot = path.resolve(serverDirectory, '..', '..');

dotenv.config({ path: process.env.ENV_FILE || path.join(projectRoot, '.env'), quiet: true });

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
  CLIENT_ORIGIN: z.string().url().default('http://localhost:5173'),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must contain at least 32 characters'),
  UPLOAD_DIR: z.string().default('.data/uploads'),
  MAX_UPLOAD_MB: z.coerce.number().int().min(1).max(100).default(15),
  MAX_PDF_PAGES: z.coerce.number().int().min(1).max(2_000).default(300),
  EMBEDDING_PROVIDER: z.enum(['local-hash', 'openai-compatible']).default('local-hash'),
  CHAT_PROVIDER: z.enum(['extractive', 'openai-compatible']).default('extractive'),
  EMBEDDING_BASE_URL: z.string().default(''),
  EMBEDDING_API_KEY: z.string().default(''),
  EMBEDDING_MODEL: z.string().default(''),
  CHAT_BASE_URL: z.string().default(''),
  CHAT_API_KEY: z.string().default(''),
  CHAT_MODEL: z.string().default(''),
  AI_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(120_000).default(30_000),
  RAG_TOP_K: z.coerce.number().int().min(1).max(12).default(5),
  RAG_MAX_CANDIDATES: z.coerce.number().int().min(10).max(50_000).default(5_000),
  RAG_MIN_SCORE: z.coerce.number().min(-1).max(1).default(0.08),
});

export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  clientOrigin: string;
  mongoUri: string;
  sessionSecret: string;
  uploadDirectory: string;
  maxUploadBytes: number;
  maxPdfPages: number;
  embeddingProvider: 'local-hash' | 'openai-compatible';
  chatProvider: 'extractive' | 'openai-compatible';
  embeddingBaseUrl: string;
  embeddingApiKey: string;
  embeddingModel: string;
  chatBaseUrl: string;
  chatApiKey: string;
  chatModel: string;
  aiRequestTimeoutMs: number;
  ragTopK: number;
  ragMaxCandidates: number;
  ragMinScore: number;
}

function validateProviderUrl(value: string, name: string): string {
  if (!value) return '';
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`Invalid server configuration: ${name} must be a valid URL`);
  }
  const hostname = parsed.hostname.replace(/^\[|\]$/g, '');
  if (parsed.protocol !== 'https:' && hostname !== 'localhost' && hostname !== '127.0.0.1' && hostname !== '::1') {
    throw new Error(`Invalid server configuration: ${name} must use HTTPS unless it points to localhost`);
  }
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

function normalizeClientOrigin(value: string): string {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Invalid server configuration: CLIENT_ORIGIN must be an HTTP(S) origin without a path');
  }
  return url.origin;
}

export function loadConfig(): AppConfig {
  const parsed = environmentSchema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
    throw new Error(`Invalid server configuration: ${details}`);
  }

  const env = parsed.data;
  if (env.SESSION_SECRET.startsWith('replace-')) {
    throw new Error('Invalid server configuration: replace SESSION_SECRET with a private random value');
  }
  if (env.EMBEDDING_PROVIDER === 'openai-compatible' && (!env.EMBEDDING_BASE_URL || !env.EMBEDDING_MODEL)) {
    throw new Error('Invalid server configuration: openai-compatible embeddings require EMBEDDING_BASE_URL and EMBEDDING_MODEL');
  }
  if (env.CHAT_PROVIDER === 'openai-compatible' && (!env.CHAT_BASE_URL || !env.CHAT_MODEL)) {
    throw new Error('Invalid server configuration: openai-compatible chat requires CHAT_BASE_URL and CHAT_MODEL');
  }
  const clientOrigin = normalizeClientOrigin(env.CLIENT_ORIGIN);
  if (env.NODE_ENV === 'production' && !clientOrigin.startsWith('https://')) {
    throw new Error('Invalid server configuration: production CLIENT_ORIGIN must use HTTPS');
  }

  return {
    nodeEnv: env.NODE_ENV,
    port: env.PORT,
    clientOrigin,
    mongoUri: env.MONGODB_URI,
    sessionSecret: env.SESSION_SECRET,
    uploadDirectory: path.resolve(projectRoot, env.UPLOAD_DIR),
    maxUploadBytes: env.MAX_UPLOAD_MB * 1024 * 1024,
    maxPdfPages: env.MAX_PDF_PAGES,
    embeddingProvider: env.EMBEDDING_PROVIDER,
    chatProvider: env.CHAT_PROVIDER,
    embeddingBaseUrl: validateProviderUrl(env.EMBEDDING_BASE_URL, 'EMBEDDING_BASE_URL'),
    embeddingApiKey: env.EMBEDDING_API_KEY,
    embeddingModel: env.EMBEDDING_MODEL,
    chatBaseUrl: validateProviderUrl(env.CHAT_BASE_URL, 'CHAT_BASE_URL'),
    chatApiKey: env.CHAT_API_KEY,
    chatModel: env.CHAT_MODEL,
    aiRequestTimeoutMs: env.AI_REQUEST_TIMEOUT_MS,
    ragTopK: env.RAG_TOP_K,
    ragMaxCandidates: env.RAG_MAX_CANDIDATES,
    ragMinScore: env.RAG_MIN_SCORE,
  };
}
