#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const SCRIPT_VERSION = '1.0.0';
const SEMVER_PATTERN = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-(?:(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+(?:[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/u;
const PROTECTED_REF_PATTERN = /^refs\/(?:heads|remotes)\/[A-Za-z0-9][A-Za-z0-9._/-]*$/u;
const RELEASE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;
const SAFE_ENVIRONMENT_KEYS = new Set([
  'COMSPEC',
  'PATH',
  'PATHEXT',
  'SYSTEMROOT',
  'TEMP',
  'TMP',
  'TMPDIR',
  'WINDIR'
]);

function releaseRefError(message) {
  return new Error(`release-ref: ${message}`);
}

function assertString(value, label) {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.trim() !== value ||
    /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    throw releaseRefError(`${label} must be a non-empty, trimmed string without control characters`);
  }
  return value;
}

function safeGitEnvironment() {
  const environment = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (SAFE_ENVIRONMENT_KEYS.has(key.toUpperCase()) && value !== undefined) {
      environment[key] = value;
    }
  }

  const nullDevice = process.platform === 'win32' ? 'NUL' : '/dev/null';
  Object.assign(environment, {
    GIT_ATTR_NOSYSTEM: '1',
    GIT_CONFIG_COUNT: '0',
    GIT_CONFIG_GLOBAL: nullDevice,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_SYSTEM: nullDevice,
    GIT_DISCOVERY_ACROSS_FILESYSTEM: '0',
    GIT_LITERAL_PATHSPECS: '1',
    GIT_NO_LAZY_FETCH: '1',
    GIT_NO_REPLACE_OBJECTS: '1',
    GIT_OPTIONAL_LOCKS: '0',
    GIT_TERMINAL_PROMPT: '0',
    LANG: 'C',
    LC_ALL: 'C'
  });
  return environment;
}

function runGit(repositoryRoot, argumentsList, { acceptedStatuses = [0], encoding = 'utf8' } = {}) {
  const nullDevice = process.platform === 'win32' ? 'NUL' : '/dev/null';
  const result = spawnSync(
    'git',
    [
      '--no-pager',
      '--no-replace-objects',
      '-c', 'core.fsmonitor=false',
      '-c', `core.hooksPath=${nullDevice}`,
      '-c', 'core.pager=cat',
      '-C', repositoryRoot,
      ...argumentsList
    ],
    {
      encoding,
      env: safeGitEnvironment(),
      maxBuffer: 16 * 1024 * 1024,
      windowsHide: true
    }
  );

  if (result.error) {
    throw releaseRefError(`cannot execute Git: ${result.error.message}`);
  }
  if (result.signal) {
    throw releaseRefError(`Git was terminated by signal ${result.signal}`);
  }
  if (!acceptedStatuses.includes(result.status)) {
    const stderr = Buffer.isBuffer(result.stderr)
      ? result.stderr.toString('utf8').trim()
      : String(result.stderr || '').trim();
    const detail = stderr ? `: ${stderr.split(/\r?\n/u)[0]}` : '';
    throw releaseRefError(`Git command failed (${argumentsList[0]})${detail}`);
  }
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr
  };
}

function gitText(repositoryRoot, argumentsList) {
  return String(runGit(repositoryRoot, argumentsList).stdout).replace(/\r?\n$/u, '');
}

function assertFsckConfigurationIsolated(repositoryRoot) {
  const result = runGit(
    repositoryRoot,
    ['config', '--null', '--show-origin', '--get-regexp', '^[fF][sS][cC][kK]\\.'],
    { acceptedStatuses: [0, 1], encoding: null }
  );
  const output = Buffer.from(result.stdout || []);
  if (result.status !== 1 || output.byteLength !== 0) {
    throw releaseRefError('repository Git fsck configuration overrides are not allowed');
  }
}

function parseObjectFormat(value) {
  if (value !== 'sha1' && value !== 'sha256') {
    throw releaseRefError(`unsupported Git object format: ${value || '(empty)'}`);
  }
  return value;
}

function oidPattern(objectFormat) {
  return objectFormat === 'sha1' ? /^[0-9a-f]{40}$/u : /^[0-9a-f]{64}$/u;
}

function assertOid(value, objectFormat, label) {
  if (!oidPattern(objectFormat).test(value)) {
    throw releaseRefError(`${label} must be a full lowercase ${objectFormat} object ID`);
  }
  return value;
}

function resolveExactRef(repositoryRoot, refName, objectFormat, label) {
  let value;
  try {
    value = gitText(repositoryRoot, ['show-ref', '--verify', '--hash', refName]);
  } catch {
    throw releaseRefError(`${label} does not resolve to an exact repository ref: ${refName}`);
  }
  if (value.includes('\n') || value.includes('\r')) {
    throw releaseRefError(`${label} resolved ambiguously: ${refName}`);
  }
  return assertOid(value, objectFormat, `${label} object ID`);
}

function objectType(repositoryRoot, oid, label) {
  const type = gitText(repositoryRoot, ['cat-file', '-t', oid]);
  if (!/^[a-z]+$/u.test(type)) throw releaseRefError(`${label} has an invalid Git object type`);
  return type;
}

function hashGitObject(type, bytes, objectFormat) {
  return createHash(objectFormat)
    .update(Buffer.from(`${type} ${bytes.length}\0`, 'utf8'))
    .update(bytes)
    .digest('hex');
}

function assertReleaseDate(value) {
  assertString(value, 'expectedReleaseDate');
  if (!RELEASE_DATE_PATTERN.test(value)) {
    throw releaseRefError('expectedReleaseDate must use canonical YYYY-MM-DD syntax');
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value) {
    throw releaseRefError('expectedReleaseDate must be a real calendar date');
  }
  return value;
}

function parseTagger(value) {
  const match = /^tagger (.+) ([0-9]+) ([+-])(\d{2})(\d{2})$/u.exec(value);
  if (!match) throw releaseRefError('annotated tag has a malformed tagger header');

  const seconds = Number(match[2]);
  const hours = Number(match[4]);
  const minutes = Number(match[5]);
  if (!Number.isSafeInteger(seconds) || hours > 14 || minutes > 59 || (hours === 14 && minutes !== 0)) {
    throw releaseRefError('annotated tag has an invalid tagger timestamp or timezone');
  }

  const direction = match[3] === '+' ? 1 : -1;
  const offsetMinutes = direction * ((hours * 60) + minutes);
  const localTime = new Date((seconds * 1000) + (offsetMinutes * 60 * 1000));
  if (Number.isNaN(localTime.valueOf())) {
    throw releaseRefError('annotated tag timestamp is outside the supported calendar range');
  }

  const localIso = localTime.toISOString().slice(0, 19);
  const timezone = `${match[3]}${match[4]}:${match[5]}`;
  return {
    calendarDate: localIso.slice(0, 10),
    taggedAt: `${localIso}${timezone}`
  };
}

function parseAnnotatedTag(bytes, { tag, objectFormat }) {
  const text = bytes.toString('utf8');
  if (!Buffer.from(text, 'utf8').equals(bytes)) {
    throw releaseRefError('annotated tag object is not valid UTF-8');
  }
  const separator = text.indexOf('\n\n');
  if (separator < 0) throw releaseRefError('annotated tag object is missing its header terminator');
  const headers = text.slice(0, separator).split('\n');
  if (headers.length !== 4 || headers.some(header => header.includes('\r'))) {
    throw releaseRefError('annotated tag must contain exactly object, type, tag, and tagger headers');
  }

  const objectMatch = /^object ([0-9a-f]+)$/u.exec(headers[0]);
  if (!objectMatch) throw releaseRefError('annotated tag has a malformed object header');
  const target = assertOid(objectMatch[1], objectFormat, 'annotated tag target');
  if (headers[1] !== 'type commit') {
    throw releaseRefError('annotated tag must directly target a commit');
  }
  if (headers[2] !== `tag ${tag}`) {
    throw releaseRefError('annotated tag header does not match the requested release tag');
  }
  return {
    target,
    ...parseTagger(headers[3])
  };
}

function assertVersionAndTag(expectedVersion, tag) {
  assertString(expectedVersion, 'expectedVersion');
  assertString(tag, 'tag');
  if (expectedVersion.length > 120) throw releaseRefError('expectedVersion is unreasonably long');
  if (!SEMVER_PATTERN.test(expectedVersion)) {
    throw releaseRefError('expectedVersion must be a strict semantic version');
  }
  const expectedTag = `v${expectedVersion}`;
  if (tag !== expectedTag) {
    throw releaseRefError(`tag must be exactly ${expectedTag}`);
  }
  if (tag.length > 128) throw releaseRefError('release tag is unreasonably long');
  return `refs/tags/${tag}`;
}

function assertProtectedRef(repositoryRoot, protectedMainRef) {
  assertString(protectedMainRef, 'protectedMainRef');
  if (
    protectedMainRef.length > 1024 ||
    !PROTECTED_REF_PATTERN.test(protectedMainRef) ||
    protectedMainRef.includes('//') ||
    protectedMainRef.includes('..') ||
    protectedMainRef.endsWith('.') ||
    protectedMainRef.endsWith('/') ||
    protectedMainRef.endsWith('/HEAD') ||
    protectedMainRef.includes('@{')
  ) {
    throw releaseRefError('protectedMainRef must be a canonical refs/heads/* or refs/remotes/* ref');
  }
  const checked = runGit(repositoryRoot, ['check-ref-format', protectedMainRef], { acceptedStatuses: [0, 1] });
  if (checked.status !== 0) throw releaseRefError('protectedMainRef is not a valid Git ref name');

  const symbolic = runGit(repositoryRoot, ['symbolic-ref', '--quiet', protectedMainRef], { acceptedStatuses: [0, 1] });
  if (symbolic.status === 0) throw releaseRefError('protectedMainRef must not be symbolic');
  return protectedMainRef;
}

async function canonicalRepositoryRoot(repositoryRoot) {
  assertString(repositoryRoot, 'repositoryRoot');
  if (!path.isAbsolute(repositoryRoot)) {
    throw releaseRefError('repositoryRoot must be an absolute path');
  }

  const resolved = path.resolve(repositoryRoot);
  let stat;
  let canonical;
  try {
    [stat, canonical] = await Promise.all([lstat(resolved), realpath(resolved)]);
  } catch (error) {
    throw releaseRefError(`repositoryRoot is unavailable: ${error.message}`);
  }
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw releaseRefError('repositoryRoot must be a real directory, not a symbolic link');
  }
  if (path.relative(resolved, canonical) !== '') {
    throw releaseRefError('repositoryRoot must be its canonical filesystem path');
  }

  let topLevel;
  try {
    topLevel = await realpath(gitText(canonical, ['rev-parse', '--show-toplevel']));
  } catch (error) {
    throw releaseRefError(`repositoryRoot is not a Git worktree: ${error.message}`);
  }
  if (path.relative(canonical, topLevel) !== '') {
    throw releaseRefError('repositoryRoot must be the canonical Git worktree root');
  }
  return canonical;
}

