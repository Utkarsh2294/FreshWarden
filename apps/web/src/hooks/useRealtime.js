import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { io } from 'socket.io-client';
export function useRealtime(token, storeId) {
  const client = useQueryClient();
  useEffect(() => {
    if (!token || !storeId) return;
    const socket = io(import.meta.env.VITE_API_URL || undefined, {
      auth: { token },
      transports: ['websocket'],
    });
    const refresh = () => {
      for (const key of [
        'overview',
        'coldchain',
        'incidents',
        'lots',
        'inward',
      ])
        client.invalidateQueries({ queryKey: [key, storeId] });
    };
    for (const event of [
      'zone:reading',
      'zone:alert',
      'lot:status',
      'incident:new',
      'dispatch:veto',
    ])
      socket.on(event, refresh);
    return () => socket.disconnect();
  }, [token, storeId, client]);
}
