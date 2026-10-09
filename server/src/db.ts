import mongoose from 'mongoose';

export async function connectDatabase(uri: string): Promise<void> {
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10_000,
    autoIndex: true,
  });
}
