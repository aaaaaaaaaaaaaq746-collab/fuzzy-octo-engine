import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import type { AppConfig } from '../config.js';
import { createRequireAuth } from '../middleware/auth.js';
import { Conversation, Message, StudyDocument } from '../models/index.js';
import { ApiError } from '../services/errors.js';
import { parseInput, parseObjectId, requireUserId, sanitizedTitle } from '../services/validation.js';

const documentIdsSchema = z.array(z.string().regex(/^[a-f\d]{24}$/i)).max(10).default([]);

export function serializeConversation(conversation: {
  _id: unknown;
  title: string;
  documentIds: unknown[];
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: String(conversation._id),
    title: conversation.title,
    documentIds: conversation.documentIds.map(String),
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
  };
}

export function serializeMessage(message: {
  _id: unknown;
  role: string;
  content: string;
  citations?: Array<{ documentId: unknown; filename: string; pageNumber: number; quote: string }>;
  answerMode?: string | null;
  createdAt: Date;
}) {
  return {
    id: String(message._id),
    role: message.role,
    content: message.content,
    citations: (message.citations ?? []).map((citation) => ({
      documentId: String(citation.documentId),
      filename: citation.filename,
      pageNumber: citation.pageNumber,
      quote: citation.quote,
    })),
    answerMode: message.answerMode ?? null,
    createdAt: message.createdAt,
  };
}

export function createConversationsRouter(config: AppConfig): Router {
  const router = Router();
  const requireAuth = createRequireAuth(config);

  router.get('/', requireAuth, async (request, response) => {
    const ownerId = requireUserId(request);
    const conversations = await Conversation.find({ ownerId })
      .sort({ updatedAt: -1 })
      .limit(100)
      .lean();
    response.json({ data: { conversations: conversations.map(serializeConversation) } });
  });

  router.post('/', requireAuth, async (request, response) => {
    const ownerId = requireUserId(request);
    const documentIds = parseInput(documentIdsSchema, request.body?.documentIds ?? []);
    const uniqueIds = [...new Set(documentIds)];
    const mongoOwnerId = new mongoose.Types.ObjectId(ownerId);

    if (uniqueIds.length > 0) {
      const readyDocuments = await StudyDocument.countDocuments({
        _id: { $in: uniqueIds.map((id) => new mongoose.Types.ObjectId(id)) },
        ownerId: mongoOwnerId,
        processingStatus: 'ready',
      });
      if (readyDocuments !== uniqueIds.length) {
        throw new ApiError(400, 'Choose ready PDFs from your library.', 'INVALID_DOCUMENT_SELECTION');
      }
    }

    const conversation = await Conversation.create({
      ownerId: mongoOwnerId,
      title: 'New study chat',
      documentIds: uniqueIds.map((id) => new mongoose.Types.ObjectId(id)),
    });
    response.status(201).json({ data: { conversation: serializeConversation(conversation) } });
  });

  router.get('/:id/messages', requireAuth, async (request, response) => {
    const ownerId = requireUserId(request);
    const conversation = await Conversation.findOne({ _id: parseObjectId(request.params.id), ownerId }).lean();
    if (!conversation) throw new ApiError(404, 'The requested item was not found.', 'NOT_FOUND');

    const messages = await Message.find({ ownerId, conversationId: conversation._id })
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();
    response.json({
      data: {
        conversation: serializeConversation(conversation),
        messages: messages.reverse().map(serializeMessage),
      },
    });
  });

  router.patch('/:id', requireAuth, async (request, response) => {
    const ownerId = requireUserId(request);
    const parsed = parseInput(z.object({ title: z.string().trim().min(1).max(100) }), request.body);
    const conversation = await Conversation.findOneAndUpdate(
      { _id: parseObjectId(request.params.id), ownerId },
      { $set: { title: sanitizedTitle(parsed.title), updatedAt: new Date() } },
      { new: true, runValidators: true },
    );
    if (!conversation) throw new ApiError(404, 'The requested item was not found.', 'NOT_FOUND');
    response.json({ data: { conversation: serializeConversation(conversation) } });
  });

  router.delete('/:id', requireAuth, async (request, response) => {
    const ownerId = requireUserId(request);
    const conversation = await Conversation.findOneAndDelete({
      _id: parseObjectId(request.params.id),
      ownerId,
    });
    if (!conversation) throw new ApiError(404, 'The requested item was not found.', 'NOT_FOUND');
    await Message.deleteMany({ ownerId, conversationId: conversation._id });
    response.status(204).end();
  });

  return router;
}
