import multer from 'multer';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { Evidence } from '../../models/index.js';
import { fail } from '../../middleware/error.js';
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1, fields: 15, fieldSize: 16000 },
  fileFilter: (_req, file, cb) =>
    cb(
      ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)
        ? null
        : fail(415, 'UNSUPPORTED_IMAGE', 'Use a JPEG, PNG or WebP photo.'),
      true,
    ),
}).single('image');
export async function saveEvidence({ file, storeId, userId, kind }) {
  if (!file)
    throw fail(400, 'PHOTO_REQUIRED', 'Capture or upload a product photo.');
  let buffer;
  try {
    const metadata = await sharp(file.buffer, {
      limitInputPixels: 40000000,
    }).metadata();
    if (!['jpeg', 'png', 'webp'].includes(metadata.format))
      throw new Error('format');
    buffer = await sharp(file.buffer)
      .rotate()
      .resize({
        width: 1280,
        height: 1280,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: 80 })
      .toBuffer();
  } catch {
    throw fail(
      415,
      'INVALID_IMAGE',
      'The file is not a valid JPEG, PNG or WebP photo.',
    );
  }
  const evidence = await Evidence.create({
    storeId,
    kind,
    sha256: createHash('sha256').update(buffer).digest('hex'),
    data: buffer,
    mimeType: 'image/jpeg',
    takenAt: new Date(),
    takenBy: userId,
  });
  return { evidence, buffer };
}
