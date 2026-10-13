/**
 * The JSON that Claude Code sends a hook on stdin.
 *
 * Only the fields Relay uses are read. Spike 001 recorded a real Stop input:
 * `session_id`, `transcript_path`, `cwd`, `hook_event_name`,
 * `last_assistant_message`, `stop_hook_active`, and more.
 */

export interface HookInput {
  sessionId: string;
  /** Claude's final reply. Only present for Stop hooks. */
  lastAssistantMessage: string;
}

/** Thrown when stdin isn't the JSON a hook expects. */
export class InputError extends Error {
  override name = 'InputError';
}

export function parseHookInput(text: string): HookInput {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new InputError('Hook input is not valid JSON.');
  }
  const raw = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>;
  if (typeof raw.session_id !== 'string' || raw.session_id === '') {
    throw new InputError('Hook input has no session_id.');
  }
  const last = raw.last_assistant_message;
  return {
    sessionId: raw.session_id,
    lastAssistantMessage: typeof last === 'string' ? last : '',
  };
}
