import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnvFile } from 'node:process';

for (const file of ['.env.local', '.env']) {
  if (existsSync(file)) loadEnvFile(file);
}

if (!process.env.GEOAPIFY_API_KEY) {
  console.error('Live Geoapify integration tests require GEOAPIFY_API_KEY.');
  process.exitCode = 1;
} else {
  const result = spawnSync(
    process.execPath,
    [resolve('node_modules/vitest/vitest.mjs'), 'run', 'lib/providers/places.live.test.ts'],
    {
      env: { ...process.env, GEOAPIFY_LIVE_TESTS: '1' },
      stdio: 'inherit',
    },
  );
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}
