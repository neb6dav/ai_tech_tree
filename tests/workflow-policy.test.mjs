import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { parseDocument } from 'yaml';

import { parseStrictJson } from '../scripts/strict-json.mjs';

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORKFLOW_DIRECTORY = path.join(REPOSITORY_ROOT, '.github', 'workflows');
const VALIDATE_PATH = path.join(REPOSITORY_ROOT, '.github', 'workflows', 'validate.yml');
const PAGES_PATH = path.join(REPOSITORY_ROOT, '.github', 'workflows', 'pages.yml');
const PACKAGE_PATH = path.join(REPOSITORY_ROOT, 'package.json');
const PACKAGE_LOCK_PATH = path.join(REPOSITORY_ROOT, 'package-lock.json');
const NVMRC_PATH = path.join(REPOSITORY_ROOT, '.nvmrc');
const NODE_VERSION_PATH = path.join(REPOSITORY_ROOT, '.node-version');
const SYNTHETIC_FIXTURE_PATH = path.join(REPOSITORY_ROOT, 'scripts', 'synthetic-stable-fixture.mjs');
const STABLE_BUNDLE_VERIFIER_PATH = path.join(REPOSITORY_ROOT, 'scripts', 'verify-stable-bundle.mjs');
const PROMOTION_CONTROL_AUDITOR_PATH = path.join(REPOSITORY_ROOT, 'scripts', 'github-control-audit.mjs');
const PROMOTION_CONTROL_TEST_PATH = path.join(REPOSITORY_ROOT, 'tests', 'github-control-audit.test.mjs');
const PROMOTION_CONTROL_POLICY_PATH = path.join(REPOSITORY_ROOT, 'config', 'github-promotion-policy.v1.json');
const SAFE_PROMOTION_CONTROL_PLAN_COMMAND = 'node scripts/github-control-audit.mjs';
const REVIEWED_PROMOTION_CONTROL_SOURCE_SHA256 = Object.freeze({
  'config/github-promotion-policy.v1.json': 'a1dc1ec4b814f09e668b1b1d6669853240dcb732541e0d0b580ec3f5a959215c',
  'scripts/github-control-audit.mjs': '1b5ea0a3c46f206f8f236875719c6a40313d8a4efb37476eff1fdb11f5a01918',
  'tests/github-control-audit.test.mjs': 'ac02dbeaddb9cd0a1f1dd235657b999e521d5f45b4703be6474d0d19ba077a82'
});
const REVIEWED_SYNTHETIC_SOURCE_SHA256 = Object.freeze({
  'scripts/release-assets.mjs': '8841efff842e00dd93bf69a849b7701ae519bfd70b9bc5618c440ee37b90f83f',
  'scripts/release-ref.mjs': 'c2d7f2be57441fedf046f84e4c70e911ee8ebb7f911b65742b391f274a038a4b',
  'scripts/release-spec.mjs': 'ba57496454c0e565bd6b315e8c52aba6998774aff27d6c55eac32e141074e89f',
  'scripts/stage-site.mjs': '66f6501b44f8377049c4a3ce5398138d669dd2103c0f6f3d18ccfbc7daa35aed',
  'scripts/strict-json.mjs': '32319f64ee28a8e4c0329d24ef26c8ef26c94f12d77f9f20656f7e744111de7e',
  'scripts/synthetic-stable-fixture.mjs': 'bee4923947e0ca595d23776ccb57c0b6a14592590c4a642a2495725df648342d',
  'scripts/verify-stable-bundle.mjs': '6e536de00ca8def993a7628f500fc4712c23b14255cbe5231ffed48852f6828f'
});
const EXPECTED_WORKFLOW_FILES = ['pages.yml', 'validate.yml'];
const SAFE_POST_DEPLOY_TEST_COMMAND = 'node --test tests/post-deploy-smoke.test.mjs';
const EXPECTED_PACKAGE_SCRIPTS = Object.freeze({
  'build:network': 'esbuild src/network-view.js --bundle --format=iife --global-name=NetworkAtlas --platform=browser --target=es2020 --outfile=network-atlas.bundle.js --minify --legal-comments=eof',
  'build:opportunity': 'esbuild src/opportunity-view.js --bundle --format=iife --global-name=OpportunityAtlas --platform=browser --target=es2020 --outfile=opportunity-atlas.bundle.js --minify --legal-comments=eof',
  'build:layout': 'node generate-network-layout.js',
  build: 'node build.js',
  'build:release-candidate': 'node scripts/release-assets.mjs',
  'build:stable-release-assets': 'node scripts/release-assets.mjs --mode stable',
  'build:synthetic-stable-fixture': 'node scripts/synthetic-stable-fixture.mjs',
  'plan:release-finalization': 'node scripts/release-finalization-plan.mjs',
  'plan:promotion-controls': SAFE_PROMOTION_CONTROL_PLAN_COMMAND,
  'stage:site': 'node scripts/stage-site.mjs',
  'verify:stable-bundle': 'node scripts/verify-stable-bundle.mjs',
  'test:core': 'node release-gate.js && node accessibility-gate.js && node ui-layout-gate.js && node network-gate.js && node opportunity-gate.js',
  'test:network': 'node network-gate.js',
  'test:opportunity': 'node opportunity-gate.js',
  'test:stage-site': 'node --test scripts/stage-site.test.mjs',
  'test:release-spec': 'node --test tests/release-spec.test.mjs',
  'test:release-ref': 'node --test tests/release-ref.test.mjs',
  'test:release-assets': 'node --test tests/release-assets.test.mjs',
  'test:stable-bundle': 'node --test tests/stable-bundle.test.mjs',
  'test:release-finalization-plan': 'node --test tests/release-finalization-plan.test.mjs',
  'test:promotion-controls': 'node --test tests/github-control-audit.test.mjs',
  'test:post-deploy-smoke': SAFE_POST_DEPLOY_TEST_COMMAND,
  'test:workflow-policy': 'node --test tests/workflow-policy.test.mjs',
  'test:site-contract:unit': 'node --test tests/site-contract-test.test.cjs',
  'test:site-contract': 'node scripts/site-contract-test.cjs',
  'test:performance-budget:unit': 'node --test tests/performance-budget-test.test.cjs',
  'test:performance-budget': 'node scripts/performance-budget-test.cjs',
  'test:publication-compatibility': 'node --test tests/publication-compatibility.test.cjs',
  'test:export-human-urls': 'node --test tests/export-human-urls.test.cjs',
  'test:release-identity': 'node --test tests/release-identity.test.cjs',
  'test:publication': 'npm run test:release-spec && npm run test:release-ref && npm run test:release-assets && npm run test:release-finalization-plan && npm run test:promotion-controls && npm run test:post-deploy-smoke && npm run test:workflow-policy && npm run test:stage-site && npm run test:site-contract:unit && npm run test:performance-budget:unit && npm run test:publication-compatibility && npm run test:export-human-urls && npm run stage:site && npm run test:release-identity && npm run test:performance-budget && npm run test:site-contract',
  test: 'npm run test:core && npm run test:publication'
});
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
const EXPECTED_SYNTHETIC_BUILD = [
  'npm run build:synthetic-stable-fixture -- --output-directory "${{ runner.temp }}/synthetic-stable-assets"',
  ''
].join('\n');
const EXPECTED_SYNTHETIC_VERIFY = [
  'npm run verify:stable-bundle -- --bundle-directory "${{ runner.temp }}/synthetic-stable-assets" --require-synthetic-test-only',
  ''
].join('\n');
const EXPECTED_SYNTHETIC_PARITY_SCRIPT = [
  'set -euo pipefail',
  'root="$RUNNER_TEMP/synthetic-stable-assets"',
  '',
  'for platform in ubuntu windows; do',
  '  directory="$root/$platform"',
  '  test "$(find "$directory" -mindepth 1 -maxdepth 1 -type f | wc -l)" -eq 4',
  '  test -z "$(find "$directory" -mindepth 1 -maxdepth 1 ! -type f -print -quit)"',
  '  npm run verify:stable-bundle -- \\',
  '    --bundle-directory "$directory" \\',
  '    --require-synthetic-test-only',
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

function validateWorkflowInventory(names) {
  assert.deepEqual(
    [...names].sort(),
    EXPECTED_WORKFLOW_FILES,
    '.github/workflows must contain only the reviewed Pages hold and validation workflows'
  );
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
      assert.doesNotMatch(
        entry.key,
        /(?:^|[_-])(?:token|secret)(?:$|[_-])/iu,
        `${label} must not declare token- or secret-bearing controls at ${entry.path}`
      );
    }
    if (typeof entry.value !== 'string') continue;
    const value = entry.value;
    assert.doesNotMatch(value, /\$\{\{\s*secrets\./iu, `${label} must not reference repository secrets`);
    assert.doesNotMatch(value, /\$\{\{\s*github\.token\b/iu, `${label} must not reference the ambient GitHub token`);
    assert.doesNotMatch(
      value,
      /\b(?:GH_TOKEN|GITHUB_TOKEN|NODE_AUTH_TOKEN)\b/iu,
      `${label} must not receive an ambient mutation-capable token`
    );
    assert.doesNotMatch(value, /\b(?:curl|wget|gh|Invoke-WebRequest|Invoke-RestMethod)\b/iu, `${label} must not call mutation-capable network clients`);
    assert.doesNotMatch(value, /\bgit\s+(?:push|tag)\b/iu, `${label} must not push or create tags`);
    assert.doesNotMatch(value, /\bnpm\s+publish\b/iu, `${label} must not publish packages`);
    assert.doesNotMatch(value, /post-deploy-smoke/iu, `${label} must not invoke post-deployment smoke tooling`);
    assert.doesNotMatch(value, /--execute\b/iu, `${label} must not enable production smoke execution`);
    assert.doesNotMatch(
      value,
      /scripts[\\/]github-control-audit\.mjs|\bnpm\s+run\s+plan:promotion-controls\b/iu,
      `${label} must not execute the GitHub promotion-control audit`
    );
    assert.doesNotMatch(
      value,
      /\bnpm\s+run\s+build:stable-release-assets\b|scripts[\\/]release-assets\.mjs[^\r\n]*--mode(?:=|\s+)["']?stable\b/iu,
      `${label} must not build stable release assets`
    );
    assert.doesNotMatch(
      value,
      /\bAI_TREE_STAGE_MODE\s*(?:=|:)\s*["']?release\b|scripts[\\/]stage-site\.mjs[^\r\n]*--mode(?:=|\s+)["']?release\b/iu,
      `${label} must not enable release-mode staging`
    );
    assert.doesNotMatch(value, /api\.github\.com/iu, `${label} must not call the GitHub API`);
    assert.doesNotMatch(
      value,
      /\/(?:actions\/permissions|environments|pages|releases|rulesets|settings)(?:\/|\b)/iu,
      `${label} must not address GitHub release, settings, environment, or deployment control planes`
    );
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
  assert.deepEqual(
    setup.with,
    { 'node-version': 24, cache: 'npm' },
    `${label} must use the declared Node 24 toolchain`
  );
  assert.equal(
    stepByName(job, 'Install exact dependencies').run,
    'npm ci',
    `${label} must install the exact lockfile dependency tree`
  );
}

function assertExactSyntheticNodeInstall(job, label, { cache = true } = {}) {
  const setup = stepByName(job, 'Set up exact synthetic-fixture Node.js');
  assert.equal(setup.uses, 'actions/setup-node@v7');
  assert.deepEqual(
    setup.with,
    cache ? { 'node-version': '24.14.1', cache: 'npm' } : { 'node-version': '24.14.1' },
    `${label} must pin exact synthetic parity Node v24.14.1`
  );
}

function assertExactPrCheckout(job, label) {
  const checkout = stepByName(job, 'Check out the exact pull-request merge commit');
  assert.equal(checkout.uses, 'actions/checkout@v7');
  assert.deepEqual(checkout.with, {
    ref: '${{ github.sha }}',
    'fetch-depth': 1,
    'fetch-tags': false,
    'persist-credentials': false
  }, `${label} must use the exact credential-free pull-request merge checkout without tags`);
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
  assert.deepEqual(Object.keys(jobs).sort(), [
    'build-and-test',
    'candidate-assets',
    'candidate-assets-parity',
    'synthetic-stable-assets',
    'synthetic-stable-assets-parity'
  ]);
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

  const synthetic = jobs['synthetic-stable-assets'];
  assert.equal(synthetic.if, PULL_REQUEST_ONLY);
  assert.equal(synthetic['runs-on'], '${{ matrix.os }}');
  assert.equal(synthetic['timeout-minutes'], 20);
  assertReadOnlyPermissions(synthetic.permissions, 'synthetic-stable-assets job');
  assert.equal(synthetic.env, undefined, 'synthetic stable fixture job must not inherit release controls');
  assert.equal(synthetic.strategy['fail-fast'], false);
  assert.deepEqual(synthetic.strategy.matrix, {
    include: [
      { platform: 'ubuntu', os: 'ubuntu-latest' },
      { platform: 'windows', os: 'windows-latest' }
    ]
  });
  assertExactStepNames(synthetic, [
    'Check out the exact pull-request merge commit',
    'Set up exact synthetic-fixture Node.js',
    'Install exact dependencies',
    'Test synthetic stable bundle verifier',
    'Build synthetic test-only stable assets',
    'Independently verify synthetic test-only stable bundle',
    'Verify exact checkout and unchanged tracked source',
    'Upload synthetic test-only parity handoff'
  ], 'synthetic-stable-assets job');
  for (const step of synthetic.steps) {
    assert.equal(step.if, undefined, `synthetic-stable-assets step ${step.name} must not be conditionally skipped`);
  }
  assertExactPrCheckout(synthetic, 'synthetic-stable-assets job');
  assertExactSyntheticNodeInstall(synthetic, 'synthetic-stable-assets job');
  assert.equal(stepByName(synthetic, 'Install exact dependencies').run, 'npm ci');
  assert.equal(stepByName(synthetic, 'Test synthetic stable bundle verifier').run, 'npm run test:stable-bundle');
  assert.equal(
    stepByName(synthetic, 'Build synthetic test-only stable assets').run,
    EXPECTED_SYNTHETIC_BUILD,
    'synthetic fixture must use the exact npm wrapper and external test-only output path'
  );
  assert.equal(
    stepByName(synthetic, 'Independently verify synthetic test-only stable bundle').run,
    EXPECTED_SYNTHETIC_VERIFY,
    'synthetic bundle must pass the exact independent offline verifier invocation'
  );
  const syntheticClean = stepByName(synthetic, 'Verify exact checkout and unchanged tracked source');
  assert.equal(syntheticClean.shell, 'bash');
  assert.equal(syntheticClean.run, EXPECTED_CLEAN_CHECK);
  const syntheticHandoff = stepByName(synthetic, 'Upload synthetic test-only parity handoff');
  assert.equal(syntheticHandoff.uses, 'actions/upload-artifact@v4');
  assert.deepEqual(syntheticHandoff.with, {
    name: 'synthetic-test-only-stable-handoff-${{ github.sha }}-${{ matrix.platform }}',
    path: '${{ runner.temp }}/synthetic-stable-assets',
    'if-no-files-found': 'error',
    'compression-level': 0,
    'retention-days': 1
  });

  const syntheticParity = jobs['synthetic-stable-assets-parity'];
  assert.equal(syntheticParity.if, PULL_REQUEST_ONLY);
  assert.deepEqual(syntheticParity.needs, ['synthetic-stable-assets']);
  assert.equal(syntheticParity['runs-on'], 'ubuntu-latest');
  assert.equal(syntheticParity['timeout-minutes'], 10);
  assertReadOnlyPermissions(syntheticParity.permissions, 'synthetic-stable-assets-parity job');
  assert.equal(syntheticParity.env, undefined);
  assertExactStepNames(syntheticParity, [
    'Check out the exact pull-request merge commit',
    'Set up exact synthetic-fixture Node.js',
    'Download Ubuntu synthetic test-only bundle',
    'Download Windows synthetic test-only bundle',
    'Independently verify bundles and exact four-file byte parity'
  ], 'synthetic-stable-assets-parity job');
  for (const step of syntheticParity.steps) {
    assert.equal(step.if, undefined, `synthetic-stable-assets-parity step ${step.name} must not be conditionally skipped`);
  }
  assertExactPrCheckout(syntheticParity, 'synthetic-stable-assets-parity job');
  assertExactSyntheticNodeInstall(syntheticParity, 'synthetic-stable-assets-parity job', { cache: false });
  assert.deepEqual(stepByName(syntheticParity, 'Download Ubuntu synthetic test-only bundle').with, {
    name: 'synthetic-test-only-stable-handoff-${{ github.sha }}-ubuntu',
    path: '${{ runner.temp }}/synthetic-stable-assets/ubuntu'
  });
  assert.deepEqual(stepByName(syntheticParity, 'Download Windows synthetic test-only bundle').with, {
    name: 'synthetic-test-only-stable-handoff-${{ github.sha }}-windows',
    path: '${{ runner.temp }}/synthetic-stable-assets/windows'
  });
  const syntheticComparison = stepByName(
    syntheticParity,
    'Independently verify bundles and exact four-file byte parity'
  );
  assert.equal(syntheticComparison.shell, 'bash');
  assert.equal(syntheticComparison.run, EXPECTED_SYNTHETIC_PARITY_SCRIPT);
  assert.equal(
    syntheticParity.steps.some(step => step.uses === 'actions/upload-artifact@v4'),
    false,
    'synthetic parity must not upload a final release-looking bundle'
  );
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

function commandWithoutAllowedLocalTestReferences(command) {
  return command
    .replaceAll('test:post-deploy-smoke', 'test:safe-local-smoke')
    .replaceAll('test:promotion-controls', 'test:read-only-control-tests')
    .replace(/tests[\\/]post-deploy-smoke\.test\.mjs/giu, 'tests/safe-local-smoke.test.mjs');
}

function assertNoPackagePromotionCapabilities(scripts) {
  assert.equal(
    scripts['test:post-deploy-smoke'],
    SAFE_POST_DEPLOY_TEST_COMMAND,
    'test:post-deploy-smoke must remain the exact local unit-test command'
  );

  for (const [name, command] of Object.entries(scripts)) {
    assert.equal(typeof command, 'string', `${name} must be a string command`);
    assert.doesNotMatch(
      name,
      /^(?:deploy|publish|promote|tag)(?::|$)/iu,
      `${name} must not introduce a promotion-oriented package-script entry point`
    );

    const inspected = commandWithoutAllowedLocalTestReferences(command);
    assert.doesNotMatch(
      inspected,
      /scripts[\\/]post-deploy-smoke\.mjs/iu,
      `${name} must not execute the post-deployment smoke CLI`
    );
    assert.doesNotMatch(inspected, /--execute\b/iu, `${name} must not enable production smoke execution`);
    assert.doesNotMatch(
      inspected,
      /\b(?:GH_TOKEN|GITHUB_TOKEN|NODE_AUTH_TOKEN)\b|\$\{\{\s*(?:secrets\.|github\.token\b)/iu,
      `${name} must not receive a token or secret`
    );
    assert.doesNotMatch(
      inspected,
      /\bAI_TREE_STAGE_MODE\s*(?:=|:)\s*["']?release\b|--mode(?:=|\s+)["']?release\b/iu,
      `${name} must not enable release-mode staging`
    );
    assert.doesNotMatch(
      inspected,
      /\bgit(?:\.exe)?\b[^\r\n;&|]*\b(?:push|tag|update-ref)\b|refs[\\/]tags\b/iu,
      `${name} must not create or publish Git refs`
    );
    assert.doesNotMatch(
      inspected,
      /\b(?:gh|hub)(?:\.exe)?\b|api\.github\.com|uploads\.github\.com|\/releases(?:\/|\b)/iu,
      `${name} must not call GitHub release or mutation interfaces`
    );
    assert.doesNotMatch(
      inspected,
      /\b(?:curl|wget|Invoke-WebRequest|Invoke-RestMethod)\b/iu,
      `${name} must not use mutation-capable network clients`
    );
    assert.doesNotMatch(inspected, /\bnpm\s+version\b/iu, `${name} must not create an implicit package-version tag`);
    assert.doesNotMatch(inspected, /\bnpm\s+publish\b/iu, `${name} must not publish packages`);
    assert.doesNotMatch(
      inspected,
      /\b(?:deploy(?:ment|ments|ed|ing)?|publish(?:ed|ing)?|promot(?:e|ed|ing|ion))\b/iu,
      `${name} must not contain a deployment, publication, or promotion command`
    );
  }
}

function validatePackageTestClosure(
  packageDocument,
  lockDocument = packageLockDocument,
  nvmrc = nvmrcBytes,
  nodeVersion = nodeVersionBytes
) {
  const scripts = packageDocument.scripts;
  assert.deepEqual(packageDocument.engines, { node: '24.x', npm: '>=11 <12' });
  assert.deepEqual(lockDocument.packages?.['']?.engines, { node: '24.x', npm: '>=11 <12' });
  assert.equal(nvmrc.toString('utf8'), '24\n');
  assert.equal(nodeVersion.toString('utf8'), '24\n');
  assert.ok(scripts && typeof scripts === 'object' && !Array.isArray(scripts), 'package scripts must be an object');
  assert.deepEqual(scripts, EXPECTED_PACKAGE_SCRIPTS, 'package scripts must remain the exact reviewed non-promoting command map');
  assertNoPackagePromotionCapabilities(scripts);
  const reachable = new Set();
  const pending = ['test'];
  while (pending.length > 0) {
    const name = pending.pop();
    if (reachable.has(name)) continue;
    assert.equal(typeof scripts[name], 'string', `test closure references missing script ${name}`);
    reachable.add(name);
    for (const dependency of npmRunDependencies(scripts[name], name)) pending.push(dependency);
  }
  for (const required of [
    'test:release-assets',
    'test:release-finalization-plan',
    'test:promotion-controls',
    'test:post-deploy-smoke',
    'test:workflow-policy'
  ]) {
    assert.ok(reachable.has(required), `${required} must be reachable from npm test`);
  }
  assert.equal(scripts['test:release-assets'], 'node --test tests/release-assets.test.mjs');
  assert.equal(scripts['test:stable-bundle'], 'node --test tests/stable-bundle.test.mjs');
  assert.equal(scripts['test:promotion-controls'], 'node --test tests/github-control-audit.test.mjs');
  assert.equal(scripts['test:post-deploy-smoke'], 'node --test tests/post-deploy-smoke.test.mjs');
  assert.equal(scripts['test:workflow-policy'], 'node --test tests/workflow-policy.test.mjs');
  assert.equal(
    scripts['build:release-candidate'],
    'node scripts/release-assets.mjs',
    'candidate assets must run through npm so the manifest records the observed npm version'
  );
  assert.equal(
    scripts['build:stable-release-assets'],
    'node scripts/release-assets.mjs --mode stable',
    'stable assets must use the exact reviewed local-only stable mode'
  );
  assert.equal(
    scripts['build:synthetic-stable-fixture'],
    'node scripts/synthetic-stable-fixture.mjs',
    'synthetic stable fixtures must use the reviewed network-free local builder'
  );
  assert.equal(
    scripts['verify:stable-bundle'],
    'node scripts/verify-stable-bundle.mjs',
    'stable bundles must use the reviewed independent offline verifier'
  );
  assert.equal(
    scripts['plan:promotion-controls'],
    SAFE_PROMOTION_CONTROL_PLAN_COMMAND,
    'promotion-control inspection must default to the reviewed plan-only CLI with no execution flag'
  );
  assert.equal(
    reachable.has('plan:promotion-controls'),
    false,
    'the plan-only GitHub control audit must not execute through the ordinary npm test closure'
  );
  assert.equal(
    reachable.has('test:stable-bundle'),
    false,
    'the exact-toolchain synthetic stable suite must run only in its dedicated pull-request job'
  );
  assert.equal(
    reachable.has('build:stable-release-assets'),
    false,
    'the local stable-asset builder must not be executable through the ordinary npm test closure'
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

function validateSyntheticHelperBoundary(fixtureBytes, verifierBytes, reviewedSources = reviewedSyntheticSources) {
  const lockedSources = new Map(reviewedSources);
  lockedSources.set('scripts/synthetic-stable-fixture.mjs', fixtureBytes);
  lockedSources.set('scripts/verify-stable-bundle.mjs', verifierBytes);
  assert.deepEqual(
    [...lockedSources.keys()].sort(),
    Object.keys(REVIEWED_SYNTHETIC_SOURCE_SHA256).sort(),
    'synthetic execution closure must contain exactly the seven reviewed source files'
  );
  for (const [relativePath, expectedDigest] of Object.entries(REVIEWED_SYNTHETIC_SOURCE_SHA256)) {
    const actualDigest = createHash('sha256').update(lockedSources.get(relativePath)).digest('hex');
    assert.equal(actualDigest, expectedDigest, `${relativePath} must retain its exact reviewed source-byte SHA-256`);
  }
  const fixtureText = fixtureBytes.toString('utf8');
  const verifierText = verifierBytes.toString('utf8');
  const allowedImports = new Map([
    ['synthetic fixture builder', [
      './release-assets.mjs',
      './release-spec.mjs',
      'node:child_process',
      'node:fs/promises',
      'node:path',
      'node:process',
      'node:url'
    ]],
    ['stable bundle verifier', [
      './strict-json.mjs',
      'node:crypto',
      'node:fs/promises',
      'node:os',
      'node:path',
      'node:process',
      'node:url'
    ]]
  ]);
  for (const [label, source] of [
    ['synthetic fixture builder', fixtureText],
    ['stable bundle verifier', verifierText]
  ]) {
    const staticImports = [...source.matchAll(/(?:\bfrom\s+|^\s*import\s+)['"]([^'"]+)['"]/gmu)]
      .map(match => match[1])
      .sort();
    assert.deepEqual(staticImports, allowedImports.get(label), `${label} must use only its exact reviewed static imports`);
    assert.doesNotMatch(source, /node:(?:http|https|http2|net|tls|dns|dgram)\b/u, `${label} must not reference network APIs`);
    assert.doesNotMatch(source, /\bimport\s*\(/u, `${label} must not use dynamic imports`);
    assert.doesNotMatch(source, /\bgetBuiltinModule\b/u, `${label} must not resolve built-ins dynamically`);
    assert.doesNotMatch(source, /\bfetch\b/iu, `${label} must not reference fetch`);
    assert.doesNotMatch(
      source,
      /\b(?:WebSocket|EventSource|XMLHttpRequest)\b|navigator\.sendBeacon\b/u,
      `${label} must not invoke browser network clients`
    );
    assert.doesNotMatch(source, /\b(?:curl|wget|Invoke-WebRequest|Invoke-RestMethod|gh)\b/u, `${label} must not invoke external network clients`);
  }
  assert.match(fixtureText, /function assertAllowedLocalGitCommand\(/u);
  assert.match(fixtureText, /--object-format=sha1/u);
  assert.match(fixtureText, /--initial-branch=main/u);
  assert.match(fixtureText, /await write\(repositoryRoot, '\.gitattributes', '\* -text\\n'\)/u);
  assert.match(fixtureText, /synthetic fixture tree must contain only regular 100644 blobs/u);
  assert.match(fixtureText, /sourceControlSnapshot\(sourceRoot\)/u);
  assert.match(fixtureText, /assertSameSourceControlSnapshot/u);
  assert.match(
    fixtureText,
    /\}\s*finally\s*\{[\s\S]{0,400}assertSameSourceControlSnapshot\(sourceControlBefore, sourceControlSnapshot\(sourceRoot\)\)/u,
    'source control reconciliation must execute from finally on success and failure paths'
  );
  assert.match(fixtureText, /synthetic fixture repository must have zero configured remotes/u);
  assert.match(fixtureText, /REQUIRED_NODE_VERSION = 'v24\.14\.1'/u);
  assert.match(fixtureText, /REQUIRED_NPM_VERSION = '11\.11\.0'/u);
  assert.equal((fixtureText.match(/\bexecFileSync\b/gu) || []).length, 3, 'fixture may use execFileSync only at its exact import and two reviewed call sites');
  assert.equal(
    (fixtureText.match(/^import \{ execFileSync \} from 'node:child_process';$/gmu) || []).length,
    1,
    'fixture must retain the exact reviewed child_process binding'
  );
  assert.match(fixtureText, /return execFileSync\('git', \[/u);
  assert.match(fixtureText, /observedNpm = execFileSync\(process\.execPath, \[npmExecutable, '--version'\], \{/u);
  assert.doesNotMatch(fixtureText, /\b(?:execSync|spawn|spawnSync|fork)\b/u, 'fixture must not add another child-process primitive');
  assert.doesNotMatch(
    fixtureText,
    /JSON\.stringify\(\[['"](?:fetch|pull|push|clone|tag)['"]|argumentsList\[0\]\s*===\s*['"](?:fetch|pull|push|clone|tag)['"]/u,
    'synthetic fixture Git allowlist must not name network or tag-porcelain operations'
  );
  assert.doesNotMatch(
    fixtureText,
    /JSON\.stringify\(\[['"]remote['"]\s*,\s*['"]add['"]|argumentsList\[0\]\s*===\s*['"]remote['"][\s\S]{0,120}argumentsList\[1\]\s*===\s*['"]add['"]/u,
    'synthetic fixture Git allowlist must not permit remote creation'
  );
  assert.doesNotMatch(verifierText, /node:child_process/u, 'offline verifier must not launch subprocesses');
  for (const proof of [
    'archive entry header checksum does not match',
    'archive may contain only regular-file entries',
    'archive path is outside the exact',
    'archive entry has nonzero padding',
    'archive must end with exactly two zero blocks',
    'archived release manifest is not byte-identical',
    'archive inventory does not close over the release manifest',
    'temporary extraction verification failed',
    'exact locked synthetic-test-only identity',
    'exact SHA-1 commit, tag, and protected-ref proof'
  ]) {
    assert.ok(verifierText.includes(proof), `offline verifier must retain its ${proof} proof`);
  }
}

function validatePromotionControlSourceBoundary(reviewedSources = reviewedPromotionControlSources) {
  assert.deepEqual(
    [...reviewedSources.keys()].sort(),
    Object.keys(REVIEWED_PROMOTION_CONTROL_SOURCE_SHA256).sort(),
    'promotion-control closure must contain exactly the reviewed policy, auditor, and hostile test sources'
  );
  for (const [relativePath, expectedDigest] of Object.entries(REVIEWED_PROMOTION_CONTROL_SOURCE_SHA256)) {
    const bytes = reviewedSources.get(relativePath);
    assert.ok(Buffer.isBuffer(bytes), `promotion-control closure is missing ${relativePath}`);
    assert.equal(
      createHash('sha256').update(bytes).digest('hex'),
      expectedDigest,
      `${relativePath} must match its reviewed SHA-256`
    );
  }

  const auditor = reviewedSources.get('scripts/github-control-audit.mjs').toString('utf8');
  const tests = reviewedSources.get('tests/github-control-audit.test.mjs').toString('utf8');
  const importSpecifiers = [...auditor.matchAll(/^import [^\r\n]+ from '([^']+)';$/gmu)].map(match => match[1]).sort();
  assert.deepEqual(importSpecifiers, [
    './strict-json.mjs',
    'node:crypto',
    'node:fs/promises',
    'node:path',
    'node:url',
    'node:util'
  ]);
  assert.equal((auditor.match(/^import\b/gmu) || []).length, importSpecifiers.length, 'auditor may use only reviewed static imports');
  for (const [label, source] of [['auditor', auditor], ['hostile tests', tests]]) {
    assert.doesNotMatch(source, /(?:^|['"])(?:node:)?(?:http|https|http2|net|tls|dgram|dns)(?:\/|['"])/mu, `${label} must not import a network primitive`);
    assert.doesNotMatch(source, /\b(?:fetch|WebSocket|EventSource|XMLHttpRequest|getBuiltinModule)\b/u, `${label} must not reference a network client or dynamic builtin resolver`);
    assert.doesNotMatch(source, /\b(?:eval|Function|Reflect|Proxy)\b|\bimport\s*\(/u, `${label} must not construct executable or dynamic-import code`);
    assert.doesNotMatch(source, /node:child_process|\b(?:execFile|execFileSync|execSync|spawn|spawnSync|fork)\s*\(/u, `${label} must not launch a subprocess`);
  }
  assert.match(auditor, /Default behavior is plan-only and makes no network request\./u);
  assert.match(auditor, /live execution is blocked while the promotion policy status is planned/u);
  assert.match(auditor, /planned-policy receipts must remain injected-test-only and promotion-ineligible/u);
  assert.doesNotMatch(auditor, /\b(?:POST|PUT|PATCH|DELETE)\b/u, 'auditor must not name a mutating HTTP method');
  assert.match(tests, /assert\.ok\(fixture\.calls\.every\(call => call\.method === 'GET'\)\)/u);
}

const [
  workflowNames,
  validateBytes,
  pagesBytes,
  packageBytes,
  syntheticFixtureBytes,
  stableBundleVerifierBytes,
  promotionControlAuditorBytes,
  promotionControlTestBytes,
  promotionControlPolicyBytes,
  packageLockBytes,
  nvmrcBytes,
  nodeVersionBytes
] = await Promise.all([
  readdir(WORKFLOW_DIRECTORY),
  readFile(VALIDATE_PATH),
  readFile(PAGES_PATH),
  readFile(PACKAGE_PATH),
  readFile(SYNTHETIC_FIXTURE_PATH),
  readFile(STABLE_BUNDLE_VERIFIER_PATH),
  readFile(PROMOTION_CONTROL_AUDITOR_PATH),
  readFile(PROMOTION_CONTROL_TEST_PATH),
  readFile(PROMOTION_CONTROL_POLICY_PATH),
  readFile(PACKAGE_LOCK_PATH),
  readFile(NVMRC_PATH),
  readFile(NODE_VERSION_PATH)
]);
const reviewedSyntheticSources = new Map(await Promise.all(
  Object.keys(REVIEWED_SYNTHETIC_SOURCE_SHA256).map(async relativePath => [
    relativePath,
    await readFile(path.join(REPOSITORY_ROOT, ...relativePath.split('/')))
  ])
));
const reviewedPromotionControlSources = new Map([
  ['scripts/github-control-audit.mjs', promotionControlAuditorBytes],
  ['tests/github-control-audit.test.mjs', promotionControlTestBytes],
  ['config/github-promotion-policy.v1.json', promotionControlPolicyBytes]
]);
const validateWorkflow = parseStrictYaml(validateBytes, 'validate workflow');
const pagesWorkflow = parseStrictYaml(pagesBytes, 'Pages hold workflow');
const packageDocument = parseStrictJson(packageBytes, 'package.json');
const packageLockDocument = parseStrictJson(packageLockBytes, 'package-lock.json');

test('workflow directory contains only the reviewed validation and Pages hold files', () => {
  validateWorkflowInventory(workflowNames);
});

test('validation CI is candidate-and-synthetic-only, cross-platform, byte-compared, and read-only', () => {
  validateValidationWorkflow(validateWorkflow);
});

test('Pages workflow remains a reusable preview-only build hold', () => {
  validatePagesHold(pagesWorkflow);
});

test('npm test covers release and bundle tools on the supported major toolchain without production smoke', () => {
  validatePackageTestClosure(packageDocument, packageLockDocument, nvmrcBytes, nodeVersionBytes);
});

test('synthetic fixture and bundle verifier stay local-only and independently fail closed', () => {
  validateSyntheticHelperBoundary(syntheticFixtureBytes, stableBundleVerifierBytes);
});

test('promotion-control plan and tests remain network-incapable and source-locked', () => {
  validatePromotionControlSourceBoundary();
});

test('promotion-control source policy rejects network, subprocess, and trust-anchor drift', async t => {
  const auditor = promotionControlAuditorBytes.toString('utf8');
  const tests = promotionControlTestBytes.toString('utf8');
  const policy = promotionControlPolicyBytes.toString('utf8');
  const mutations = [
    ['network import', `${auditor}\nimport https from 'node:https';\n`, tests, policy],
    ['direct fetch', `${auditor}\nawait fetch('https://api.github.com/');\n`, tests, policy],
    ['bracketed fetch', `${auditor}\nglobalThis['fetch']('https://api.github.com/');\n`, tests, policy],
    ['dynamic builtin', `${auditor}\nprocess.getBuiltinModule('https').get('https://api.github.com/');\n`, tests, policy],
    ['child process', `${auditor}\nspawnSync('curl', ['https://api.github.com/']);\n`, tests, policy],
    ['networked hostile test', auditor, `${tests}\nawait fetch('https://api.github.com/');\n`, policy],
    ['policy trust anchor', auditor, tests, policy.replace('https://api.github.com', 'https://example.invalid')]
  ];
  for (const [name, hostileAuditor, hostileTests, hostilePolicy] of mutations) {
    await t.test(name, () => {
      const sources = new Map([
        ['scripts/github-control-audit.mjs', Buffer.from(hostileAuditor)],
        ['tests/github-control-audit.test.mjs', Buffer.from(hostileTests)],
        ['config/github-promotion-policy.v1.json', Buffer.from(hostilePolicy)]
      ]);
      assert.throws(() => validatePromotionControlSourceBoundary(sources));
    });
  }
});

test('synthetic helper policy rejects future network and tag-porcelain allowlist entries', async t => {
  const source = syntheticFixtureBytes.toString('utf8');
  const mutations = [
    ['fetch', source.replace("JSON.stringify(['remote']),", "JSON.stringify(['fetch']),\n    JSON.stringify(['remote']),")],
    ['pull', source.replace("JSON.stringify(['remote']),", "JSON.stringify(['pull']),\n    JSON.stringify(['remote']),")],
    ['push', source.replace("JSON.stringify(['remote']),", "JSON.stringify(['push']),\n    JSON.stringify(['remote']),")],
    ['clone', source.replace("JSON.stringify(['remote']),", "JSON.stringify(['clone']),\n    JSON.stringify(['remote']),")],
    ['tag porcelain', source.replace("JSON.stringify(['remote']),", "JSON.stringify(['tag']),\n    JSON.stringify(['remote']),")],
    ['remote add', source.replace("JSON.stringify(['remote']),", "JSON.stringify(['remote', 'add']),\n    JSON.stringify(['remote']),")],
    ['network import', source.replace("import { execFileSync } from 'node:child_process';", "import { execFileSync } from 'node:child_process';\nimport https from 'node:https';")],
    ['dynamic network import', `${source}\nconst client = await import('node:https'); client.get('https://neb6dav.github.io/ai_tech_tree/');\n`],
    ['dynamic builtin resolution', `${source}\nconst client = process.getBuiltinModule('https'); client.get('https://example.invalid/');\n`],
    ['bracketed builtin resolution', `${source}\nconst client = process['getBuiltinModule']('https'); client.get('https://example.invalid/');\n`],
    ['bracketed fetch', `${source}\nglobalThis['fetch']('https://example.invalid/');\n`],
    ['reflected fetch', `${source}\nconst request = Reflect.get(globalThis, 'fetch'); await request('https://example.invalid/');\n`],
    ['direct child process call', `${source}\nexecFileSync('git', ['push', 'https://example.invalid/repo', 'HEAD']);\n`],
    [
      'additional child process binding',
      source.replace("import { execFileSync } from 'node:child_process';", "import { execFileSync, spawnSync } from 'node:child_process';")
    ],
    ['WebSocket client', `${source}\nconst socket = new WebSocket('wss://example.invalid/');\n`]
  ];
  for (const [label, hostileSource] of mutations) {
    await t.test(label, () => {
      assert.notEqual(hostileSource, source, `${label} mutation must alter the fixture helper`);
      assert.throws(() => validateSyntheticHelperBoundary(Buffer.from(hostileSource), stableBundleVerifierBytes));
    });
  }
  await t.test('transitive release tool drift', () => {
    const hostileSources = new Map(reviewedSyntheticSources);
    hostileSources.set(
      'scripts/release-assets.mjs',
      Buffer.concat([hostileSources.get('scripts/release-assets.mjs'), Buffer.from("\nfetch('https://example.invalid/');\n")])
    );
    assert.throws(
      () => validateSyntheticHelperBoundary(syntheticFixtureBytes, stableBundleVerifierBytes, hostileSources),
      /exact reviewed source-byte SHA-256/u
    );
  });
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
    ['promotion-control audit command', workflow => { workflow.jobs['build-and-test'].steps.push({ run: 'npm run plan:promotion-controls' }); }],
    ['ambient GitHub token', workflow => { workflow.jobs['build-and-test'].env = { GITHUB_TOKEN: '${{ github.token }}' }; }],
    ['stable asset command', workflow => {
      stepByName(workflow.jobs['candidate-assets'], 'Build exact candidate assets').run =
        'npm run build:stable-release-assets -- --repository-root "${{ github.workspace }}" --commit "${{ github.sha }}" --output-directory "${{ runner.temp }}/stable" --tag v0.1.1 --release-spec-path config/releases/v0.1.1.json --protected-main-ref refs/remotes/origin/main';
    }],
    ['release-mode staging command', workflow => {
      stepByName(workflow.jobs['build-and-test'], 'Build generated artifacts').run =
        'AI_TREE_STAGE_MODE=release npm run stage:site';
    }],
    ['annotated tag creation', workflow => { workflow.jobs['build-and-test'].steps.push({ run: 'git tag -a v0.1.1 -m release' }); }],
    ['GitHub Release creation', workflow => { workflow.jobs['build-and-test'].steps.push({ run: 'gh release create v0.1.1' }); }],
    ['GitHub environment mutation', workflow => { workflow.jobs['build-and-test'].steps.push({ run: 'gh api --method PUT repos/example/project/environments/github-pages' }); }],
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
    ['primary validation Node major drift', workflow => {
      stepByName(workflow.jobs['build-and-test'], 'Set up Node.js').with['node-version'] = 25;
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
    }],
    ['synthetic fixture runs outside pull requests', workflow => {
      workflow.jobs['synthetic-stable-assets'].if = undefined;
    }],
    ['synthetic fixture toolchain floats', workflow => {
      stepByName(workflow.jobs['synthetic-stable-assets'], 'Set up exact synthetic-fixture Node.js').with['node-version'] = 24;
    }],
    ['synthetic fixture bypasses npm wrapper', workflow => {
      stepByName(workflow.jobs['synthetic-stable-assets'], 'Build synthetic test-only stable assets').run =
        'node scripts/synthetic-stable-fixture.mjs --output-directory "${{ runner.temp }}/synthetic-stable-assets"';
    }],
    ['synthetic verifier mutation suite is skipped', workflow => {
      stepByName(workflow.jobs['synthetic-stable-assets'], 'Test synthetic stable bundle verifier').if = false;
    }],
    ['synthetic fixture points stable builder at real checkout', workflow => {
      stepByName(workflow.jobs['synthetic-stable-assets'], 'Build synthetic test-only stable assets').run =
        'npm run build:stable-release-assets -- --repository-root "${{ github.workspace }}" --commit "${{ github.sha }}" --output-directory "${{ runner.temp }}/stable"';
    }],
    ['synthetic verification drops exact identity flag', workflow => {
      stepByName(workflow.jobs['synthetic-stable-assets'], 'Independently verify synthetic test-only stable bundle').run =
        EXPECTED_SYNTHETIC_VERIFY.replace(' --require-synthetic-test-only', '');
    }],
    ['synthetic job receives release controls', workflow => {
      workflow.jobs['synthetic-stable-assets'].env = { AI_TREE_STAGE_MODE: 'release' };
    }],
    ['synthetic checkout fetches real tags', workflow => {
      stepByName(workflow.jobs['synthetic-stable-assets'], 'Check out the exact pull-request merge commit').with['fetch-tags'] = true;
    }],
    ['synthetic handoff loses test-only label', workflow => {
      stepByName(workflow.jobs['synthetic-stable-assets'], 'Upload synthetic test-only parity handoff').with.name =
        'stable-release-${{ github.sha }}-${{ matrix.platform }}';
    }],
    ['synthetic handoff is retained beyond one day', workflow => {
      stepByName(workflow.jobs['synthetic-stable-assets'], 'Upload synthetic test-only parity handoff').with['retention-days'] = 14;
    }],
    ['synthetic parity skips independent verification', workflow => {
      stepByName(workflow.jobs['synthetic-stable-assets-parity'], 'Independently verify bundles and exact four-file byte parity').run =
        'diff --recursive --brief "$RUNNER_TEMP/synthetic-stable-assets/ubuntu" "$RUNNER_TEMP/synthetic-stable-assets/windows"';
    }],
    ['synthetic parity uploads release-looking final bundle', workflow => {
      workflow.jobs['synthetic-stable-assets-parity'].steps.push({
        name: 'Upload stable release',
        uses: 'actions/upload-artifact@v4',
        with: { name: 'stable-release', path: '${{ runner.temp }}/synthetic-stable-assets/ubuntu' }
      });
    }],
    ['synthetic fixture pushes a tag', workflow => {
      workflow.jobs['synthetic-stable-assets'].steps.push({ run: 'git push origin v1.2.3' });
    }],
    ['synthetic fixture contacts production', workflow => {
      workflow.jobs['synthetic-stable-assets'].steps.push({ run: 'curl https://neb6dav.github.io/ai_tech_tree/' });
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
  await t.test('additional release workflow', () => {
    assert.throws(() => validateWorkflowInventory([...workflowNames, 'release.yml']));
  });
  await t.test('missing Pages hold workflow', () => {
    assert.throws(() => validateWorkflowInventory(workflowNames.filter(name => name !== 'pages.yml')));
  });
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
  await t.test('Pages Node major drift', () => {
    const hostile = clone(pagesWorkflow);
    stepByName(hostile.jobs.build, 'Set up Node.js').with['node-version'] = 25;
    assert.throws(() => validatePagesHold(hostile));
  });
  await t.test('stable assets enter Pages build', () => {
    const hostile = clone(pagesWorkflow);
    stepByName(hostile.jobs.build, 'Build, validate, and stage the public artifact').run =
      'npm run build:stable-release-assets -- --repository-root "$GITHUB_WORKSPACE" --commit "$GITHUB_SHA" --output-directory "$RUNNER_TEMP/stable" --tag v0.1.1 --release-spec-path config/releases/v0.1.1.json --protected-main-ref refs/remotes/origin/main';
    assert.throws(() => validatePagesHold(hostile));
  });
  await t.test('release mode enters Pages build', () => {
    const hostile = clone(pagesWorkflow);
    stepByName(hostile.jobs.build, 'Build, validate, and stage the public artifact').run =
      'AI_TREE_STAGE_MODE=release npm run stage:site';
    assert.throws(() => validatePagesHold(hostile));
  });
  await t.test('promotion-control audit enters Pages build', () => {
    const hostile = clone(pagesWorkflow);
    stepByName(hostile.jobs.build, 'Build, validate, and stage the public artifact').run =
      `${EXPECTED_PAGES_BUILD}npm run plan:promotion-controls\n`;
    assert.throws(() => validatePagesHold(hostile));
  });
  await t.test('production smoke enters npm test closure', () => {
    const hostile = clone(packageDocument);
    hostile.scripts.test += ' && npm run smoke:production';
    hostile.scripts['smoke:production'] = 'node scripts/post-deploy-smoke.mjs --execute';
    assert.throws(() => validatePackageTestClosure(hostile));
  });
  await t.test('promotion-control plan becomes executable', () => {
    const hostile = clone(packageDocument);
    hostile.scripts['plan:promotion-controls'] += ' --execute';
    assert.throws(() => validatePackageTestClosure(hostile));
  });
  await t.test('semicolon cannot conceal an npm production-smoke dependency', () => {
    const hostile = clone(packageDocument);
    hostile.scripts.test += '; npm run smoke:production';
    hostile.scripts['smoke:production'] = 'node scripts/post-deploy-smoke.mjs --execute';
    assert.throws(() => validatePackageTestClosure(hostile));
  });
  await t.test('unreviewed generic release helper', () => {
    const hostile = clone(packageDocument);
    hostile.scripts['release:ship'] = 'node scripts/ship.mjs';
    assert.throws(
      () => validatePackageTestClosure(hostile),
      /exact reviewed non-promoting command map/u
    );
  });
  await t.test('arbitrary innocuous-named promotion helper', () => {
    const hostile = clone(packageDocument);
    hostile.scripts['ops:handoff'] = 'node scripts/ship.mjs';
    assert.throws(
      () => validatePackageTestClosure(hostile),
      /exact reviewed non-promoting command map/u
    );
  });
  await t.test('stable builder allowlist cannot be redirected to promotion', () => {
    const hostile = clone(packageDocument);
    hostile.scripts['build:stable-release-assets'] = 'node scripts/promote-release.mjs';
    assert.throws(
      () => validatePackageTestClosure(hostile),
      /exact reviewed non-promoting command map/u
    );
  });
  await t.test('package Node engine drift', () => {
    const hostile = clone(packageDocument);
    hostile.engines.node = '>=24';
    assert.throws(() => validatePackageTestClosure(hostile));
  });
  await t.test('package-lock npm engine drift', () => {
    const hostileLock = clone(packageLockDocument);
    hostileLock.packages[''].engines.npm = '11.11.0';
    assert.throws(() => validatePackageTestClosure(packageDocument, hostileLock));
  });
  await t.test('local Node selector drift', () => {
    assert.throws(() => validatePackageTestClosure(
      packageDocument,
      packageLockDocument,
      Buffer.from('24.14.1\n'),
      nodeVersionBytes
    ));
  });
  const packagePromotionScenarios = [
    ['tag creation', 'release:tag', 'git tag v0.1.1'],
    ['GitHub Release creation', 'release:github', 'gh release create v0.1.1'],
    ['deployment entry point', 'deploy', 'node scripts/deploy.mjs'],
    ['release-mode staging', 'stage:release', 'AI_TREE_STAGE_MODE=release node scripts/stage-site.mjs'],
    ['quoted release-mode staging', 'stage:stable', 'node scripts/stage-site.mjs --mode "release"'],
    ['implicit npm version tag', 'version:stable', 'npm version 0.1.1'],
    ['executable post-deploy smoke', 'smoke:production', 'node scripts/post-deploy-smoke.mjs'],
    ['release promotion helper', 'release:promote', 'node scripts/promote-release.mjs'],
    ['direct GitHub release API call', 'release:api', 'curl https://api.github.com/repos/neb6dav/ai_tech_tree/releases']
  ];
  for (const [label, scriptName, command] of packagePromotionScenarios) {
    await t.test(label, () => {
      const hostile = clone(packageDocument);
      hostile.scripts[scriptName] = command;
      assert.throws(() => validatePackageTestClosure(hostile));
    });
  }
});
