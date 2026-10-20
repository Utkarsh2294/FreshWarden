import { z } from 'zod';
import { reportSummaryPrompt } from '../../llm/prompts/reportSummary.js';
export function summaryFacts(snapshot) {
  return [
    {
      id: 'coverage',
      text: snapshot.coverageComplete
        ? 'The recorded checks provide coverage for this period.'
        : 'Evidence coverage is incomplete. Review the checklist before relying on this report.',
    },
    ...snapshot.risk.slice(0, 3).map((r) => ({
      id: `lot:${r.lotId}`,
      text: `${r.name}: ${r.status}; estimated risk ${r.score}/100.`,
    })),
    ...snapshot.incidents
      .filter((i) => !['closed', 'dismissed'].includes(i.status))
      .slice(0, 3)
      .map((i) => ({
        id: `incident:${i._id}`,
        text: `${i.type.replaceAll('_', ' ')}: ${i.summary || 'Review required.'}`,
      })),
  ];
}
export function selectFacts(facts, ids) {
  const allowed = new Map(facts.map((f) => [f.id, f.text]));
  if (!Array.isArray(ids) || ids.some((id) => !allowed.has(id))) return null;
  return [...new Set(ids)].slice(0, 4).map((id) => allowed.get(id));
}
export async function reportSummary(snapshot, gateway) {
  const facts = summaryFacts(snapshot),
    result = gateway.text
      ? await gateway.text({
          system: reportSummaryPrompt,
          user: JSON.stringify({ facts }),
          purpose: 'report-priority-v1',
          schema: z.object({ factIds: z.array(z.string()).max(4) }).strict(),
        })
      : { data: null };
  const selected = selectFacts(facts, result.data?.factIds);
  return {
    lines: selected?.length ? selected : facts.slice(0, 4).map((f) => f.text),
    provider: selected?.length ? result.provider : 'deterministic',
  };
}
