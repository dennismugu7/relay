#!/usr/bin/env node
// The `relay` command. npm link puts it on your PATH (see README).
import { runCli } from '../cli.js';
import { realContext } from '../context.js';

process.exitCode = await runCli(process.argv.slice(2), realContext());
