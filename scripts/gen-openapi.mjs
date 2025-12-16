import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const repoRoot = path.resolve(__dirname, '..');
const apiDir = path.join(repoRoot, 'apps', 'api');

const result = spawnSync('py', ['scripts/export_openapi.py'], {
  cwd: apiDir,
  stdio: 'inherit'
});

process.exit(result.status ?? 1);
