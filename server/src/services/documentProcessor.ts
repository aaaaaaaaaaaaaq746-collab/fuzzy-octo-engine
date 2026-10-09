import { readFile } from 'node:fs/promises';
import path from 'node:path';
import mongoose from 'mongoose';
import type { AppConfig } from '../config.js';
import { DocumentChunk, StudyDocument } from '../models/index.js';
import { chunkPages } from './chunking.js';
import { ProviderError } from './errors.js';
import { extractPdfPages, PdfExtractionError } from './pdf.js';
import { createEmbeddingProvider } from './providers.js';

export async function processDocument(config: AppConfig, documentId: string, ownerId: string): Promise<void> {
  const claim = await StudyDocument.findOneAndUpdate(
    {
      _id: documentId,
      ownerId,
      processingStatus: { $in: ['queued', 'failed'] },
    },
    { $set: { processingStatus: 'processing', processingError: null } },
    { new: true },
  ).select('+storageKey');

  if (!claim) return;

  const mongoOwnerId = new mongoose.Types.ObjectId(ownerId);
  const mongoDocumentId = claim._id;
  try {
    await DocumentChunk.deleteMany({ ownerId: mongoOwnerId, documentId: mongoDocumentId });
    const safeKey = path.basename(claim.storageKey);
    const file = await readFile(path.join(config.uploadDirectory, safeKey));
    const pages = await extractPdfPages(file, config.maxPdfPages);
    const chunks = chunkPages(pages);
    if (chunks.length === 0) {
      throw new PdfExtractionError('No selectable text was found. This may be a scanned PDF; OCR is not configured.');
    }

    const provider = createEmbeddingProvider(config);
    const vectors = await provider.embed(chunks.map((chunk) => chunk.text));
    if (vectors.length !== chunks.length) throw new ProviderError('The embedding provider returned an incomplete result.');

    await DocumentChunk.insertMany(chunks.map((chunk, index) => ({
      ownerId: mongoOwnerId,
      documentId: mongoDocumentId,
      chunkIndex: chunk.chunkIndex,
      pageNumber: chunk.pageNumber,
      text: chunk.text,
      embedding: vectors[index],
      embeddingProfile: provider.profile,
    })), { ordered: true });

    await StudyDocument.updateOne(
      { _id: mongoDocumentId, ownerId: mongoOwnerId },
      { $set: { pageCount: pages.length, processingStatus: 'ready', processingError: null } },
    );
  } catch (error) {
    await DocumentChunk.deleteMany({ ownerId: mongoOwnerId, documentId: mongoDocumentId }).catch(() => undefined);
    const safeMessage = error instanceof PdfExtractionError || error instanceof ProviderError
      ? error.message
      : 'Processing failed. Check the server configuration, then retry this PDF.';
    await StudyDocument.updateOne(
      { _id: mongoDocumentId, ownerId: mongoOwnerId },
      { $set: { processingStatus: 'failed', processingError: safeMessage.slice(0, 240) } },
    );
  }
}
