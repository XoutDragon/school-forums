import { execSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const serverRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Builds a fresh server/test.db before the suite runs. Deliberately a different file
 *  from dev.db so running tests never eats the seeded campus. */
export default function setup() {
  const dbPath = join(serverRoot, 'test.db');
  rmSync(dbPath, { force: true });
  rmSync(`${dbPath}-journal`, { force: true });

  execSync('npx prisma migrate deploy', {
    cwd: serverRoot,
    env: { ...process.env, DATABASE_URL: 'file:../test.db' },
    stdio: 'ignore',
  });
}
