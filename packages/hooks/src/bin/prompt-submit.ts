#!/usr/bin/env node
// The UserPromptSubmit hook script. Marks the session busy (see ../prompt-submit.ts).
import { main } from './run.js';

await main('prompt-submit');
