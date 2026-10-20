import React from 'react';
import { useQuery } from '@tanstack/react-query';
export default function App() {
  const health = useQuery({ queryKey: ['health'], queryFn: async () => { const response = await fetch('/health'); return response.json(); } });
  return <main><h1>FreshWarden</h1><p>The guardian on every shelf.</p><p role="status">API: {health.data?.status || (health.isError ? 'unavailable' : 'checking…')}</p></main>;
}
