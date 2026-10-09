import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

const documentChunkSchema = new Schema({
  ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  documentId: { type: Schema.Types.ObjectId, ref: 'StudyDocument', required: true, index: true },
  chunkIndex: { type: Number, required: true, min: 0 },
  pageNumber: { type: Number, required: true, min: 1 },
  text: { type: String, required: true, maxlength: 1_400 },
  embedding: { type: [Number], required: true, select: false },
  embeddingProfile: { type: String, required: true, maxlength: 160 },
}, { timestamps: true });

documentChunkSchema.index({ ownerId: 1, documentId: 1, chunkIndex: 1 }, { unique: true });
documentChunkSchema.index({ ownerId: 1, documentId: 1, embeddingProfile: 1 });

type DocumentChunkRecord = InferSchemaType<typeof documentChunkSchema>;
export const DocumentChunk = (mongoose.models.DocumentChunk as Model<DocumentChunkRecord> | undefined)
  ?? mongoose.model<DocumentChunkRecord>('DocumentChunk', documentChunkSchema);