function assertRefsUnchanged(repositoryRoot, initial, objectFormat) {
  const finalTagObject = resolveExactRef(repositoryRoot, initial.tagRef, objectFormat, 'release tag');
  const finalProtectedCommit = resolveExactRef(
    repositoryRoot,
    initial.protectedMainRef,
    objectFormat,
    'protected main ref'
  );
  const finalHead = assertOid(
    gitText(repositoryRoot, ['rev-parse', '--verify', 'HEAD']),
    objectFormat,
    'HEAD'
  );
  if (
    finalTagObject !== initial.tagObject ||
    finalProtectedCommit !== initial.protectedMainCommit ||
    finalHead !== initial.head
  ) {
    throw releaseRefError('release refs changed while they were being verified');
  }
}

export async function verifyReleaseRef({
  repositoryRoot,
  tag,
  protectedMainRef,
  expectedVersion,
  expectedReleaseDate,
  expectedCommit
} = {}) {
  const tagRef = assertVersionAndTag(expectedVersion, tag);
  const releaseDate = assertReleaseDate(expectedReleaseDate);
  const root = await canonicalRepositoryRoot(repositoryRoot);
  assertProtectedRef(root, protectedMainRef);

  const objectFormat = parseObjectFormat(gitText(root, ['rev-parse', '--show-object-format']));
  const shallowState = gitText(root, ['rev-parse', '--is-shallow-repository']);
  if (shallowState !== 'false') {
    throw releaseRefError('release verification requires a complete, non-shallow repository');
  }
  assertString(expectedCommit, 'expectedCommit');
  assertOid(expectedCommit, objectFormat, 'expectedCommit');

  const head = assertOid(gitText(root, ['rev-parse', '--verify', 'HEAD']), objectFormat, 'HEAD');
  if (objectType(root, head, 'HEAD') !== 'commit') {
    throw releaseRefError('HEAD must directly identify a commit');
  }
  if (head !== expectedCommit) {
    throw releaseRefError('expectedCommit must equal the full HEAD commit');
  }

  const tagObject = resolveExactRef(root, tagRef, objectFormat, 'release tag');
  if (objectType(root, tagObject, 'release tag') !== 'tag') {
    throw releaseRefError('release ref must identify an annotated tag object');
  }
  const tagBytes = runGit(root, ['cat-file', 'tag', tagObject], { encoding: null }).stdout;
  const computedTagObject = hashGitObject('tag', tagBytes, objectFormat);
  if (computedTagObject !== tagObject) {
    throw releaseRefError('annotated tag bytes do not match the release tag object ID');
  }
  const parsedTag = parseAnnotatedTag(tagBytes, { tag, objectFormat });
  if (objectType(root, parsedTag.target, 'annotated tag target') !== 'commit') {
    throw releaseRefError('annotated tag target is not a commit object');
  }
  if (parsedTag.target !== head || parsedTag.target !== expectedCommit) {
    throw releaseRefError('annotated tag must directly target HEAD and expectedCommit');
  }
  if (parsedTag.calendarDate !== releaseDate) {
    throw releaseRefError(
      `annotated tag calendar date ${parsedTag.calendarDate} does not match expectedReleaseDate ${releaseDate}`
    );
  }

  const protectedMainCommit = resolveExactRef(root, protectedMainRef, objectFormat, 'protected main ref');
  if (objectType(root, protectedMainCommit, 'protected main ref') !== 'commit') {
    throw releaseRefError('protectedMainRef must directly identify a commit');
  }

  const ancestor = runGit(
    root,
    ['merge-base', '--is-ancestor', parsedTag.target, protectedMainCommit],
    { acceptedStatuses: [0, 1] }
  );
  if (ancestor.status !== 0) {
    throw releaseRefError('release tag commit is not reachable from protectedMainRef');
  }

  assertFsckConfigurationIsolated(root);
  try {
    runGit(root, [
      'fsck',
      '--strict',
      '--no-dangling',
      '--no-reflogs',
      tagObject,
      protectedMainCommit
    ]);
  } catch (error) {
    throw releaseRefError(`reachable Git objects failed strict validation: ${error.message}`);
  }
  assertFsckConfigurationIsolated(root);

  assertRefsUnchanged(root, {
    head,
    protectedMainCommit,
    protectedMainRef,
    tagObject,
    tagRef
  }, objectFormat);

  return Object.freeze({
    mode: 'annotated-tag',
    tagObject,
    tagCommit: parsedTag.target,
    taggedAt: parsedTag.taggedAt,
    protectedMainRef,
    protectedMainCommit,
    reachableFromProtectedMain: true
  });
}

