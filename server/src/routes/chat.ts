import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import type { AppConfig } from '../config.js';
import { createRequireAuth } from '../middleware/auth.js';
import { Conversation, DocumentChunk, Message, StudyDocument } from '../models/index.js';
import { ApiError, ProviderError } from '../services/errors.js';
import { createChatProvider, createEmbeddingProvider, type ChatContextMessage } from '../services/providers.js';
import { buildChunkSearchFilter, rankChunks, validateAnswerCitations } from '../services/rag.js';
import { parseInput, parseObjectId, requireUserId, sanitizedTitle } from '../services/validation.js';
import { serializeConversation, serializeMessage } from './conversations.js';

const chatSchema = z.object({
  message: z.string().trim().min(1, 'Write a question first.').max(4_000, 'Keep a question under 4,000 characters.'),
  documentIds: z.array(z.string().regex(/^[a-f\d]{24}$/i)).min(1, 'Select at least one ready PDF.').max(10),
  conversationId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
});

export function createChatRouter(config: AppConfig): Router {
  const router = Router();
  const requireAuth = createRequireAuth(config);

  router.post('/', requireAuth, async (request, response) => {
    const ownerId = requireUserId(request);
    const input = parseInput(chatSchema, request.body);
    const uniqueDocumentIds = [...new Set(input.documentIds)];
    const mongoOwnerId = new mongoose.Types.ObjectId(ownerId);
    const mongoDocumentIds = uniqueDocumentIds.map((id) => new mongoose.Types.ObjectId(id));

    const selectedDocuments = await StudyDocument.find({
      _id: { $in: mongoDocumentIds },
      ownerId: mongoOwnerId,
      processingStatus: 'ready',
    }).select('_id originalFilename').lean();
    if (selectedDocuments.length !== uniqueDocumentIds.length) {
      throw new ApiError(400, 'Choose ready PDFs from your library.', 'INVALID_DOCUMENT_SELECTION');
    }
    const filenameById = new Map(selectedDocuments.map((document) => [String(document._id), document.originalFilename]));

    let conversation;
    let sourcesChanged = false;
    if (input.conversationId) {
      conversation = await Conversation.findOne({ _id: parseObjectId(input.conversationId), ownerId: mongoOwnerId });
      if (!conversation) throw new ApiError(404, 'The requested item was not found.', 'NOT_FOUND');
      const previousIds = conversation.documentIds.map(String).sort().join(',');
      const nextIds = [...uniqueDocumentIds].sort().join(',');
      sourcesChanged = previousIds !== nextIds;
      conversation.documentIds = mongoDocumentIds;
      conversation.updatedAt = new Date();
      await conversation.save();
    } else {
      conversation = await Conversation.create({
        ownerId: mongoOwnerId,
        title: sanitizedTitle(input.message, 'New study chat').slice(0, 72),
        documentIds: mongoDocumentIds,
      });
    }

    const recentMessages = sourcesChanged ? [] : await Message.find({ ownerId: mongoOwnerId, conversationId: conversation._id })
      .sort({ createdAt: -1 })
      .limit(8)
      .select('role content')
      .lean();
    const history: ChatContextMessage[] = recentMessages.reverse().map((message) => ({
      role: message.role as 'user' | 'assistant',
      content: message.content.slice(0, 2_000),
    }));

    const userMessage = await Message.create({
      ownerId: mongoOwnerId,
      conversationId: conversation._id,
      role: 'user',
      content: input.message,
      citations: [],
    });

    let answer = 'I couldn’t find enough relevant information in the selected PDFs to answer that. Try selecting a different document or asking with terms used in the text.';
    let citations: Array<{ documentId: string; filename: string; pageNumber: number; quote: string }> = [];
    let answerMode: 'extractive' | 'generated' | null = null;

    try {
      const embedder = createEmbeddingProvider(config);
      const [queryVector] = await embedder.embed([input.message]);
      if (!queryVector) throw new ProviderError('The embedding provider returned an invalid query vector.');

      const storedChunks = await DocumentChunk.find(
        buildChunkSearchFilter(ownerId, uniqueDocumentIds, embedder.profile),
      )
        .select('+embedding documentId pageNumber chunkIndex text')
        .limit(config.ragMaxCandidates)
        .lean();

      const candidates = storedChunks.map((chunk) => ({
        id: String(chunk._id),
        documentId: String(chunk.documentId),
        filename: filenameById.get(String(chunk.documentId)) ?? 'Selected PDF',
        pageNumber: chunk.pageNumber,
        text: chunk.text,
        embedding: chunk.embedding,
      }));
      const ranked = rankChunks(queryVector, candidates, config.ragTopK, config.ragMinScore);

      if (ranked.length > 0) {
        const evidence = ranked.map((chunk, index) => ({
          sourceNumber: index + 1,
          documentId: chunk.documentId,
          filename: chunk.filename,
          pageNumber: chunk.pageNumber,
          text: chunk.text,
        }));
        const chatProvider = createChatProvider(config);
        const rawAnswer = await chatProvider.answer({ question: input.message, history, evidence });
        const validated = validateAnswerCitations(rawAnswer, evidence.map((source) => ({
          sourceNumber: source.sourceNumber,
          documentId: source.documentId,
          filename: source.filename,
          pageNumber: source.pageNumber,
          quote: source.text.slice(0, 1_200),
        })));
        answer = validated.answer;
        citations = validated.citations;
        answerMode = chatProvider.mode;
      }
    } catch (error) {
      if (!(error instanceof ProviderError)) throw error;
      answer = `${error.message} Your question is saved; check the provider configuration and try again.`;
    }

    const assistantMessage = await Message.create({
      ownerId: mongoOwnerId,
      conversationId: conversation._id,
      role: 'assistant',
      content: answer,
      citations,
      answerMode,
    });
    conversation.updatedAt = new Date();
    await conversation.save();

    response.json({
      data: {
        conversation: serializeConversation(conversation),
        userMessage: serializeMessage(userMessage),
        assistantMessage: serializeMessage(assistantMessage),
      },
    });
  });

  return router;
}
