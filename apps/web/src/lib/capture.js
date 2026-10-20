import { openDB } from 'idb';
const database = () =>
  openDB('freshwarden-capture', 1, {
    upgrade(db) {
      db.createObjectStore('drafts');
    },
  });
export async function saveDraft(key, value) {
  const db = await database();
  await db.put('drafts', value, key);
  db.close();
}
export async function loadDraft(key) {
  const db = await database();
  const value = await db.get('drafts', key);
  db.close();
  return value;
}
export async function clearDraft(key) {
  const db = await database();
  await db.delete('drafts', key);
  db.close();
}
export async function preparePhoto(file, crop) {
  const image = await createImageBitmap(file),
    canvas = document.createElement('canvas');
  const source = crop
    ? {
        x: (crop.x / 100) * image.width,
        y: (crop.y / 100) * image.height,
        w: (crop.w / 100) * image.width,
        h: (crop.h / 100) * image.height,
      }
    : { x: 0, y: 0, w: image.width, h: image.height };
  const scale = Math.min(1, 1280 / Math.max(source.w, source.h));
  canvas.width = Math.max(1, Math.round(source.w * scale));
  canvas.height = Math.max(1, Math.round(source.h * scale));
  const context = canvas.getContext('2d');
  context.drawImage(
    image,
    source.x,
    source.y,
    source.w,
    source.h,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  image.close();
  if (crop) {
    const data = context.getImageData(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < data.data.length; i += 4) {
      const gray =
        data.data[i] * 0.299 +
        data.data[i + 1] * 0.587 +
        data.data[i + 2] * 0.114;
      const contrast = Math.max(0, Math.min(255, (gray - 128) * 1.4 + 128));
      data.data[i] = data.data[i + 1] = data.data[i + 2] = contrast;
    }
    context.putImageData(data, 0, 0);
  }
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error('Could not prepare photo.')),
      'image/jpeg',
      0.85,
    ),
  );
}
export async function readPack(file, crop, onStep) {
  const blob = await preparePhoto(file),
    url = URL.createObjectURL(blob);
  let barcode = null;
  onStep('Reading barcode…');
  try {
    const { BrowserMultiFormatReader } = await import('@zxing/browser');
    const result = await new BrowserMultiFormatReader().decodeFromImageUrl(url);
    barcode = result.getText();
  } catch {
    /* Unreadable barcode stays empty for manual entry. */
  } finally {
    URL.revokeObjectURL(url);
  }
  onStep('Reading the framed date…');
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('eng');
  try {
    const cropped = await preparePhoto(file, crop);
    const { data } = await worker.recognize(cropped);
    return { barcode, text: data.text, confidence: data.confidence / 100 };
  } finally {
    await worker.terminate();
  }
}
