import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { User } from '../../models/index.js';
import { fail, route } from '../../middleware/error.js';
import { requireAuth } from '../../middleware/auth.js';
export function authRoutes(config) {
  const router = Router();
  router.post(
    '/auth/login',
    rateLimit({
      windowMs: 60000,
      limit: 5,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
    }),
    route(async (req, res) => {
      const body = z
        .object({
          phone: z.string().regex(/^\d{10}$/),
          password: z.string().min(1).max(128),
        })
        .strict()
        .parse(req.body);
      const user = await User.findOne({ phone: body.phone }).select(
        '+passwordHash',
      );
      // A real bcrypt comparison on missing accounts avoids a fast account-enumeration path.
      const valid = await bcrypt.compare(
        body.password,
        user?.passwordHash ||
          '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
      );
      if (!user || !valid)
        throw fail(
          401,
          'INVALID_CREDENTIALS',
          'Phone or password is incorrect.',
        );
      const token = jwt.sign({}, config.JWT_SECRET, {
        subject: String(user._id),
        expiresIn: '8h',
        algorithm: 'HS256',
        issuer: 'freshwarden',
        audience: 'freshwarden-web',
      });
      res.json({ token });
    }),
  );
  router.get('/me', requireAuth(config), (req, res) => res.json(req.user));
  return router;
}
