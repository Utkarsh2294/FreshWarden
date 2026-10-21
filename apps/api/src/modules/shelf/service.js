import { ShelfScan } from './model.js';
import { shelfSchema, shelfJsonSchema, dueForSeverity } from './schema.js';
import { shelfAuditPrompt } from '../../llm/prompts/shelfAudit.js';
import { saveEvidence } from '../inward/evidence.js';
import { Store, User } from '../../models/index.js';
import { Incident } from '../incidents/model.js';
import { getRule } from '../../rules/index.js';
import { fail } from '../../middleware/error.js';
import { emitStore } from '../../realtime.js';
export async function createFindingTask(scan, finding) {
  const owner = (
    await User.findOne({ role: 'manager', storeIds: scan.storeId }).lean()
  )?._id;
  const incident = await Incident.findOneAndUpdate(
    { dedupeKey: `shelf:${scan.storeId}:${scan.zoneId}:${finding.type}` },
    {
      $set: {
        storeId: scan.storeId,
        zoneId: scan.zoneId,
        type: finding.type,
        severity: finding.severity,
        summary: finding.note,
        sourceRef: String(scan._id),
        evidenceId: scan.evidenceId,
        owner,
        dueAt: dueForSeverity(finding.severity),
        status: 'open',
      },
      $unset: { capa: '' },
    },
    { upsert: true, new: true },
  );
  emitStore(scan.storeId, 'incident:new', { incidentId: incident._id });
  return incident;
}
export async function scanShelf({ file, storeId, zoneId, userId, gateway }) {
  const store = await Store.findById(storeId).lean();
  if (!store?.zones.some((z) => z.zoneId === zoneId))
    throw fail(400, 'UNKNOWN_ZONE', 'Choose a configured zone.');
  const { evidence, buffer } = await saveEvidence({
      file,
      storeId,
      userId,
      kind: 'shelf',
    }),
    existing = await ShelfScan.findOne({
      storeId,
      zoneId,
      sha256: evidence.sha256,
    });
  if (existing) return existing;
  const rule = await getRule('shelf'),
    response = await gateway.image({
      buffer,
      purpose: 'shelf-audit-v1',
      prompt: shelfAuditPrompt,
      schema: shelfSchema,
      jsonSchema: shelfJsonSchema,
    });
  const result = response.data || {
    photoQuality: 'poor',
    poorReason: 'Photo analysis unavailable. A human must inspect this shelf.',
    findings: [],
    overallImpression: 'Not evaluated.',
  };
  const status = !response.data
      ? 'needs_human'
      : result.photoQuality === 'poor'
        ? 'retake'
        : 'reviewed',
    score =
      status === 'reviewed'
        ? Math.max(
            0,
            100 -
              result.findings.reduce(
                (sum, f) =>
                  sum +
                  (f.confidence >= rule.params.minConfidence
                    ? f.severity * 10
                    : 0),
                0,
              ),
          )
        : null;
  let created = true;
  const scan = await ShelfScan.create({
    storeId,
    zoneId,
    evidenceId: evidence._id,
    userId,
    sha256: evidence.sha256,
    result,
    status,
    score,
    ruleVersion: rule.version,
  }).catch(async (error) => {
    if (error.code !== 11000) throw error;
    const saved = await ShelfScan.findOne({
      storeId,
      zoneId,
      sha256: evidence.sha256,
    });
    if (!saved) throw error;
    created = false;
    return saved;
  });
  if (!created) return scan;
  if (status === 'reviewed')
    for (const type of new Set(
      result.findings
        .filter((f) => f.confidence >= rule.params.minConfidence)
        .map((f) => f.type),
    )) {
      const finding = result.findings
        .filter((f) => f.type === type)
        .sort((a, b) => b.severity - a.severity)[0];
      await createFindingTask(scan, finding);
    }
  return scan;
}
export async function scanSchedule(storeId, zoneId, now = new Date()) {
  const rule = await getRule('shelf'),
    latest = await ShelfScan.findOne({ storeId, zoneId, status: 'reviewed' })
      .sort({ createdAt: -1 })
      .lean(),
    store = await Store.findById(storeId).lean();
  const base = latest?.createdAt || store?.createdAt || now,
    dueAt = new Date(+base + rule.params.scanEveryHours * 3600000);
  return { lastScan: latest?._id || null, dueAt, overdue: dueAt < now };
}
export async function flagMissedScan(storeId, zoneId, now = new Date()) {
  const schedule = await scanSchedule(storeId, zoneId, now);
  if (!schedule.overdue) return;
  const dedupeKey = `scan-missed:${storeId}:${zoneId}:${schedule.dueAt.toISOString()}`;
  const result = await Incident.updateOne(
    { dedupeKey },
    {
      $setOnInsert: {
        storeId,
        zoneId,
        type: 'SCAN_MISSED',
        severity: 2,
        summary: 'Scheduled shelf evidence is overdue.',
        sourceRef: String(schedule.lastScan || zoneId),
        dueAt: now,
      },
    },
    { upsert: true },
  );
  if (result.upsertedCount)
    emitStore(storeId, 'incident:new', { type: 'SCAN_MISSED', zoneId });
}
