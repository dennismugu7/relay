/**
 * @relay/helper — the `relay` command line and the templates `relay init`
 * writes. There is no background process in Stage 1 (ADR 0005).
 */

/** The npm name of this package. Lets tests prove the package builds and loads. */
export const PACKAGE_NAME = '@relay/helper';

export { HELP, runCli } from './cli.js';
export type { CliContext } from './context.js';