function usage() {
  return [
    'Usage: node scripts/release-ref.mjs --repository-root <absolute-path> --tag <tag> \\',
    '  --protected-main-ref <full-ref> --expected-version <semver> \\',
    '  --expected-release-date <YYYY-MM-DD> --expected-commit <full-object-id>'
  ].join('\n');
}

function parseArguments(argumentsList) {
  const names = new Map([
    ['--repository-root', 'repositoryRoot'],
    ['--tag', 'tag'],
    ['--protected-main-ref', 'protectedMainRef'],
    ['--expected-version', 'expectedVersion'],
    ['--expected-release-date', 'expectedReleaseDate'],
    ['--expected-commit', 'expectedCommit']
  ]);
  const options = {};
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === '--help' || argument === '-h') return { help: true };
    const name = names.get(argument);
    if (!name) throw releaseRefError(`unknown argument: ${argument}`);
    if (Object.hasOwn(options, name)) throw releaseRefError(`duplicate argument: ${argument}`);
    index += 1;
    if (index >= argumentsList.length) throw releaseRefError(`${argument} requires a value`);
    options[name] = argumentsList[index];
  }
  const missing = [...names.values()].filter(name => !Object.hasOwn(options, name));
  if (missing.length > 0) throw releaseRefError(`missing required arguments: ${missing.join(', ')}`);
  return { help: false, options };
}

async function main() {
  const parsed = parseArguments(process.argv.slice(2));
  if (parsed.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  const result = await verifyReleaseRef(parsed.options);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

const executedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (executedPath === import.meta.url) {
  main().catch(error => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}

export const releaseRefConstants = Object.freeze({
  scriptVersion: SCRIPT_VERSION
});
