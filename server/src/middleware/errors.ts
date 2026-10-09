import type { ErrorRequestHandler } from 'express';
import multer from 'multer';
import { ApiError } from '../services/errors.js';

export const errorHandler: ErrorRequestHandler = (error: unknown, request, response, next) => {
  if (response.headersSent) {
    next(error);
    return;
  }

  let statusCode = 500;
  let message = 'Something went wrong. Please try again.';
  let code = 'INTERNAL_ERROR';

  if (error instanceof ApiError) {
    statusCode = error.statusCode;
    message = error.message;
    code = error.code;
  } else if (error instanceof multer.MulterError) {
    statusCode = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    message = error.code === 'LIMIT_FILE_SIZE'
      ? 'This PDF is larger than the upload limit.'
      : 'The upload could not be accepted. Choose one PDF file and try again.';
    code = error.code;
  } else if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000) {
    statusCode = 409;
    message = 'An account with this email already exists.';
    code = 'DUPLICATE_RESOURCE';
  } else if (typeof error === 'object' && error !== null && 'name' in error && error.name === 'CastError') {
    statusCode = 404;
    message = 'The requested item was not found.';
    code = 'NOT_FOUND';
  } else if (typeof error === 'object' && error !== null && 'type' in error && error.type === 'entity.too.large') {
    statusCode = 413;
    message = 'The request is too large.';
    code = 'PAYLOAD_TOO_LARGE';
  }

  if (statusCode >= 500) {
    console.error('request_failed', {
      requestId: request.requestId,
      name: error instanceof Error ? error.name : 'UnknownError',
    });
  }

  response.status(statusCode).json({
    error: { message, code, requestId: request.requestId },
  });
};
