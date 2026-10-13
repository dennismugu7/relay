/**
 * Atomic file writes.
 *
 * Writing a file in place can leave it half-written if the process dies
 * mid-write, and a reader can see a half-written file at any time. Instead we
 * write a temporary file next to it, then rename it over the real one. A
 * rename within one folder replaces the file in a single step, so readers see
 * either the whole old file or the whole new one. See ADR 0003.
 */
import { randomUUID } from 'node:crypto';
import { rename as fsRename, rm, writeFile } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';

// On Windows, a rename can fail for a moment while another process (an
// antivirus scanner, or a reader) has the target file open.
const RETRY_CODES = new Set(['EPERM', 'EACCES', 'EBUSY']);

/**
 * Renames `from` to `to`, retrying briefly on the temporary Windows errors.
 * `rename` can be swapped out in tests.
 */
export async function renameWithRetry(
  from: string,
  to: string,
  rename: (from: string, to: string) => Promise<void> = fsRename,
  attempts = 10,
): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await rename(from, to);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code ?? '';
      if (!RETRY_CODES.has(code) || attempt >= attempts) throw error;
      await sleep(attempt * 10);
    }
  }
}

/** Replaces `file` with `data` in one step: write a temp file, then rename it. */
export async function writeFileAtomic(file: string, data: string): Promise<void> {
  const temp = `${file}.${process.pid}.${randomUUID().slice(0, 8)}.tmp`;
  try {
    await writeFile(temp, data, 'utf8');
    await renameWithRetry(temp, file);
  } catch (error) {
    await rm(temp, { force: true });
    throw error;
  }
}
