import { useEffect, useState } from 'react';
import { loadDraft, saveDraft, clearDraft } from '../lib/capture.js';
export function usePhotoDraft(key) {
  const [file, setFile] = useState(null),
    [url, setUrl] = useState('');
  useEffect(() => {
    let active = true;
    loadDraft(key)
      .then((d) => {
        if (active && d?.file) setFile(d.file);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [key]);
  useEffect(() => {
    if (!file) {
      setUrl('');
      return;
    }
    saveDraft(key, { file }).catch(() => {});
    const value = URL.createObjectURL(file);
    setUrl(value);
    return () => URL.revokeObjectURL(value);
  }, [file, key]);
  return {
    file,
    url,
    setFile,
    clear: async () => {
      await clearDraft(key);
      setFile(null);
    },
  };
}
