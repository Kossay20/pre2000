#!/usr/bin/env node
/**
 * Refuse to run the verification gate on a Node version the toolchain does not
 * support.
 *
 * `.nvmrc` pins 20.20.2, but nothing enforced it: this machine's nvm default is
 * 18, and on Node 18 `expo-doctor` and `expo export` exit non-zero with a message
 * that is easy to read as a project error rather than an environment one. Worse,
 * a gate that "passes" because the tool never ran is the kind of green that costs
 * a release.
 *
 * Runs automatically as `npm run verify`'s pre-script.
 */
const { readFileSync } = require('fs');
const { join } = require('path');

const REQUIRED_MAJOR = 20;
const REQUIRED_MINOR = 19;

const [major, minor] = process.versions.node.split('.').map(Number);
const tooOld = major < REQUIRED_MAJOR || (major === REQUIRED_MAJOR && minor < REQUIRED_MINOR);

if (!tooOld) process.exit(0);

let pinned = `${REQUIRED_MAJOR}.${REQUIRED_MINOR}`;
try {
  pinned = readFileSync(join(__dirname, '..', '.nvmrc'), 'utf8').trim() || pinned;
} catch {
  /* .nvmrc is advisory here; the version check above is the real gate */
}

console.error(
  [
    '',
    `  Node ${process.versions.node} is too old for this project.`,
    `  Required: >= ${REQUIRED_MAJOR}.${REQUIRED_MINOR}   ·   pinned in .nvmrc: ${pinned}`,
    '',
    '    nvm use            # reads .nvmrc',
    `    nvm install ${pinned}  # if it is not installed yet`,
    '',
    '  Expo SDK 54 tooling (expo-doctor, expo export, prebuild) fails on Node 18',
    '  with errors that look like project errors. Fix the shell, not the code.',
    '',
  ].join('\n'),
);
process.exit(1);
