import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

const citationSchema = new Schema({
  documentId: { type: Schema.Types.ObjectId, ref: 'StudyDocument', required: true },
  filename: { type: String, required: true, maxlength: 180 },
  pageNumber: { type: Number, required: true, min: 1 },
  quote: { type: String, required: true, maxlength: 1_400 },
}, { _id: false });

const messageSchema = new Schema({
  ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true, index: true },
  role: { type: String, required: true, enum: ['user', 'assistant'] },
  content: { type: String, required: true, maxlength: 8_000 },
  citations: { type: [citationSchema], default: [] },
  answerMode: { type: String, enum: ['extractive', 'generated', null], default: null },
}, { timestamps: true });

messageSchema.index({ ownerId: 1, conversationId: 1, createdAt: 1 });

type MessageRecord = InferSchemaType<typeof messageSchema>;
export const Message = (mongoose.models.Message as Model<MessageRecord> | undefined)
  ?? mongoose.model<MessageRecord>('Message', messageSchema);
