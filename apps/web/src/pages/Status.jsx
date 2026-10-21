import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Brand, ErrorState, PageTitle } from '../components/Ui.jsx';
export default function Status() {
  const health = useQuery({
    queryKey: ['health'],
    refetchInterval: 30000,
    retry: false,
    queryFn: async ({ signal }) => {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL || ''}/health`,
        { signal, cache: 'no-store' },
      );
      return response.json();
    },
  });
  return (
    <main>
      <Brand />
      <PageTitle
        title="Service status"
        description="Operational connectivity only. This page does not certify stock safety."
      />
      {health.isError ? (
        <ErrorState error={health.error} retry={() => health.refetch()} />
      ) : !health.data ? (
        <p role="status">Checking API…</p>
      ) : (
        <section className="notice" aria-live="polite">
          <p>
            API: {health.data.status} · database: {health.data.mongo}
          </p>
          <p>
            Vision provider:{' '}
            {health.data.llm?.configured
              ? 'configured'
              : 'unconfigured — human review available'}{' '}
            · circuit: {health.data.llm?.circuit}
          </p>
          <p>
            Last checked:{' '}
            {new Date(health.dataUpdatedAt).toLocaleString('en-IN')}
          </p>
        </section>
      )}
      <p>
        <a href="/">Return to workspace</a>
      </p>
    </main>
  );
}
