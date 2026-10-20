import { Rule } from '../models/index.js';
import { fail } from '../middleware/error.js';
const cache = new Map();
export async function getRule(key) {
  const item = cache.get(key);
  if (item && item.expires > Date.now()) return item.rule;
  const rule = await Rule.findOne({ key, effectiveFrom: { $lte: new Date() } })
    .sort({ effectiveFrom: -1, createdAt: -1 })
    .lean();
  if (!rule)
    throw fail(
      503,
      'RULE_UNAVAILABLE',
      `Active rule ${key} is unavailable. Ask an administrator to seed rules.`,
    );
  cache.set(key, { rule, expires: Date.now() + 60000 });
  return rule;
}
export function clearRuleCache() {
  cache.clear();
}
