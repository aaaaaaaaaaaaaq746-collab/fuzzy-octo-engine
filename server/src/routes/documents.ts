import { createReadStream } from 'node:fs';
import { mkdir, open, rm } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Router, type RequestHandler } from 'express';
import multer from 'multer';
import mongoose from 'mongoose';
import type { AppConfig } from '../config.js';
import { createRequireAuth } from '../middleware/auth.js';
import { Conversation, DocumentChunk, Message, StudyDocument } from '../models/index.js';
import { ApiError } from '../services/errors.js';
import { processDocument } from '../services/documentProcessor.js';
import { parseObjectId, requireUserId } from '../services/validation.js';

function safeFilename(value: string): string {
  const filename = path.basename(value).replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return (filename || 'study-material.pdf').slice(0, 180);
}

async function assertPdfSignature(filePath: string): Promise<void> {
  const handle = await open(filePath, 'r');
  try {
    const signature = Buffer.alloc(5);
    const { bytesRead } = await handle.read(signature, 0, signature.length, 0);
    if (bytesRead !== 5 || signature.toString('ascii') !== '%PDF-') {
      throw new ApiError(415, 'The uploaded file is not a valid PDF.', 'INVALID_PDF');
    }
  } finally {
    await handle.close();
  }
}

function serializeDocument(document: {
  _id: unknown;
  originalFilename: string;
  sizeBytes: number;
  pageCount: number;
  processingStatus: string;
  processingError?: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: String(document._id),
    filename: document.originalFilename,
    sizeBytes: document.sizeBytes,
    pageCount: document.pageCount,
    status: document.processingStatus,
    error: document.processingError ?? null,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

export function createDocumentsRouter(config: AppConfig, uploadLimiter: RequestHandler): Router {
  const router = Router();
  const requireAuth = createRequireAuth(config);
  const storage = multer.diskStorage({
    destination: (_request, _file, callback) => {
      void mkdir(config.uploadDirectory, { recursive: true })
        .then(() => callback(null, config.uploadDirectory))
        .catch((error: Error) => callback(error, config.uploadDirectory));
    },
    filename: (_request, _file, callback) => callback(null, `${randomUUID()}.pdf`),
  });
  const upload = multer({
    storage,
    limits: { fileSize: config.maxUploadBytes, files: 1, fields: 2 },
    fileFilter: (_request, file, callback) => {
      const extension = path.extname(file.originalname).toLocaleLowerCase();
      if (file.mimetype !== 'application/pdf' && extension !== '.pdf') {
        callback(new ApiError(415, 'Upload a PDF file to continue.', 'PDF_REQUIRED'));
        return;
      }
      callback(null, true);
    },
  });

  router.get('/', requireAuth, async (request, response) => {
    const ownerId = requireUserId(request);
    const documents = await StudyDocument.find({ ownerId })
      .sort({ createdAt: -1 })
      .limit(100)
      .select('originalFilename sizeBytes pageCount processingStatus processingError createdAt updatedAt')
      .lean();
    response.json({ data: { documents: documents.map(serializeDocument) } });
  });

  router.post('/', requireAuth, uploadLimiter, upload.single('file'), async (request, response) => {
    const file = request.file;
    if (!file) throw new ApiError(400, 'Choose a PDF file to upload.', 'FILE_REQUIRED');
    const ownerId = requireUserId(request);
    try {
      await assertPdfSignature(file.path);
      const document = await StudyDocument.create({
        ownerId: new mongoose.Types.ObjectId(ownerId),
        originalFilename: safeFilename(file.originalname),
        storageKey: file.filename,
        mimeType: 'application/pdf',
        sizeBytes: file.size,
        processingStatus: 'queued',
      });
      response.status(202).json({ data: { document: serializeDocument(document) } });
      void processDocument(config, String(document._id), ownerId).catch(() => {
        console.error('document_processing_failed', { requestId: request.requestId });
      });
    } catch (error) {
      await rm(file.path, { force: true }).catch(() => undefined);
      throw error;
    }
  });

  router.get('/:id/status', requireAuth, async (request, response) => {
    const ownerId = requireUserId(request);
    const document = await StudyDocument.findOne({ _id: parseObjectId(request.params.id), ownerId })
      .select('originalFilename sizeBytes pageCount processingStatus processingError createdAt updatedAt')
      .lean();
    if (!document) throw new ApiError(404, 'The requested item was not found.', 'NOT_FOUND');
    response.json({ data: { document: serializeDocument(document) } });
  });

  router.post('/:id/retry', requireAuth, async (request, response) => {
    const ownerId = requireUserId(request);
    const document = await StudyDocument.findOneAndUpdate(
      { _id: parseObjectId(request.params.id), ownerId, processingStatus: 'failed' },
      { $set: { processingStatus: 'queued', processingError: null } },
      { new: true },
    ).select('originalFilename sizeBytes pageCount processingStatus processingError createdAt updatedAt');
    if (!document) throw new ApiError(404, 'The requested item was not found or cannot be retried.', 'NOT_FOUND');
    response.status(202).json({ data: { document: serializeDocument(document) } });
    void processDocument(config, String(document._id), ownerId).catch(() => {
      console.error('document_retry_failed', { requestId: request.requestId });
    });
  });

  router.get('/:id/file', requireAuth, async (request, response) => {
    const ownerId = requireUserId(request);
    const document = await StudyDocument.findOne({ _id: parseObjectId(request.params.id), ownerId })
      .select('+storageKey originalFilename');
    if (!document) throw new ApiError(404, 'The requested item was not found.', 'NOT_FOUND');
    const filePath = path.join(config.uploadDirectory, path.basename(document.storageKey));
    const asciiFilename = document.originalFilename.replace(/[^\x20-\x7e]|["\\]/g, '_');
    const encodedFilename = encodeURIComponent(document.originalFilename).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
    response.setHeader('content-type', 'application/pdf');
    response.setHeader('content-disposition', `inline; filename="${asciiFilename}"; filename*=UTF-8''${encodedFilename}`);
    response.setHeader('x-content-type-options', 'nosniff');
    response.setHeader('cache-control', 'private, no-store');
    const stream = createReadStream(filePath);
    stream.on('error', () => {
      if (!response.headersSent) response.status(404).json({ error: { message: 'The PDF file is not available.' } });
      else response.destroy();
    });
    stream.pipe(response);
  });

  router.delete('/:id', requireAuth, async (request, response) => {
    const ownerId = requireUserId(request);
    const mongoOwnerId = new mongoose.Types.ObjectId(ownerId);
    const document = await StudyDocument.findOne({ _id: parseObjectId(request.params.id), ownerId })
      .select('+storageKey');
    if (!document) throw new ApiError(404, 'The requested item was not found.', 'NOT_FOUND');

    await Promise.all([
      DocumentChunk.deleteMany({ ownerId: mongoOwnerId, documentId: document._id }),
      Conversation.updateMany({ ownerId: mongoOwnerId }, { $pull: { documentIds: document._id } }),
      Message.updateMany(
        { ownerId: mongoOwnerId, 'citations.documentId': document._id },
        { $pull: { citations: { documentId: document._id } } },
      ),
    ]);
    await StudyDocument.deleteOne({ _id: document._id, ownerId: mongoOwnerId });
    await rm(path.join(config.uploadDirectory, path.basename(document.storageKey)), { force: true });
    response.status(204).end();
  });

  return router;
}
