import { ZodError } from 'zod';
import multer from 'multer';
export function fail(status, code, message) {
  return Object.assign(new Error(message), { status, code });
}
export const route = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);
export function errorHandler(err, req, res, _next) {
  if (err.code === 'LIMIT_FILE_SIZE') {
    err.status = 413;
    err.message = 'Photo exceeds the 8 MB limit.';
  } else if (err instanceof multer.MulterError) {
    err.status = 400;
    err.message = 'Upload one allowed photo in the image field.';
  }
  const status =
    err instanceof ZodError
      ? 400
      : err.status ||
        (err.code === 11000 ? 409 : err.name === 'CastError' ? 400 : 500);
  if (status >= 500) req.log?.error({ err }, 'Request failed');
  res.status(status).json({
    error: {
      code:
        typeof err.code === 'string'
          ? err.code
          : status === 400
            ? 'INVALID_INPUT'
            : status === 409
              ? 'CONFLICT'
              : 'SERVER_ERROR',
      message:
        status >= 500
          ? 'The request could not be completed. Please retry.'
          : err.message,
      ...(err instanceof ZodError && {
        details: err.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      }),
    },
  });
}
