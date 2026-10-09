import type { RequestHandler } from 'express';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import { User } from '../models/User.js';
import { ApiError } from '../services/errors.js';
import type { AppConfig } from '../config.js';

export const SESSION_COOKIE = 'pagewise_session';
const SESSION_ISSUER = 'pagewise-study-assistant';
const SESSION_AUDIENCE = 'pagewise-web';

export function createRequireAuth(config: AppConfig): RequestHandler {
  return async (request, response, next) => {
    const token = request.cookies?.[SESSION_COOKIE];
    if (typeof token !== 'string' || !token) {
      next(new ApiError(401, 'Please sign in to continue.', 'AUTH_REQUIRED'));
      return;
    }

    try {
      const payload = jwt.verify(token, config.sessionSecret, {
        issuer: SESSION_ISSUER,
        audience: SESSION_AUDIENCE,
      }) as JwtPayload;
      if (typeof payload.sub !== 'string' || !/^[a-f\d]{24}$/i.test(payload.sub)) {
        throw new ApiError(401, 'Your session has expired. Please sign in again.', 'SESSION_INVALID');
      }
      const userExists = await User.exists({ _id: payload.sub });
      if (!userExists) {
        response.clearCookie(SESSION_COOKIE, cookieOptions(config));
        throw new ApiError(401, 'Your session has expired. Please sign in again.', 'SESSION_INVALID');
      }
      request.auth = { userId: payload.sub };
      next();
    } catch (error) {
      if (error instanceof ApiError) {
        next(error);
        return;
      }
      next(new ApiError(401, 'Your session has expired. Please sign in again.', 'SESSION_INVALID'));
    }
  };
}

export function cookieOptions(config: AppConfig) {
  return {
    httpOnly: true,
    secure: config.nodeEnv === 'production',
    sameSite: 'strict' as const,
    path: '/',
  };
}

export function createSessionToken(userId: string, config: AppConfig): string {
  return jwt.sign({}, config.sessionSecret, {
    subject: userId,
    issuer: SESSION_ISSUER,
    audience: SESSION_AUDIENCE,
    expiresIn: '7d',
  });
}
