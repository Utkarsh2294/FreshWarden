export function sortFefo(lots) {
  const time = (value) =>
    value && Number.isFinite(+new Date(value)) ? +new Date(value) : Infinity;
  return [...lots].sort(
    (a, b) =>
      time(a.effectiveExpDate || a.expDate) -
        time(b.effectiveExpDate || b.expDate) ||
      time(a.createdAt) - time(b.createdAt) ||
      String(a._id).localeCompare(String(b._id)),
  );
}
