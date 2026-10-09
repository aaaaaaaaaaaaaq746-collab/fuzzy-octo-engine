import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import type { AppConfig } from '../config.js';
import { User } from '../models/User.js';
import { createRequireAuth, createSessionToken, cookieOptions, SESSION_COOKIE } from '../middleware/auth.js';
import { ApiError } from '../services/errors.js';
import { parseInput, requireUserId } from '../services/validation.js';

const credentialsSchema = z.object({
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(12, 'Use a password with at least 12 characters.').max(128),
});

function publicUser(user: { _id: unknown; email: string }) {
  return { id: String(user._id), email: user.email };
}

export function createAuthRouter(config: AppConfig): Router {
  const router = Router();
  const requireAuth = createRequireAuth(config);

  router.post('/register', async (request, response) => {
    const { email, password } = parseInput(credentialsSchema, request.body);
    const existing = await User.exists({ email });
    if (existing) throw new ApiError(409, 'An account with this email already exists.', 'ACCOUNT_EXISTS');

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({ email, passwordHash });
    response.cookie(SESSION_COOKIE, createSessionToken(String(user._id), config), {
      ...cookieOptions(config),
      maxAge: 7 * 24 * 60 * 60 * 1_000,
    });
    response.status(201).json({ data: { user: publicUser(user) } });
  });

  router.post('/login', async (request, response) => {
    const { email, password } = parseInput(credentialsSchema, request.body);
    const user = await User.findOne({ email }).select('+passwordHash');
    const validPassword = user ? await bcrypt.compare(password, user.passwordHash) : false;
    if (!user || !validPassword) {
      throw new ApiError(401, 'The email or password is incorrect.', 'INVALID_CREDENTIALS');
    }

    response.cookie(SESSION_COOKIE, createSessionToken(String(user._id), config), {
      ...cookieOptions(config),
      maxAge: 7 * 24 * 60 * 60 * 1_000,
    });
    response.json({ data: { user: publicUser(user) } });
  });

  router.post('/logout', (_request, response) => {
    response.clearCookie(SESSION_COOKIE, cookieOptions(config));
    response.status(204).end();
  });

  router.get('/me', requireAuth, async (request, response) => {
    const user = await User.findById(requireUserId(request)).select('_id email');
    if (!user) throw new ApiError(401, 'Please sign in to continue.', 'AUTH_REQUIRED');
    response.json({ data: { user: publicUser(user) } });
  });

  return router;
}
