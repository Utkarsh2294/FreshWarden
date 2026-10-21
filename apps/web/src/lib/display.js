export const number = (value) =>
  Number.isFinite(value)
    ? new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(value)
    : 'Not available';
export function initials(name) {
  const words = name?.trim().split(/\s+/).filter(Boolean) || [];
  const first = (word) =>
    typeof Intl.Segmenter === 'function'
      ? [
          ...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(
            word,
          ),
        ][0]?.segment || ''
      : Array.from(word)[0] || '';
  return (
    [words[0], ...(words.length > 1 ? [words.at(-1)] : [])]
      .filter(Boolean)
      .map(first)
      .join('')
      .toUpperCase() || 'FW'
  );
}
