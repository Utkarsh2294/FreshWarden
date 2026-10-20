import { EventEmitter } from 'node:events';
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { User } from './models/index.js';
export const events = new EventEmitter();
export function emitStore(storeId, type, data) {
  events.emit('store-event', { storeId: String(storeId), type, data });
}
export function attachRealtime(server, config) {
  const io = new Server(server, { cors: { origin: config.CLIENT_ORIGIN } });
  io.use(async (socket, next) => {
    try {
      const decoded = jwt.verify(
        socket.handshake.auth?.token || '',
        config.JWT_SECRET,
        {
          algorithms: ['HS256'],
          issuer: 'freshwarden',
          audience: 'freshwarden-web',
        },
      );
      const user = await User.findById(decoded.sub).lean();
      if (!user) throw new Error('account');
      socket.data.user = user;
      next();
    } catch {
      next(new Error('Authentication required'));
    }
  });
  io.on('connection', (socket) => {
    for (const id of socket.data.user.storeIds) socket.join(`store:${id}`);
  });
  const listener = ({ storeId, type, data }) =>
    io.to(`store:${storeId}`).emit(type, data);
  events.on('store-event', listener);
  io.on('close', () => events.off('store-event', listener));
  return io;
}
