import { parseArgs } from 'node:util';
const { values } = parseArgs({
  options: {
    zone: { type: 'string', default: 'chiller-1' },
    device: { type: 'string', default: 'esp-chiller-01' },
    scenario: { type: 'string', default: 'normal' },
    speed: { type: 'string', default: '1x' },
  },
});
const api = process.env.API_URL || 'http://localhost:5000',
  key = process.env.DEVICE_KEY;
if (
  !['normal', 'door-open', 'compressor-fail', 'sensor-dead'].includes(
    values.scenario,
  )
)
  throw new Error('Unknown scenario');
if (values.speed !== '1x')
  throw new Error(
    'Use the manager development simulator UI for accelerated historical traces. Device ingestion preserves real time.',
  );
if (!key)
  throw new Error(
    'DEVICE_KEY is required. Register the device in the manager UI.',
  );
if (values.scenario === 'sensor-dead') {
  console.log(
    'No telemetry will be sent. A registered previously reporting sensor will become silent.',
  );
  process.exit();
}
let elapsed = 0;
console.log(
  `Sending explicitly simulated ${values.scenario} readings to ${api} for ${values.device}. Stop with Ctrl+C.`,
);
while (true) {
  const tempC =
    values.scenario === 'normal'
      ? 3
      : values.scenario === 'door-open'
        ? elapsed < 20
          ? 12
          : 3
        : 3 + Math.min(15, elapsed / 60);
  const response = await fetch(`${api}/api/telemetry`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-device-key': key },
    body: JSON.stringify({
      deviceId: values.device,
      zoneId: values.zone,
      tempC,
      humidity: 65,
      doorOpen: values.scenario === 'door-open' && elapsed < 20,
      ts: new Date().toISOString(),
    }),
  });
  console.log(
    `${new Date().toISOString()} ${tempC.toFixed(1)}°C HTTP ${response.status}`,
  );
  if (!response.ok) throw new Error(`Telemetry rejected (${response.status})`);
  await new Promise((r) =>
    setTimeout(
      r,
      values.scenario === 'door-open' && elapsed === 0 ? 20000 : 30000,
    ),
  );
  elapsed += values.scenario === 'door-open' && elapsed === 0 ? 20 : 30;
}
