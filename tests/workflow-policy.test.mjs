import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { parseDocument } from 'yaml';

import { parseStrictJson } from '../scripts/strict-json.mjs';

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VALIDATE_PATH = path.join(REPOSITORY_ROOT, '.github', 'workflows', 'validate.yml');
const PAGES_PATH = path.join(REPOSITORY_ROOT, '.github', 'workflows', 'pages.yml');
const PACKAGE_PATH = path.join(REPOSITORY_ROOT, 'package.json');
const PULL_REQUEST_ONLY = "github.event_name == 'pull_request'";
const EXPECTED_CANDIDATE_BUILD = [
  'npm run build:release-candidate -- --repository-root "${{ github.workspace }}" --commit "${{ github.sha }}" --output-directory "${{ runner.temp }}/release-candidate"',
  ''
].join('\n');
const EXPECTED_CLEAN_CHECK = [
  'set -euo pipefail',
  'test "$(git rev-parse HEAD)" = "$GITHUB_SHA"',
  'git diff --exit-code -- .',
  'test -z "$(git status --porcelain --untracked-files=all)"',
  ''
].join('\n');
const EXPECTED_BUILD_CLEAN_CHECK = [
  'git diff --exit-code -- .',
  'if [ -n "$(git status --porcelain --untracked-files=all)" ]; then',
  '  echo "The build produced untracked files. Commit all intended generated artifacts."',
  '  git status --short',
  '  exit 1',
  'fi',
  ''
].join('\n');
const EXPECTED_PAGES_BUILD = [
  'npm run build',
  'npm test',
  'git diff --exit-code -- .',
  'if [ -n "$(git status --porcelain --untracked-files=all)" ]; then',
  '  echo "The build produced untracked files. Refusing to publish an untracked source state."',
  '  git status --short',
  '  exit 1',
  'fi',
  ''
].join('\n');
const EXPECTED_PARITY_SCRIPT = [
  'set -euo pipefail',
  'root="$RUNNER_TEMP/candidates"',
  '',
  'for platform in ubuntu windows; do',
  '  directory="$root/$platform"',
  '  test "$(find "$directory" -mindepth 1 -maxdepth 1 -type f | wc -l)" -eq 4',
  '  test -z "$(find "$directory" -mindepth 1 -maxdepth 1 ! -type f -print -quit)"',
  '  (',
  '    cd "$directory"',
  '    shopt -s nullglob',
  '    sums=( *.SHA256SUMS )',
  '    test "${#sums[@]}" -eq 1',
  '    sha256sum --strict --check "${sums[0]}"',
  '  )',
  'done',
  '',
  'diff --recursive --brief --no-dereference \\',
  '  "$root/ubuntu" \\',
  '  "$root/windows"',
  '',
  '(',
  '  cd "$root/ubuntu"',
  '  sha256sum -- *',
  ')',
  ''
].join('\n');

const VALIDATION_ACTIONS = new Set([
  'actions/checkout@v7',
  'actions/download-artifact@v5',
  'actions/setup-node@v7',
  'actions/upload-artifact@v4'
]);
const PAGES_ACTIONS = new Set([
  'actions/checkout@v7',
  'actions/setup-node@v7',
  'actions/upload-pages-artifact@v5'
]);

function parseStrictYaml(bytes, label) {
  const document = parseDocument(bytes.toString('utf8'), {
    merge: false,
    schema: 'core',
    uniqueKeys: true
  });
  assert.deepEqual(
    document.errors.map(error => error.message),
    [],
    `${label} must be strict, valid YAML without duplicate keys`
  );
  const value = document.toJS({ maxAliasCount: 0 });
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), `${label} must contain a mapping`);
  return value;
}

function clone(value) {
  return structuredClone(value);
}

function allEntries(value, currentPath = '$', entries = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => allEntries(item, `${currentPath}[${index}]`, entries));
    return entries;
  }
  if (!value || typeof value !== 'object') {
    entries.push({ path: currentPath, value });
    return entries;
  }
  for (const [key, child] of Object.entries(value)) {
    entries.push({ path: `${currentPath}.${key}`, key, value: child });
    allEntries(child, `${currentPath}.${key}`, entries);
  }
  return entries;
}

