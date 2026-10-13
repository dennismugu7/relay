/**
 * @relay/core — shared types, message tag parsing, project config, and the
 * state and activity files that the hooks and the CLI share.
 *
 * Design: ADR 0002 (delivery) and ADR 0003 (state storage).
 */

/** The npm name of this package. Lets tests prove the package builds and loads. */
export const PACKAGE_NAME = '@relay/core';

export { hasBuriedCodeTag, parseTag, type Destination, type ParsedReply } from './tags.js';
export {
  CONFIG_FILE_NAME,
  ConfigError,
  DEFAULTS,
  isValidProjectName,
  loadConfig,
  parseConfig,
  type DeliveryMode,
  type RelayConfig,
} from './config.js';
export { ACTIVITY_FILE, relayHome, STATE_FILE, stateDir } from './paths.js';
export { LockTimeoutError, withLock, type LockOptions } from './lock.js';
export { writeFileAtomic } from './atomic.js';
export {
  clearWaiter,
  enqueueMessage,
  initialState,
  isCurrentWaiter,
  readState,
  registerWaiter,
  startRound,
  StateError,
  takeMessageFor,
  updateState,
  type QueuedMessage,
  type RelayState,
  type Role,
  type SessionState,
  type WaiterRecord,
} from './state.js';
export {
  appendActivity,
  readActivity,
  type ActivityEntry,
  type ActivityKind,
  type NewActivityEntry,
} from './activity.js';
