import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

const userSchema = new Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
  passwordHash: { type: String, required: true, select: false },
}, { timestamps: true });

type UserRecord = InferSchemaType<typeof userSchema>;
export const User = (mongoose.models.User as Model<UserRecord> | undefined)
  ?? mongoose.model<UserRecord>('User', userSchema);
