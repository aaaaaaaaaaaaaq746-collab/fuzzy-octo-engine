import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

const conversationSchema = new Schema({
  ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  title: { type: String, required: true, maxlength: 100, trim: true },
  documentIds: [{ type: Schema.Types.ObjectId, ref: 'StudyDocument' }],
}, { timestamps: true });

conversationSchema.index({ ownerId: 1, updatedAt: -1 });

type ConversationRecord = InferSchemaType<typeof conversationSchema>;
export const Conversation = (mongoose.models.Conversation as Model<ConversationRecord> | undefined)
  ?? mongoose.model<ConversationRecord>('Conversation', conversationSchema);
