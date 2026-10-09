import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

const studyDocumentSchema = new Schema({
  ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  originalFilename: { type: String, required: true, maxlength: 180 },
  storageKey: { type: String, required: true, unique: true, select: false },
  mimeType: { type: String, required: true, enum: ['application/pdf'], default: 'application/pdf' },
  sizeBytes: { type: Number, required: true, min: 1 },
  pageCount: { type: Number, required: true, default: 0, min: 0 },
  processingStatus: { type: String, required: true, enum: ['queued', 'processing', 'ready', 'failed'], default: 'queued' },
  processingError: { type: String, default: null, maxlength: 240 },
}, { timestamps: true });

studyDocumentSchema.index({ ownerId: 1, createdAt: -1 });

type StudyDocumentRecord = InferSchemaType<typeof studyDocumentSchema>;
export const StudyDocument = (mongoose.models.StudyDocument as Model<StudyDocumentRecord> | undefined)
  ?? mongoose.model<StudyDocumentRecord>('StudyDocument', studyDocumentSchema);
