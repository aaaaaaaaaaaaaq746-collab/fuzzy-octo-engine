import { existsSync } from 'node:fs';
import path from 'node:path';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import type { AppConfig } from './config.js';
import { projectRoot } from './config.js';
import { errorHandler } from './middleware/errors.js';
import { requestContext } from './middleware/requestContext.js';
import { ApiError } from './services/errors.js';
import { createAuthRouter } from './routes/auth.js';
import { createChatRouter } from './routes/chat.js';
import { createConversationsRouter } from './routes/conversations.js';
import { createDocumentsRouter } from './routes/documents.js';
import { healthRouter } from './routes/health.js';

function originGuard(clientOrigin: string): RequestHandler {
  return (request, _response, next) => {
    const isUnsafeMethod = !['GET', 'HEAD', 'OPTIONS'].includes(request.method);
    const origin = request.get('origin');
    const fetchSite = request.get('sec-fetch-site');

    if (isUnsafeMethod && fetchSite === 'cross-site') {
      next(new ApiError(403, 'This request was blocked by the cross-site request protection.', 'ORIGIN_REJECTED'));
      return;
    }
    if (isUnsafeMethod && origin && origin.replace(/\/$/, '') !== clientOrigin) {
      next(new ApiError(403, 'This request was blocked because its origin is not allowed.', 'ORIGIN_REJECTED'));
      return;
    }
    next();
  };
}

export function createApp(config: AppConfig) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.nodeEnv === 'production' ? 1 : false);
  app.use(requestContext);
  app.use(helmet({
    crossOriginResourcePolicy: { policy: 'same-origin' },
    referrerPolicy: { policy: 'no-referrer' },
  }));
  app.use(cors({
    origin: (origin, callback) => {
      if (origin && origin.replace(/\/$/, '') === config.clientOrigin) callback(null, true);
      else callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
    maxAge: 600,
  }));
  app.use(express.json({ limit: '32kb' }));
  app.use(cookieParser());
  app.use('/api', originGuard(config.clientOrigin));

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1_000,
    limit: 20,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: { message: 'Too many sign-in attempts. Wait a few minutes and try again.', code: 'RATE_LIMITED' } },
  });
  const uploadLimiter = rateLimit({
    windowMs: 60 * 60 * 1_000,
    limit: 20,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: { message: 'Upload limit reached. Please try again later.', code: 'RATE_LIMITED' } },
  });
  const chatLimiter = rateLimit({
    windowMs: 60 * 1_000,
    limit: 30,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: { message: 'You are sending questions too quickly. Please wait a moment.', code: 'RATE_LIMITED' } },
  });

  app.use('/api/health', healthRouter);
  app.use('/api/auth', authLimiter, createAuthRouter(config));
  app.use('/api/documents', createDocumentsRouter(config, uploadLimiter));
  app.use('/api/conversations', createConversationsRouter(config));
  app.use('/api/chat', chatLimiter, createChatRouter(config));

  app.use('/api', (_request, _response, next) => {
    next(new ApiError(404, 'The requested API route was not found.', 'NOT_FOUND'));
  });

  const clientDist = path.resolve(projectRoot, 'client', 'dist');
  if (existsSync(clientDist)) {
    app.use(express.static(clientDist, { index: false, maxAge: config.nodeEnv === 'production' ? '1h' : 0 }));
    app.use((request, response, next) => {
      if (request.method !== 'GET' || request.path.startsWith('/api')) {
        next();
        return;
      }
      response.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  app.use(errorHandler);
  return app;
}
