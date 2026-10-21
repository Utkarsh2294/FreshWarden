import jwt from 'jsonwebtoken';
import { User } from '../models/index.js';
import { fail, route } from './error.js';
export const requireAuth = (config) =>
  Object.assign(
    route(async (req, _res, next) => {
      const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
      let decoded;
      try {
        decoded = jwt.verify(token || '', config.JWT_SECRET, {
          algorithms: ['HS256'],
          issuer: 'freshwarden',
          audience: 'freshwarden-web',
        });
      } catch {
        throw fail(401, 'UNAUTHENTICATED', 'Please sign in again.');
      }
      req.user = await User.findById(decoded.sub).lean();
      if (!req.user) throw fail(401, 'UNAUTHENTICATED', 'Account unavailable.');
      next();
    }),
    { requiresAuth: true },
  );
export const requireRole = (...roles) =>
  Object.assign(
    (req, _res, next) =>
      roles.includes(req.user.role) || req.user.role === 'admin'
        ? next()
        : next(fail(403, 'FORBIDDEN', 'Your role cannot perform this action.')),
    { allowedRoles: [...new Set([...roles, 'admin'])] },
  );
export function assertStore(user, storeId) {
  if (
    user.role !== 'admin' &&
    !user.storeIds.some((id) => String(id) === String(storeId))
  )
    throw fail(
      403,
      'STORE_FORBIDDEN',
      'This store is not assigned to your account.',
    );
}
