/**
 * Shared by the two scripts in this folder: read all of stdin, run the hook,
 * write its output and set the exit code.
 */
import { realDeps } from '../deps.js';
import { type HookEvent, runHook } from '../main.js';

async function readStdin(): Promise<string> {
  let text = '';
  for await (const chunk of process.stdin) text += String(chunk);
  return text;
}

export async function main(event: HookEvent): Promise<void> {
  const output = await runHook(event, process.argv.slice(2), await readStdin(), realDeps());
  if (output.stdout) process.stdout.write(output.stdout);
  if (output.stderr) process.stderr.write(output.stderr);
  // Setting exitCode (instead of calling process.exit) lets Node finish
  // writing stdout and stderr before the process ends.
  process.exitCode = output.exitCode;
}
