/**
 * Test helper: starts copies of concurrent-worker.ts as separate Node
 * processes at the same moment, and waits for all of them to finish.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const worker = path.join(here, 'concurrent-worker.ts');
// `--import tsx` lets Node run TypeScript directly. It is resolved from the
// current folder, so run from the repo root, where tsx is installed.
const repoRoot = path.resolve(here, '..', '..', '..', '..');

export interface WorkerResult {
  name: string;
  code: number | null;
  stderr: string;
}

export function runWorkers(
  dir: string,
  count: number,
  mode: 'state' | 'activity',
  names: string[],
): Promise<WorkerResult[]> {
  return Promise.all(
    names.map(
      (name) =>
        new Promise<WorkerResult>((resolve) => {
          const child = spawn(
            process.execPath,
            ['--import', 'tsx', worker, dir, String(count), mode, name],
            { cwd: repoRoot },
          );
          let stderr = '';
          child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
          child.on('close', (code) => resolve({ name, code, stderr }));
        }),
    ),
  );
}
