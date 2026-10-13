/**
 * The `relay` command line: reads the command and its options, runs it, and
 * turns errors into a clear message and exit code 1.
 */
import { parseArgs } from 'node:util';

import type { CliContext } from './context.js';
import { pause, resume, start, stop } from './control.js';
import { init, undo } from './init.js';
import { log } from './log.js';
import { status } from './status.js';

export const HELP = `relay: pass messages between a lead and a builder Claude Code session.

Usage:
  relay init <project-path> [--name <name>] [--delivery rewake|blocking] [--max-rounds <n>]
                              Set up a project: creates <project>-lead next to it.
  relay init --undo [path]    Remove everything init added.
  relay start [path]          Make the project ready for a new run.
  relay status [path]         Show who has the baton, rounds, waiters, flags.
  relay log [path] [--limit <n>] [--full]
                              Show the activity log.
  relay pause [path]          Hold messages until resume.
  relay resume [path]         Deliver held messages again.
  relay stop [path]           End the run; sessions stop waiting.

[path] is the project folder or its lead folder (default: the current folder).`;

function positiveInteger(value: string | undefined, option: string): number | undefined {
  if (value === undefined) return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1)
    throw new Error(`${option} must be a whole number of at least 1.`);
  return n;
}

/** Runs one `relay` command. Returns the process exit code. */
export async function runCli(argv: string[], ctx: CliContext): Promise<number> {
  try {
    const { values, positionals } = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        undo: { type: 'boolean' },
        name: { type: 'string' },
        delivery: { type: 'string' },
        'max-rounds': { type: 'string' },
        limit: { type: 'string' },
        full: { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
      },
    });
    const [command, folder, ...extra] = positionals;
    if (values.help || command === undefined || command === 'help') {
      ctx.print(HELP);
      return 0;
    }
    if (extra.length > 0) throw new Error(`Unexpected argument: ${extra.join(' ')}`);

    switch (command) {
      case 'init': {
        if (values.undo) {
          await undo(ctx, folder);
          return 0;
        }
        if (!folder) throw new Error('Usage: relay init <project-path>');
        const delivery = values.delivery;
        if (delivery !== undefined && delivery !== 'rewake' && delivery !== 'blocking') {
          throw new Error('--delivery must be "rewake" or "blocking".');
        }
        const maxRounds = positiveInteger(values['max-rounds'], '--max-rounds');
        await init(ctx, folder, {
          ...(values.name ? { name: values.name } : {}),
          ...(delivery ? { delivery } : {}),
          ...(maxRounds ? { maxRounds } : {}),
        });
        return 0;
      }
      case 'start':
        await start(ctx, folder);
        return 0;
      case 'status':
        await status(ctx, folder);
        return 0;
      case 'log': {
        const limit = positiveInteger(values.limit, '--limit');
        await log(ctx, folder, {
          ...(limit ? { limit } : {}),
          ...(values.full ? { full: true } : {}),
        });
        return 0;
      }
      case 'pause':
        await pause(ctx, folder);
        return 0;
      case 'resume':
        await resume(ctx, folder);
        return 0;
      case 'stop':
        await stop(ctx, folder);
        return 0;
      default:
        throw new Error(`Unknown command "${command}". Run "relay help" to see the commands.`);
    }
  } catch (error) {
    ctx.print(`relay: ${(error as Error).message}`);
    return 1;
  }
}