function assertReadOnlyPermissions(permissions, label, { allowActionsRead = false } = {}) {
  const expected = allowActionsRead
    ? { contents: 'read', actions: 'read' }
    : { contents: 'read' };
  assert.deepEqual(permissions, expected, `${label} permissions must remain exactly read-only`);
}

function assertNoControlPlaneCapabilities(workflow, label, { allowPagesArtifact = false } = {}) {
  const entries = allEntries(workflow);
  for (const entry of entries) {
    if (entry.key !== undefined) {
      assert.notEqual(entry.key, 'environment', `${label} must not target a GitHub environment at ${entry.path}`);
      assert.notEqual(entry.key, 'secrets', `${label} must not receive secrets at ${entry.path}`);
      assert.notEqual(entry.key, 'id-token', `${label} must not request OIDC at ${entry.path}`);
      assert.notEqual(entry.key, 'pages', `${label} must not request Pages permissions at ${entry.path}`);
      assert.notEqual(entry.key, 'deployments', `${label} must not request deployment permissions at ${entry.path}`);
      assert.notEqual(entry.key, 'continue-on-error', `${label} must not make a job or step fail open at ${entry.path}`);
    }
    if (typeof entry.value !== 'string') continue;
    const value = entry.value;
    assert.doesNotMatch(value, /\$\{\{\s*secrets\./iu, `${label} must not reference repository secrets`);
    assert.doesNotMatch(value, /\b(?:curl|wget|gh|Invoke-WebRequest|Invoke-RestMethod)\b/iu, `${label} must not call mutation-capable network clients`);
    assert.doesNotMatch(value, /\bgit\s+(?:push|tag)\b/iu, `${label} must not push or create tags`);
    assert.doesNotMatch(value, /\bnpm\s+publish\b/iu, `${label} must not publish packages`);
    assert.doesNotMatch(value, /post-deploy-smoke/iu, `${label} must not invoke post-deployment smoke tooling`);
    assert.doesNotMatch(value, /--execute\b/iu, `${label} must not enable production smoke execution`);
    assert.doesNotMatch(value, /api\.github\.com/iu, `${label} must not call the GitHub API`);
    assert.doesNotMatch(value, /neb6dav\.github\.io/iu, `${label} must not contact production`);
    assert.doesNotMatch(value, /deploy-pages/iu, `${label} must not deploy Pages`);
    if (!allowPagesArtifact) {
      assert.doesNotMatch(value, /upload-pages-artifact/iu, `${label} must not prepare or publish Pages artifacts`);
    }
  }
}

function assertStepActions(workflow, allowed, label) {
  for (const [jobName, job] of Object.entries(workflow.jobs || {})) {
    assert.ok(Array.isArray(job.steps), `${label} job ${jobName} must use explicit local steps, not a reusable workflow`);
    assert.equal(job.uses, undefined, `${label} job ${jobName} must not call a reusable workflow`);
    for (const [index, step] of job.steps.entries()) {
      if (step.uses === undefined) continue;
      assert.ok(allowed.has(step.uses), `${label} job ${jobName} step ${index} uses forbidden action ${step.uses}`);
      if (step.uses.startsWith('actions/checkout@')) {
        assert.equal(
          step.with?.['persist-credentials'],
          false,
          `${label} job ${jobName} checkout must not persist the GitHub token`
        );
      }
    }
  }
}

function stepByName(job, name) {
  const matches = job.steps.filter(step => step.name === name);
  assert.equal(matches.length, 1, `job must contain exactly one ${name} step`);
  return matches[0];
}

function assertExactStepNames(job, expected, label) {
  assert.deepEqual(job.steps.map(step => step.name), expected, `${label} steps must remain an exact reviewed allowlist`);
}

function assertExactNodeInstall(job, label) {
  const setup = stepByName(job, 'Set up Node.js');
  assert.equal(setup.uses, 'actions/setup-node@v7');
  assert.deepEqual(setup.with, { 'node-version': 24, cache: 'npm' }, `${label} must use the declared Node 24 toolchain`);
  assert.equal(
    stepByName(job, 'Install exact dependencies').run,
    'npm ci',
    `${label} must install the exact lockfile dependency tree`
  );
}

function validateValidationWorkflow(workflow) {
  assert.deepEqual(Object.keys(workflow.on || {}).sort(), ['pull_request', 'push', 'workflow_dispatch']);
  assert.equal(workflow.on.pull_request, null, 'pull_request must be the ordinary unprivileged event');
  assert.deepEqual(workflow.on.push, { branches: ['main'] }, 'push validation must remain main-only');
  assert.equal(workflow.on.workflow_dispatch, null, 'workflow_dispatch must not accept capability-bearing inputs');
  assertReadOnlyPermissions(workflow.permissions, 'validate workflow');
  assertNoControlPlaneCapabilities(workflow, 'validate workflow');
  assertStepActions(workflow, VALIDATION_ACTIONS, 'validate workflow');

  const jobs = workflow.jobs;
  assert.deepEqual(Object.keys(jobs).sort(), ['build-and-test', 'candidate-assets', 'candidate-assets-parity']);
  for (const [jobName, job] of Object.entries(jobs)) {
    if (job.permissions !== undefined) assertReadOnlyPermissions(job.permissions, `${jobName} job`);
  }
  assertExactStepNames(jobs['build-and-test'], [
    'Check out repository',
    'Set up Node.js',
    'Install exact dependencies',
    'Build generated artifacts',
    'Run validation and staged-site contract gates',
    'Verify generated artifacts are committed',
    'Upload staged-site preview'
  ], 'build-and-test job');
  const buildAndTest = jobs['build-and-test'];
  assert.equal(buildAndTest.if, undefined, 'build-and-test job must use the default success gate');
  assertExactNodeInstall(buildAndTest, 'build-and-test job');
  const buildCheckout = stepByName(buildAndTest, 'Check out repository');
  assert.equal(buildCheckout.uses, 'actions/checkout@v7');
  assert.deepEqual(buildCheckout.with, { 'persist-credentials': false });
  assert.equal(stepByName(buildAndTest, 'Build generated artifacts').run, 'npm run build');
  assert.equal(stepByName(buildAndTest, 'Run validation and staged-site contract gates').run, 'npm test');
  const buildClean = stepByName(buildAndTest, 'Verify generated artifacts are committed');
  assert.equal(buildClean.shell, 'bash');
  assert.equal(buildClean.run, EXPECTED_BUILD_CLEAN_CHECK);
  const previewUpload = stepByName(buildAndTest, 'Upload staged-site preview');
  assert.equal(previewUpload.if, PULL_REQUEST_ONLY);
  assert.equal(previewUpload.uses, 'actions/upload-artifact@v4');
  assert.deepEqual(previewUpload.with, {
    name: 'site-preview-${{ github.sha }}',
    path: '_site',
    'include-hidden-files': true,
    'if-no-files-found': 'error',
    'retention-days': 14
  });
  for (const step of buildAndTest.steps) {
    if (step.name !== 'Upload staged-site preview') {
      assert.equal(step.if, undefined, `build-and-test step ${step.name} must not be conditionally skipped`);
    }
  }

  const candidate = jobs['candidate-assets'];
  assert.equal(candidate.if, PULL_REQUEST_ONLY);
  assert.equal(candidate['runs-on'], '${{ matrix.os }}');
  assert.equal(candidate['timeout-minutes'], 20);
  assertReadOnlyPermissions(candidate.permissions, 'candidate-assets job');
  assert.equal(candidate.strategy['fail-fast'], false);
  assert.deepEqual(candidate.strategy.matrix, {
    include: [
      { platform: 'ubuntu', os: 'ubuntu-latest' },
      { platform: 'windows', os: 'windows-latest' }
    ]
  });
  assert.deepEqual(candidate.env, {
    AI_TREE_REQUIRE_CLEAN: 'true',
    AI_TREE_STAGE_MODE: 'preview'
  });
  assertExactStepNames(candidate, [
    'Check out the exact pull-request merge commit',
    'Set up Node.js',
    'Install exact dependencies',
    'Build generated artifacts',
    'Test candidate release assets',
    'Build exact candidate assets',
    'Verify exact checkout and unchanged tracked source',
    'Upload cross-platform parity handoff'
  ], 'candidate-assets job');
  assertExactNodeInstall(candidate, 'candidate-assets job');
  for (const step of candidate.steps) {
    assert.equal(step.if, undefined, `candidate-assets step ${step.name} must not be conditionally skipped`);
  }

  const checkout = stepByName(candidate, 'Check out the exact pull-request merge commit');
  assert.equal(checkout.uses, 'actions/checkout@v7');
  assert.deepEqual(checkout.with, {
    ref: '${{ github.sha }}',
    'fetch-depth': 1,
    'fetch-tags': false,
    'persist-credentials': false
  });
  assert.equal(stepByName(candidate, 'Build generated artifacts').run, 'npm run build');
  assert.equal(stepByName(candidate, 'Test candidate release assets').run, 'npm run test:release-assets');

  const build = stepByName(candidate, 'Build exact candidate assets').run;
  assert.equal(build, EXPECTED_CANDIDATE_BUILD, 'candidate build must remain the exact reviewed npm invocation');

  const clean = stepByName(candidate, 'Verify exact checkout and unchanged tracked source');
  assert.equal(clean.shell, 'bash');
  assert.equal(clean.run, EXPECTED_CLEAN_CHECK, 'candidate source closure must remain the exact reviewed fail-closed script');

  const handoff = stepByName(candidate, 'Upload cross-platform parity handoff');
  assert.equal(handoff.uses, 'actions/upload-artifact@v4');
  assert.deepEqual(handoff.with, {
    name: 'candidate-handoff-${{ github.sha }}-${{ matrix.platform }}',
    path: '${{ runner.temp }}/release-candidate',
    'if-no-files-found': 'error',
    'compression-level': 0,
    'retention-days': 1
  });

  const parity = jobs['candidate-assets-parity'];
  assert.equal(parity.if, PULL_REQUEST_ONLY);
  assert.deepEqual(parity.needs, ['candidate-assets']);
  assert.equal(parity['runs-on'], 'ubuntu-latest');
  assert.equal(parity['timeout-minutes'], 10);
  assertReadOnlyPermissions(parity.permissions, 'candidate-assets-parity job');
  assertExactStepNames(parity, [
    'Download Ubuntu candidate',
    'Download Windows candidate',
    'Verify checksums and exact inner bytes',
    'Upload verified candidate'
  ], 'candidate-assets-parity job');
  for (const step of parity.steps) {
    assert.equal(step.if, undefined, `candidate-assets-parity step ${step.name} must not be conditionally skipped`);
  }

  const ubuntu = stepByName(parity, 'Download Ubuntu candidate');
  assert.equal(ubuntu.uses, 'actions/download-artifact@v5');
  assert.deepEqual(ubuntu.with, {
    name: 'candidate-handoff-${{ github.sha }}-ubuntu',
    path: '${{ runner.temp }}/candidates/ubuntu'
  });
  const windows = stepByName(parity, 'Download Windows candidate');
  assert.equal(windows.uses, 'actions/download-artifact@v5');
  assert.deepEqual(windows.with, {
    name: 'candidate-handoff-${{ github.sha }}-windows',
    path: '${{ runner.temp }}/candidates/windows'
  });

  const compareIndex = parity.steps.findIndex(step => step.name === 'Verify checksums and exact inner bytes');
  const uploadIndex = parity.steps.findIndex(step => step.name === 'Upload verified candidate');
  assert.ok(compareIndex >= 0 && uploadIndex > compareIndex, 'verified candidate upload must follow parity checks');
  const comparison = parity.steps[compareIndex];
  assert.equal(comparison.shell, 'bash');
  assert.equal(comparison.if, undefined, 'parity verification must run under the default success gate');
  assert.equal(comparison.run, EXPECTED_PARITY_SCRIPT, 'parity verification must remain the exact reviewed fail-closed script');

  const verified = parity.steps[uploadIndex];
  assert.equal(verified.if, undefined, 'verified-candidate upload must run only after ordinary successful parity');
  assert.equal(verified.uses, 'actions/upload-artifact@v4');
  assert.deepEqual(verified.with, {
    name: 'release-candidate-${{ github.sha }}',
    path: '${{ runner.temp }}/candidates/ubuntu',
    'if-no-files-found': 'error',
    'compression-level': 0,
    'retention-days': 14
  });
}

function validatePagesHold(workflow) {
  assert.deepEqual(Object.keys(workflow.on || {}), ['workflow_call']);
  assert.equal(workflow.on.workflow_call, null);
  assertReadOnlyPermissions(workflow.permissions, 'Pages hold workflow', { allowActionsRead: true });
  assertNoControlPlaneCapabilities(workflow, 'Pages hold workflow', { allowPagesArtifact: true });
  assertStepActions(workflow, PAGES_ACTIONS, 'Pages hold workflow');
  assert.deepEqual(Object.keys(workflow.jobs || {}), ['build']);
  if (workflow.jobs.build.permissions !== undefined) {
    assertReadOnlyPermissions(workflow.jobs.build.permissions, 'Pages build job');
  }
  assert.deepEqual(workflow.jobs.build.env, {
    AI_TREE_REQUIRE_CLEAN: 'true',
    AI_TREE_STAGE_MODE: 'preview'
  });
  assertExactStepNames(workflow.jobs.build, [
    'Check out repository',
    'Set up Node.js',
    'Install exact dependencies',
    'Build, validate, and stage the public artifact',
    'Upload GitHub Pages artifact'
  ], 'Pages build job');
  assert.equal(workflow.jobs.build.if, undefined, 'Pages build job must use the default success gate');
  assertExactNodeInstall(workflow.jobs.build, 'Pages build job');
  for (const step of workflow.jobs.build.steps) {
    assert.equal(step.if, undefined, `Pages build step ${step.name} must not be conditionally skipped`);
  }
  const checkout = stepByName(workflow.jobs.build, 'Check out repository');
  assert.equal(checkout.uses, 'actions/checkout@v7');
  assert.deepEqual(checkout.with, { 'persist-credentials': false });
  assert.equal(
    stepByName(workflow.jobs.build, 'Build, validate, and stage the public artifact').run,
    EXPECTED_PAGES_BUILD
  );
  const actionNames = workflow.jobs.build.steps
    .filter(step => step.uses !== undefined)
    .map(step => step.uses);
  assert.equal(actionNames.filter(action => action === 'actions/upload-pages-artifact@v5').length, 1);
  assert.deepEqual(stepByName(workflow.jobs.build, 'Upload GitHub Pages artifact').with, { path: '_site' });
}

function npmRunDependencies(command, label) {
  const dependencies = [];
  for (const segment of command.split('&&').map(value => value.trim())) {
    if (!/\bnpm\b/u.test(segment)) continue;
    const match = /^npm run ([A-Za-z0-9:_-]+)$/u.exec(segment);
    assert.ok(match, `${label} may invoke npm scripts only as an exact &&-separated npm run <name> command`);
    dependencies.push(match[1]);
  }
  return dependencies;
}

function validatePackageTestClosure(packageDocument) {
  const scripts = packageDocument.scripts;
  assert.ok(scripts && typeof scripts === 'object' && !Array.isArray(scripts), 'package scripts must be an object');
  const reachable = new Set();
  const pending = ['test'];
  while (pending.length > 0) {
    const name = pending.pop();
    if (reachable.has(name)) continue;
    assert.equal(typeof scripts[name], 'string', `test closure references missing script ${name}`);
    reachable.add(name);
    for (const dependency of npmRunDependencies(scripts[name], name)) pending.push(dependency);
  }
  for (const required of ['test:release-assets', 'test:post-deploy-smoke', 'test:workflow-policy']) {
    assert.ok(reachable.has(required), `${required} must be reachable from npm test`);
  }
  assert.equal(scripts['test:release-assets'], 'node --test tests/release-assets.test.mjs');
  assert.equal(scripts['test:post-deploy-smoke'], 'node --test tests/post-deploy-smoke.test.mjs');
  assert.equal(scripts['test:workflow-policy'], 'node --test tests/workflow-policy.test.mjs');
  assert.equal(
    scripts['build:release-candidate'],
    'node scripts/release-assets.mjs',
    'candidate assets must run through npm so the manifest records the observed npm version'
  );
  for (const name of reachable) {
    const command = scripts[name];
    assert.doesNotMatch(command, /post-deploy-smoke\.mjs/iu, `${name} must not execute the production smoke CLI`);
    assert.doesNotMatch(command, /--execute\b/iu, `${name} must not enable production smoke execution`);
    assert.doesNotMatch(command, /neb6dav\.github\.io/iu, `${name} must not contact production`);
    assert.doesNotMatch(command, /\b(?:curl|wget|gh|Invoke-WebRequest|Invoke-RestMethod)\b/iu, `${name} must not use external network clients`);
    assert.doesNotMatch(command, /\bgit\s+(?:push|tag)\b/iu, `${name} must not push or create tags`);
    assert.doesNotMatch(command, /\bnpm\s+publish\b/iu, `${name} must not publish packages`);
    assert.doesNotMatch(command, /api\.github\.com/iu, `${name} must not call the GitHub API`);
  }
}

const [validateBytes, pagesBytes, packageBytes] = await Promise.all([
  readFile(VALIDATE_PATH),
  readFile(PAGES_PATH),
  readFile(PACKAGE_PATH)
]);
const validateWorkflow = parseStrictYaml(validateBytes, 'validate workflow');
const pagesWorkflow = parseStrictYaml(pagesBytes, 'Pages hold workflow');
const packageDocument = parseStrictJson(packageBytes, 'package.json');

test('validation CI is candidate-only, cross-platform, byte-compared, and read-only', () => {
  validateValidationWorkflow(validateWorkflow);
});

test('Pages workflow remains a reusable preview-only build hold', () => {
  validatePagesHold(pagesWorkflow);
});

test('npm test covers C4.2 tools and cannot execute production smoke', () => {
  validatePackageTestClosure(packageDocument);
});

test('workflow policy rejects capability and parity regressions', async t => {
  const scenarios = [
    ['privileged trigger', workflow => { workflow.on.pull_request_target = null; }],
    ['write permission', workflow => { workflow.permissions.contents = 'write'; }],
    ['job write permission', workflow => { workflow.jobs['build-and-test'].permissions = { issues: 'write' }; }],
    ['environment target', workflow => { workflow.jobs['candidate-assets'].environment = 'github-pages'; }],
    ['secret reference', workflow => { workflow.jobs['candidate-assets'].env.RELEASE_TOKEN = '${{ secrets.RELEASE_TOKEN }}'; }],
    ['persisted checkout token', workflow => {
      stepByName(workflow.jobs['build-and-test'], 'Check out repository').with['persist-credentials'] = true;
    }],
    ['alternate validation checkout', workflow => {
      stepByName(workflow.jobs['build-and-test'], 'Check out repository').with.ref = 'main';
    }],
    ['skipped validation job', workflow => { workflow.jobs['build-and-test'].if = false; }],
    ['deployment action', workflow => { workflow.jobs['candidate-assets-parity'].steps.push({ uses: 'actions/deploy-pages@v4' }); }],
    ['production smoke command', workflow => { workflow.jobs['build-and-test'].steps.push({ run: 'node scripts/post-deploy-smoke.mjs --execute' }); }],
    ['hidden GitHub command', workflow => { workflow.jobs['build-and-test'].steps.push({ name: 'Hidden mutation', run: 'echo ready; gh api repos/example/settings' }); }],
    ['direct candidate node invocation', workflow => {
      stepByName(workflow.jobs['candidate-assets'], 'Build exact candidate assets').run =
        'node scripts/release-assets.mjs --repository-root "${{ github.workspace }}" --commit "${{ github.sha }}" --output-directory "${{ runner.temp }}/release-candidate"';
    }],
    ['skipped validation suite', workflow => {
      stepByName(workflow.jobs['build-and-test'], 'Run validation and staged-site contract gates').run = 'true';
    }],
    ['skipped candidate asset tests', workflow => {
      stepByName(workflow.jobs['candidate-assets'], 'Test candidate release assets').if = false;
    }],
    ['parity continue-on-error', workflow => {
      stepByName(workflow.jobs['candidate-assets-parity'], 'Verify checksums and exact inner bytes')['continue-on-error'] = true;
    }],
    ['parity shell fail-open', workflow => {
      stepByName(workflow.jobs['candidate-assets-parity'], 'Verify checksums and exact inner bytes').run =
        EXPECTED_PARITY_SCRIPT.replace('sha256sum --strict --check "${sums[0]}"', 'sha256sum --strict --check "${sums[0]}" || true');
    }],
    ['permissive verified upload condition', workflow => {
      stepByName(workflow.jobs['candidate-assets-parity'], 'Upload verified candidate').if = 'always()';
    }],
    ['candidate Node drift', workflow => {
      stepByName(workflow.jobs['candidate-assets'], 'Set up Node.js').with['node-version'] = 20;
    }],
    ['candidate install drift', workflow => {
      stepByName(workflow.jobs['candidate-assets'], 'Install exact dependencies').run = 'npm install';
    }],
    ['missing Windows builder', workflow => { workflow.jobs['candidate-assets'].strategy.matrix.include.pop(); }],
    ['missing parity dependency', workflow => { workflow.jobs['candidate-assets-parity'].needs = []; }],
    ['long-lived handoff', workflow => { stepByName(workflow.jobs['candidate-assets'], 'Upload cross-platform parity handoff').with['retention-days'] = 14; }],
    ['unverified final upload', workflow => {
      const steps = workflow.jobs['candidate-assets-parity'].steps;
      steps.unshift(steps.pop());
    }]
  ];
  for (const [name, mutate] of scenarios) {
    await t.test(name, () => {
      const hostile = clone(validateWorkflow);
      mutate(hostile);
      assert.throws(() => validateValidationWorkflow(hostile));
    });
  }
});

test('Pages and package policies reject promotion or production-smoke regressions', async t => {
  await t.test('Pages deployment', () => {
    const hostile = clone(pagesWorkflow);
    hostile.jobs.build.steps.push({ uses: 'actions/deploy-pages@v4' });
    assert.throws(() => validatePagesHold(hostile));
  });
  await t.test('Pages environment', () => {
    const hostile = clone(pagesWorkflow);
    hostile.jobs.build.environment = 'github-pages';
    assert.throws(() => validatePagesHold(hostile));
  });
  await t.test('production smoke enters npm test closure', () => {
    const hostile = clone(packageDocument);
    hostile.scripts.test += ' && npm run smoke:production';
    hostile.scripts['smoke:production'] = 'node scripts/post-deploy-smoke.mjs --execute';
    assert.throws(() => validatePackageTestClosure(hostile));
  });
  await t.test('semicolon cannot conceal an npm production-smoke dependency', () => {
    const hostile = clone(packageDocument);
    hostile.scripts.test += '; npm run smoke:production';
    hostile.scripts['smoke:production'] = 'node scripts/post-deploy-smoke.mjs --execute';
    assert.throws(() => validatePackageTestClosure(hostile));
  });
});
