import mongoose from 'mongoose';
import { logger } from './logger.js';
export async function connectDb(uri, attempts = 3) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try { await mongoose.connect(uri, { serverSelectionTimeoutMS: 3000 }); return; }
    catch { logger.warn({ attempt }, 'MongoDB unavailable'); if (attempt === attempts) return; await new Promise(resolve => setTimeout(resolve, 500 * 2 ** attempt)); }
  }
}
