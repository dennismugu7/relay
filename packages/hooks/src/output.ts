/**
 * What a hook hands back to Claude Code: an exit code plus stdout/stderr.
 *
 * How a message reaches Claude depends on the delivery mode (ADR 0002):
 * - `rewake`:   write it to stderr and exit with code 2. The hook runs with
 *               `asyncRewake`, so this wakes the idle session (spike 005).
 * - `blocking`: print `additionalContext` JSON on stdout and exit 0. The
 *               session is still in its turn and continues with it (spike 001).
 */
import type { DeliveryMode } from '@relay/core';

export interface HookOutput {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/** Let the session stop (or, for a background waiter, end quietly). */
export const ALLOW_STOP: HookOutput = { exitCode: 0, stdout: '', stderr: '' };

/** Hand `text` to Claude as its next instruction. */
export function deliveryOutput(mode: DeliveryMode, text: string): HookOutput {
  if (mode === 'rewake') {
    return { exitCode: 2, stdout: '', stderr: text };
  }
  const json = { hookSpecificOutput: { hookEventName: 'Stop', additionalContext: text } };
  return { exitCode: 0, stdout: JSON.stringify(json), stderr: '' };
}
