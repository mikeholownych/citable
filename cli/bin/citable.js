#!/usr/bin/env node
import { main } from '../../src/cli/index.js';

const code = await main(process.argv.slice(2));
if (Number.isInteger(code)) process.exitCode = code;
