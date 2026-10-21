import { useEffect, useRef, useState } from 'react';
import { loadDraft, saveDraft, clearDraft } from '../lib/capture.js';
export function usePhotoDraft(key) {
  const [selection, setSelection] = useState(null),
    [url, setUrl] = useState(''),
    revision = useRef(0);
  const file = selection?.key === key ? selection.file : null;
  function setFile(value) {
    revision.current++;
    setSelection({ key, file: value });
    if (value) saveDraft(key, { file: value }).catch(() => {});
  }
  useEffect(() => {
    let active = true;
    const started = revision.current;
    loadDraft(key)
      .then((d) => {
        if (active && revision.current === started && d?.file)
          setSelection({ key, file: d.file });
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
