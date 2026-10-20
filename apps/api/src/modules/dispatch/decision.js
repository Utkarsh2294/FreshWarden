import { evaluateShelfLife } from '../../rules/shelfLife.js';
import { sortFefo } from '../../rules/fefo.js';
const text = {
  UNKNOWN_ITEM: [
    'This lot is not registered in this store.',
    'यह लॉट इस स्टोर में दर्ज नहीं है।',
  ],
  LOT_NOT_ACCEPTED: [
    'This lot is held or rejected. Do not pick it.',
    'यह लॉट रोका या अस्वीकार किया गया है। इसे न चुनें।',
  ],
  INSUFFICIENT_STOCK: [
    'There are not enough units in this lot.',
    'इस लॉट में पर्याप्त इकाइयाँ नहीं हैं।',
  ],
  UNSAFE_AT_DELIVERY: [
    'This item fails shelf-life checks at delivery time.',
    'डिलीवरी के समय यह पैक शेल्फ लाइफ जाँच में विफल है।',
  ],
  ZONE_UNSAFE: [
    'Temperature or sensor coverage is unsafe or unknown.',
    'तापमान या सेंसर कवरेज असुरक्षित या अज्ञात है।',
  ],
  FEFO_REQUIRED: [
    'Pick the earlier eligible lot first.',
    'पहले पहले समाप्त होने वाला योग्य लॉट चुनें।',
  ],
  NEAR_THRESHOLD: [
    'This item is close to the shelf-life threshold.',
    'यह पैक शेल्फ लाइफ सीमा के पास है।',
  ],
};
export const dispatchReason = (code) => ({
  code,
  text_en: text[code][0],
  text_hi: text[code][1],
});
export function decideDispatch({
  lot,
  qty,
  candidates = [],
  zone,
  now = new Date(),
  etaMinutes = 15,
  dispatchRule,
  shelfRule,
  allowFefoOverride = false,
}) {
  const reasons = [];
  if (!lot)
    return { verdict: 'block', reasons: [dispatchReason('UNKNOWN_ITEM')] };
  if (lot.status !== 'accepted') reasons.push('LOT_NOT_ACCEPTED');
  if (lot.qty < qty) reasons.push('INSUFFICIENT_STOCK');
  const deliveryAt = new Date(
      +now + (etaMinutes + dispatchRule.etaBufferMin) * 60000,
    ),
    shelf = evaluateShelfLife({
      mfgDate: lot.mfgDate,
      expDate: lot.effectiveExpDate || lot.expDate,
      now: deliveryAt,
      rule: shelfRule,
    });
  if (
    shelf.status === 'red' ||
    shelf.reasons.some((r) => r !== 'NEAR_THRESHOLD')
  )
    reasons.push('UNSAFE_AT_DELIVERY');
  if (!zone || zone.status !== 'reporting' || zone.outside)
    reasons.push('ZONE_UNSAFE');
  const eligible = sortFefo(
    candidates.filter(
      (other) =>
        other.status === 'accepted' &&
        other.qty >= qty &&
        evaluateShelfLife({
          mfgDate: other.mfgDate,
          expDate: other.effectiveExpDate || other.expDate,
          now: deliveryAt,
          rule: shelfRule,
        }).status === 'green',
    ),
  );
  const earlier = eligible[0],
    fefo = earlier && String(earlier._id) !== String(lot._id);
  if (fefo && !allowFefoOverride) reasons.push('FEFO_REQUIRED');
  if (shelf.reasons.includes('NEAR_THRESHOLD')) reasons.push('NEAR_THRESHOLD');
  const hard = reasons.some(
    (code) =>
      ![
        'NEAR_THRESHOLD',
        ...(!dispatchRule.enforceFefo ? ['FEFO_REQUIRED'] : []),
      ].includes(code),
  );
  return {
    lotId: lot._id,
    qty,
    verdict: hard ? 'block' : reasons.length ? 'warn' : 'ok',
    reasons: reasons.map(dispatchReason),
    suggestLotId: fefo ? earlier._id : undefined,
    remainingDays: shelf.remainingDays,
    isFood: lot.productId?.isFood !== false,
    zoneId: lot.zoneId,
  };
}
