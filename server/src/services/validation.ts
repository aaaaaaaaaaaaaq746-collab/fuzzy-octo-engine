import { Types } from 'mongoose';
import { z } from 'zod';
import type { Request } from 'express';
import { ApiError } from './errors.js';

export function parseInput<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    const message = result.error.issues
      .map((issue) => `${issue.path.length ? `${issue.path.join('.')}: ` : ''}${issue.message}`)
      .slice(0, 4)
      .join(' ');
    throw new ApiError(400, message || 'The request is invalid.', 'VALIDATION_ERROR');
  }
  return result.data;
}

export function requireUserId(request: Request): string {
  if (!request.auth?.userId) throw new ApiError(401, 'Please sign in to continue.', 'AUTH_REQUIRED');
  return request.auth.userId;
}

export function parseObjectId(value: unknown): Types.ObjectId {
  if (typeof value !== 'string' || !/^[a-f\d]{24}$/i.test(value)) {
    throw new ApiError(404, 'The requested item was not found.', 'NOT_FOUND');
  }
  return new Types.ObjectId(value);
}

export function sanitizedTitle(value: string, fallback = 'New study chat'): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100) || fallback;
}
