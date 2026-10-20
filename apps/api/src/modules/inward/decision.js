import { evaluateShelfLife, DAY, labelInstant } from '../../rules/shelfLife.js';
import { parseLabelDate } from '../../rules/parseLabelDate.js';
export function decideInward({
  fields,
  product,
  rule,
  now = new Date(),
  ocr = null,
  source = 'manual',
}) {
  const mfgDate = parseLabelDate(fields.mfgDate).iso,
    expDate = parseLabelDate(fields.expDate, { mfgDate }).iso;
  const extracted = { ...fields, mfgDate, expDate };
  const verdict = evaluateShelfLife({
    mfgDate,
    expDate,
    now,
    rule: rule.params,
  });
  const reasons = [...verdict.reasons];
  const catalogMatch =
    product &&
    mfgDate &&
    expDate &&
    Math.abs(
      (labelInstant(expDate) - labelInstant(mfgDate)) / DAY -
        product.shelfLifeDays,
    ) <=
      product.shelfLifeDays * 0.2;
  const ocrAgreement =
    ocr?.confidence >= 0.7 &&
    parseLabelDate(ocr.expDate).iso === expDate &&
    !!expDate;
  const hasTwoSignals =
    source === 'gemini'
      ? fields.confidence >= 0.7 && (catalogMatch || ocrAgreement)
      : source === 'ocr' && fields.confidence >= 0.7 && catalogMatch;
  if (!hasTwoSignals) reasons.push('TWO_SIGNALS_REQUIRED');
  if (!product) reasons.push('UNKNOWN_PRODUCT');
  if (!/^\d{14}$/.test(fields.fssaiNo || '')) reasons.push('LICENCE_NOT_READ');
  if (
    typeof fields.mrp !== 'number' ||
    !Number.isFinite(fields.mrp) ||
    fields.mrp < 0
  )
    reasons.push('MRP_NOT_READ');
  const status =
    verdict.status === 'red' ? 'red' : reasons.length ? 'amber' : 'green';
  return {
    ...verdict,
    status,
    reasons: [...new Set(reasons)],
    extracted,
    needsHuman: status === 'amber',
    ruleVersion: rule.version,
    source,
  };
}
