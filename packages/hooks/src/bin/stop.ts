#!/usr/bin/env node
// The Stop hook script. Claude Code runs it after every reply (see ../stop.ts).
import { main } from './run.js';

await main('stop');
