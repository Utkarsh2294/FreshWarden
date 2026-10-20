import React, { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
export default function EvidencePhoto({ id, token }) {
  const [url, setUrl] = useState(''),
    [error, setError] = useState('');
  useEffect(() => {
    let active = true,
      objectUrl;
    setUrl('');
    setError('');
    api(`/evidence/${id}`, { token })
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        if (active) setUrl(objectUrl);
        else URL.revokeObjectURL(objectUrl);
      })
      .catch(() => {
        if (active)
          setError(
            'Evidence photo could not be loaded. Retry by reopening the record.',
          );
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id, token]);
  return error ? (
    <p role="alert">{error}</p>
  ) : url ? (
    <img
      className="evidence-photo"
      src={url}
      alt="Original product evidence for this scan"
    />
  ) : (
    <p role="status">Loading original evidence…</p>
  );
}
