import mongoose from 'mongoose';

let connected = false;

export async function connectDb(): Promise<void> {
  if (connected) return;
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set. See .env.example.');
  await mongoose.connect(uri);
  connected = true;
  console.log('Connected to MongoDB');
}
