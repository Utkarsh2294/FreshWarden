import PDFDocument from 'pdfkit';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const font = fileURLToPath(
  new URL(
    '../../../assets/fonts/NotoSansDevanagariUI-Regular.ttf',
    import.meta.url,
  ),
);
export async function renderAuditPdf(
  snapshot,
  { summary = { lines: [], provider: 'deterministic' }, photos = [] } = {},
) {
  const doc = new PDFDocument({
      size: 'A4',
      margin: 44,
      bufferPages: true,
      info: {
        Title: `FreshWarden audit - ${snapshot.store.name} - ${snapshot.date}`,
        Author: 'FreshWarden',
        Subject: 'Evidence-backed prototype operations snapshot',
      },
    }),
    chunks = [];
  const done = new Promise((resolve, reject) => {
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  doc.registerFont('Noto', font);
  doc.font('Helvetica');
  const width = doc.page.width - 88;
  const space = (h) => {
    if (doc.y + h > doc.page.height - 65) doc.addPage();
  };
  const text = (value, size = 9, color = '#53675b') => {
    const content = String(value),
      runs = content.split(/([\u0900-\u097f]+)/).filter(Boolean);
    doc.font('Helvetica').fontSize(size).fillColor(color);
    const h = doc.heightOfString(content, { width });
    space(h + 8);
    for (let i = 0; i < runs.length; i++) {
      doc.font(/[\u0900-\u097f]/.test(runs[i]) ? 'Noto' : 'Helvetica');
      const options = { width, lineGap: 3, continued: i < runs.length - 1 };
      if (i === 0) doc.text(runs[i], 44, doc.y, options);
      else doc.text(runs[i], options);
    }
    doc.font('Helvetica');
    doc.moveDown(0.35);
  };
  const heading = (title) => {
    space(55);
    doc.moveDown(0.8);
    text(title, 13, '#153e35');
    doc
      .moveTo(44, doc.y)
      .lineTo(doc.page.width - 44, doc.y)
      .strokeColor('#dfe6de')
      .stroke();
    doc.moveDown(0.7);
  };
  doc.rect(0, 0, doc.page.width, 106).fill('#153e35');
  doc
    .fillColor('#c5ef8c')
    .fontSize(10)
    .text('FRESHWARDEN / EVIDENCE REPORT', 44, 28);
  doc
    .fillColor('#fff')
    .fontSize(23)
    .text('The guardian on every shelf.', 44, 48, { width });
  doc.y = 130;
  text(snapshot.store.name, 18, '#153e35');
  text(
    `${snapshot.store.city || 'City not recorded'} | ${snapshot.date} | Licence: ${snapshot.store.fssaiLicenceNo || 'not available'}`,
    9,
  );
  text(
    `Generated ${new Date(snapshot.generatedAt).toISOString()} | ${snapshot.store.isDemo ? 'SYNTHETIC DEMONSTRATION DATA' : 'Recorded operational data'}`,
    8,
  );
  text(
    'Prototype parameters are unverified. This report is an operational evidence record, not a regulatory certificate.',
    9,
    '#92602c',
  );
  heading('Daily briefing');
  for (const line of summary.lines) text(line);
  text(`Summary selection: ${summary.provider}. ${snapshot.inventoryScope}`, 8);
  const counts = snapshot.counts;
  heading('Recorded activity');
  text(
    `Current lots: ${counts.lots} | Accepted lots: ${counts.acceptedLots} | Open incidents: ${counts.openIncidents}`,
  );
  text(
    `Inward checks: ${counts.inwardChecks} | Shelf scans: ${counts.shelfScans} | Readings: ${counts.readings}`,
  );
  text(
    `Dispatch checks: ${counts.dispatchChecks} | Blocks: ${counts.dispatchBlocks} | Packed orders: ${counts.packedOrders}`,
  );
  text(
    `Store health: ${snapshot.health.score === null ? 'Not available - evidence coverage incomplete' : `${snapshot.health.score}/100 (rule estimate)`}`,
  );
  heading('Evidence checklist');
  for (const item of snapshot.checklist) {
    text(
      `${item.status.toUpperCase().replaceAll('_', ' ')} - ${item.label}`,
      9,
      item.status === 'complete' ? '#376746' : '#92602c',
    );
    text(
      `Source records: ${item.refs.length ? item.refs.slice(0, 12).join(', ') : 'not available'}${item.refs.length > 12 ? ' (additional records in the JSON snapshot)' : ''}`,
      7,
    );
  }
  heading('Temperature evidence');
  for (const zone of snapshot.zones) {
    text(
      `${zone.name}: ${zone.status}; ${zone.readingCount} readings; configured ${zone.limits.minC} to ${zone.limits.maxC} C`,
      10,
      '#153e35',
    );
    if (!zone.points.length) {
      text(
        'Temperature trace not available. Missing readings do not prove safe storage.',
      );
      continue;
    }
    const temps = zone.points.map((p) => p.tempC),
      min = Math.min(...temps, zone.limits.minC) - 1,
      max = Math.max(...temps, zone.limits.maxC) + 1,
      scale = (t) => 100 - ((t - min) / (max - min)) * 90;
    const points = temps
      .map(
        (t, i) =>
          `${12 + (i / Math.max(1, temps.length - 1)) * 480},${scale(t)}`,
      )
      .join(' ');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="510" height="120"><rect width="510" height="120" fill="#f4f7f1"/><line x1="10" y1="${scale(zone.limits.maxC)}" x2="500" y2="${scale(zone.limits.maxC)}" stroke="#bd743c" stroke-dasharray="5 4"/><polyline fill="none" stroke="#3c735b" stroke-width="2" points="${points}"/></svg>`;
    const png = await sharp(Buffer.from(svg)).png().toBuffer();
    space(130);
    doc.image(png, 44, doc.y, { width, height: 120 });
    doc.y += 130;
  }
  heading('Excursions and estimated debits');
  if (!snapshot.excursions.length)
    text('No excursion record starts in this reporting period.');
  for (const e of snapshot.excursions)
    text(
      `${e.zoneId} | ${e.status} | peak ${e.peakC.toFixed(1)} C | ${e.minutesOutside.toFixed(1)} minutes | estimated debit ${e.debitDays.toFixed(4)} days | ${e.isDemo ? 'simulated' : 'sensor'} | source ${e._id}`,
    );
  heading('Incident and corrective-action register');
  if (!snapshot.incidents.length) text('No incidents recorded.');
  for (const item of snapshot.incidents.slice(0, 50)) {
    text(
      `${item.type} | severity ${item.severity} | ${item.status} | source ${item._id}`,
      9,
      '#153e35',
    );
    text(item.summary || 'Summary not available.');
    if (item.capa?.action) text(`Corrective action: ${item.capa.action}`);
    if (item.capa?.proofImageId)
      text(`Proof evidence: ${item.capa.proofImageId}`, 7);
  }
  heading('Current lot register');
  for (const lot of snapshot.lots.slice(0, 100)) {
    text(
      `${lot.name} | ${lot.batchNo || 'Batch not recorded'} | ${lot.qty} units | ${lot.status}`,
      9,
      '#153e35',
    );
    text(
      `Effective expiry: ${lot.effectiveExpDate ? new Date(lot.effectiveExpDate).toISOString() : 'not available'} | source ${lot._id} | rule ${lot.ruleVersion || 'not recorded'}`,
      7,
    );
  }
  if (photos.length) {
    heading('Evidence thumbnails');
    for (const photo of photos.slice(0, 6)) {
      space(150);
      const y = doc.y;
      doc.image(photo.buffer, 44, y, { fit: [width, 110] });
      doc.y = y + 116;
      text(`${photo.kind} | ${photo.id}`, 7);
    }
  }
  heading('Rule versions and traceability');
  for (const rule of snapshot.rules)
    text(`${rule.key}: ${rule.version} - ${rule.notes || 'No notes'}`, 8);
  text(`Evidence snapshot SHA-256: ${snapshot.snapshotHash}`, 7);
  text(
    'The PDF byte hash is returned in X-Report-SHA256 and retained in the AuditReport record. It excludes no bytes; the digest printed above covers the JSON evidence snapshot.',
    7,
  );
  const pages = doc.bufferedPageRange();
  for (let i = pages.start; i < pages.start + pages.count; i++) {
    doc.switchToPage(i);
    const bottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc
      .font('Helvetica')
      .fontSize(7)
      .fillColor('#83917d')
      .text(
        `FreshWarden | ${snapshot.date} | page ${i + 1} of ${pages.count}`,
        44,
        doc.page.height - 36,
        { lineBreak: false, width },
      );
    doc.page.margins.bottom = bottom;
  }
  doc.end();
  const buffer = await done;
  return { buffer, pdfHash: createHash('sha256').update(buffer).digest('hex') };
}
