import { createHash } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

import { parseStrictJson } from './strict-json.mjs';

const SCRIPT_VERSION = '1.0.0';
const POLICY_SCHEMA_VERSION = '1.0.0';
const RECEIPT_SCHEMA_VERSION = '1.0.0';
const DEFAULT_POLICY_PATH = 'config/github-promotion-policy.v1.json';
const DEFAULT_REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHA1_PATTERN = /^[0-9a-f]{40}$/u;

const EXPECTED_POLICY = Object.freeze({
  schemaVersion: POLICY_SCHEMA_VERSION,
  status: 'planned',
  repository: {
    owner: 'neb6dav',
    name: 'ai_tech_tree',
    fullName: 'neb6dav/ai_tech_tree',
    apiOrigin: 'https://api.github.com',
    apiVersion: '2026-03-10',
    defaultBranch: 'main',
    visibility: 'public'
  },
  release: {
    version: '0.1.1',
    tag: 'v0.1.1',
    releaseSpecPath: 'config/releases/v0.1.1.json',
    environment: 'github-pages'
  },
  limits: {
    maxPages: 4,
    maxResponseBytes: 1_048_576,
    maxTotalResponseBytes: 8_388_608,
    receiptFreshnessSeconds: 300,
    maxClockSkewSeconds: 30
  },
  rulesets: {
    main: {
      name: 'Curated Main',
      target: 'branch',
      sourceType: 'Repository',
      enforcement: 'active',
      conditions: { refName: { include: ['~DEFAULT_BRANCH'], exclude: [] } },
      bypassActors: [],
      rules: [
        { type: 'deletion' },
        { type: 'non_fast_forward' },
        { type: 'required_linear_history' },
        {
          type: 'pull_request',
          parameters: {
            allowed_merge_methods: ['squash'],
            automatic_copilot_code_review_enabled: false,
            dismiss_stale_reviews_on_push: true,
            require_code_owner_review: true,
            require_last_push_approval: true,
            required_approving_review_count: 1,
            required_review_thread_resolution: true
          }
        },
        {
          type: 'required_status_checks',
          parameters: {
            do_not_enforce_on_create: false,
            required_status_checks: [
              { context: 'Build, test, and verify generated files', integration_id: null }
            ],
            strict_required_status_checks_policy: true
          }
        }
      ]
    },
    tag: {
      name: 'Immutable v0.1.1 Tag',
      target: 'tag',
      sourceType: 'Repository',
      enforcement: 'active',
      conditions: { refName: { include: ['refs/tags/v0.1.1'], exclude: [] } },
      bypassActors: [],
      rules: [{ type: 'deletion' }, { type: 'non_fast_forward' }]
    }
  },
  environment: {
    name: 'github-pages',
    canAdminsBypass: false,
    deploymentBranchPolicy: { protectedBranches: true, customBranchPolicies: false },
    protectionRules: {
      exactTypes: ['branch_policy', 'required_reviewers'],
      requiredReviewers: { minimum: 1, allowedTypes: ['User', 'Team'], preventSelfReview: true }
    }
  },
  pages: { status: 'built', buildType: 'workflow', httpsEnforced: true, public: true },
  immutableReleases: { enabled: true },
  validation: {
    workflowFile: 'validate.yml',
    workflowPath: '.github/workflows/validate.yml',
    workflowName: 'Validate public artifact',
    workflowState: 'active',
    requiredEvent: 'push',
    requiredBranch: 'main',
    requiredJobName: 'Build, test, and verify generated files'
  }
});

function auditError(message) {
  return new Error(`github-control-audit: ${message}`);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function freezeDeep(value) {
  if (ArrayBuffer.isView(value)) return value;
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freezeDeep(child);
  }
  return value;
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw auditError(`${label} must be a plain object`);
  }
  return value;
}

function assertExactKeys(value, keys, label) {
  assertPlainObject(value, label);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (!isDeepStrictEqual(actual, expected)) {
    throw auditError(`${label} keys must be exactly ${expected.join(', ')}`);
  }
}

function assertNonemptyString(value, label) {
  if (typeof value !== 'string' || value.length === 0 || value.trim() !== value || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw auditError(`${label} must be a non-empty trimmed string without control characters`);
  }
  return value;
}

function assertFullCommit(value, label = 'expectedCommit') {
  if (!SHA1_PATTERN.test(value)) throw auditError(`${label} must be a full lowercase 40-character Git SHA-1`);
  return value;
}

function normalizePolicyDocument(document) {
  assertPlainObject(document, 'promotion policy');
  if (!isDeepStrictEqual(document, EXPECTED_POLICY)) {
    throw auditError('promotion policy must exactly match the reviewed repository trust anchors and control requirements');
  }
  return freezeDeep(clone(document));
}

export function validatePromotionPolicy(document) {
  return normalizePolicyDocument(document);
}

function assertPolicyRecord(policyRecord) {
  if (!policyRecord || policyRecord.path !== DEFAULT_POLICY_PATH || !Buffer.isBuffer(policyRecord.bytes)) {
    throw auditError('policyRecord must contain bytes loaded from the reviewed policy path');
  }
  if (!/^[0-9a-f]{64}$/u.test(policyRecord.sha256) || sha256(policyRecord.bytes) !== policyRecord.sha256) {
    throw auditError('policyRecord SHA-256 does not match its policy bytes');
  }
  const fromBytes = validatePromotionPolicy(parseStrictJson(policyRecord.bytes, DEFAULT_POLICY_PATH));
  if (!isDeepStrictEqual(fromBytes, policyRecord.policy)) {
    throw auditError('policyRecord object does not match its reviewed policy bytes');
  }
  return policyRecord;
}

async function canonicalRepositoryRoot(repositoryRoot) {
  if (typeof repositoryRoot !== 'string' || !path.isAbsolute(repositoryRoot)) {
    throw auditError('repositoryRoot must be an absolute path');
  }
  const requested = path.resolve(repositoryRoot);
  let canonical;
  let stats;
  try {
    canonical = await realpath(requested);
    stats = await lstat(requested);
  } catch (error) {
    throw auditError(`cannot inspect repositoryRoot: ${error.message}`);
  }
  if (stats.isSymbolicLink() || !stats.isDirectory()) throw auditError('repositoryRoot must be a real directory, not a link');
  const same = process.platform === 'win32'
    ? requested.toLocaleLowerCase('en-US') === canonical.toLocaleLowerCase('en-US')
    : requested === canonical;
  if (!same) throw auditError('repositoryRoot must use its canonical filesystem spelling');
  return canonical;
}

export async function loadPromotionPolicy(
  repositoryRoot = DEFAULT_REPOSITORY_ROOT,
  policyPath = DEFAULT_POLICY_PATH
) {
  if (policyPath !== DEFAULT_POLICY_PATH) {
    throw auditError(`policyPath must be exactly ${DEFAULT_POLICY_PATH}`);
  }
  const root = await canonicalRepositoryRoot(repositoryRoot);
  const absolutePath = path.join(root, ...policyPath.split('/'));
  let stats;
  let bytes;
  try {
    stats = await lstat(absolutePath);
    bytes = await readFile(absolutePath);
  } catch (error) {
    throw auditError(`cannot read ${policyPath}: ${error.message}`);
  }
  if (!stats.isFile() || stats.isSymbolicLink()) throw auditError(`${policyPath} must be a regular non-link file`);
  const policy = validatePromotionPolicy(parseStrictJson(bytes, policyPath));
  return freezeDeep({ path: policyPath, sha256: sha256(bytes), bytes: Buffer.from(bytes), policy });
}

const PLAN_PHASES = Object.freeze([
  ['repository', '/repos/neb6dav/ai_tech_tree'],
  ['main-ref-start', '/repos/neb6dav/ai_tech_tree/git/ref/heads/main'],
  ['ruleset-index', '/repos/neb6dav/ai_tech_tree/rulesets'],
  ['main-ruleset-detail', '/repos/neb6dav/ai_tech_tree/rulesets/{mainRulesetId}'],
  ['tag-ruleset-detail', '/repos/neb6dav/ai_tech_tree/rulesets/{tagRulesetId}'],
  ['effective-main-rules', '/repos/neb6dav/ai_tech_tree/rules/branches/main'],
  ['environment', '/repos/neb6dav/ai_tech_tree/environments/github-pages'],
  ['deployment-branch-policies', '/repos/neb6dav/ai_tech_tree/environments/github-pages/deployment-branch-policies'],
  ['pages', '/repos/neb6dav/ai_tech_tree/pages'],
  ['immutable-releases', '/repos/neb6dav/ai_tech_tree/immutable-releases'],
  ['validation-workflow', '/repos/neb6dav/ai_tech_tree/actions/workflows/validate.yml'],
  ['validation-runs', '/repos/neb6dav/ai_tech_tree/actions/workflows/{workflowId}/runs'],
  ['validation-jobs', '/repos/neb6dav/ai_tech_tree/actions/runs/{runId}/jobs'],
  ['main-ref-end', '/repos/neb6dav/ai_tech_tree/git/ref/heads/main']
].map(([phase, endpoint]) => Object.freeze({ phase, method: 'GET', endpoint })));

export function buildControlRequestPlan({ policyRecord, expectedCommit = null } = {}) {
  assertPolicyRecord(policyRecord);
  if (expectedCommit !== null) assertFullCommit(expectedCommit);
  return freezeDeep({
    schemaVersion: '1.0.0',
    toolVersion: SCRIPT_VERSION,
    mode: 'plan-only',
    networkRequested: false,
    policyStatus: policyRecord.policy.status,
    policyPath: policyRecord.path,
    policySha256: policyRecord.sha256,
    repository: policyRecord.policy.repository.fullName,
    apiOrigin: policyRecord.policy.repository.apiOrigin,
    apiVersion: policyRecord.policy.repository.apiVersion,
    expectedCommit,
    expectedCommitRequiredForAudit: expectedCommit === null,
    release: clone(policyRecord.policy.release),
    limits: clone(policyRecord.policy.limits),
    phases: PLAN_PHASES.map(item => ({ ...item })),
    authorization: {
      liveReadAuthorized: false,
      mutationAuthorized: false,
      tagAuthorized: false,
      releaseAuthorized: false,
      deploymentAuthorized: false
    }
  });
}

function requestKey(pathname, query = {}) {
  const search = new URLSearchParams();
  for (const key of Object.keys(query).sort()) search.set(key, String(query[key]));
  return `${pathname}${search.size > 0 ? `?${search}` : ''}`;
}

function validateRequest(pathname, query) {
  if (
    typeof pathname !== 'string' ||
    (pathname !== '/repos/neb6dav/ai_tech_tree' && !pathname.startsWith('/repos/neb6dav/ai_tech_tree/')) ||
    pathname.includes('..') ||
    pathname.includes('?') ||
    pathname.includes('#') ||
    /[\\\u0000-\u001f\u007f]/u.test(pathname)
  ) {
    throw auditError(`refusing noncanonical GitHub API path ${JSON.stringify(pathname)}`);
  }
  assertPlainObject(query, 'request query');
  for (const [key, value] of Object.entries(query)) {
    if (!/^[a-z_]+$/u.test(key) || !/^[A-Za-z0-9_.:-]+$/u.test(String(value))) {
      throw auditError(`request query contains unsupported key or value at ${key}`);
    }
  }
}

function normalizeHeaders(headers) {
  if (headers === undefined) return {};
  assertPlainObject(headers, 'response headers');
  const normalized = {};
  for (const [key, value] of Object.entries(headers)) {
    if (typeof value !== 'string') throw auditError(`response header ${key} must be a string`);
    const normalizedKey = key.toLowerCase();
    if (Object.hasOwn(normalized, normalizedKey)) throw auditError(`response contains duplicate header ${normalizedKey}`);
    normalized[normalizedKey] = value;
  }
  return normalized;
}

function normalizeResponse(response, expectedStatuses, label) {
  assertExactKeys(response, ['body', 'headers', 'status'], `${label} response`);
  if (!Number.isSafeInteger(response.status) || !expectedStatuses.includes(response.status)) {
    throw auditError(`${label} returned unexpected HTTP status ${response.status}`);
  }
  if (!Buffer.isBuffer(response.body)) throw auditError(`${label} response body must be a Buffer`);
  return { status: response.status, headers: normalizeHeaders(response.headers), body: response.body };
}

function parseLinkHeader(value, { origin, pathname, baseQuery, currentPage, maxPages }) {
  if (value === undefined || value === '') return null;
  const parts = value.split(/,\s*(?=<)/u);
  let next = null;
  let last = null;
  const seenRelations = new Set();
  for (const part of parts) {
    const match = /^<([^>]+)>;\s*rel="([a-z]+)"$/u.exec(part.trim());
    if (!match) throw auditError('pagination Link header is malformed');
    const relation = match[2];
    if (!['first', 'prev', 'next', 'last'].includes(relation)) throw auditError(`pagination Link rel ${relation} is unsupported`);
    if (seenRelations.has(relation)) throw auditError(`pagination Link header contains multiple ${relation} links`);
    seenRelations.add(relation);
    let url;
    try {
      url = new URL(match[1]);
    } catch (error) {
      throw auditError(`pagination next URL is invalid: ${error.message}`);
    }
    if (
      url.origin !== origin || url.username !== '' || url.password !== '' ||
      url.pathname !== pathname || url.hash !== ''
    ) {
      throw auditError('pagination next URL escapes the fixed GitHub endpoint');
    }
    const pageText = url.searchParams.get('page');
    if (!/^[1-9]\d*$/u.test(pageText ?? '')) throw auditError(`pagination ${relation} URL has an invalid page`);
    const linkedPage = Number(pageText);
    const expectedPage = relation === 'first'
      ? 1
      : relation === 'prev'
        ? currentPage - 1
        : relation === 'next'
          ? currentPage + 1
          : linkedPage;
    if (
      linkedPage !== expectedPage || linkedPage > maxPages ||
      (relation === 'prev' && currentPage <= 1) ||
      (relation === 'last' && linkedPage < currentPage)
    ) {
      throw auditError(`pagination ${relation} URL has an inconsistent page`);
    }
    const expected = Object.entries({ ...baseQuery, page: expectedPage, per_page: 100 })
      .map(([key, item]) => [key, String(item)])
      .sort(([left], [right]) => left.localeCompare(right));
    const actual = [...url.searchParams.entries()].sort(([left], [right]) => left.localeCompare(right));
    if (!isDeepStrictEqual(actual, expected)) {
      throw auditError('pagination next URL changed fixed query parameters or page order');
    }
    if (relation === 'next') {
      if (currentPage >= maxPages) throw auditError('pagination exceeds the configured page limit');
      next = currentPage + 1;
    }
    if (relation === 'last') last = linkedPage;
  }
  if (last !== null && last > currentPage && next === null) {
    throw auditError('pagination Link advertises a later last page without an exact next link');
  }
  if (last !== null && next !== null && last < next) {
    throw auditError('pagination Link last page precedes its next page');
  }
  if (last === currentPage && next !== null) {
    throw auditError('pagination Link advertises a next page after the last page');
  }
  return next;
}

function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value)}\n`, 'utf8');
}

function isoTime(value, label) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.valueOf())) throw auditError(`${label} must be a valid time`);
  return date.toISOString();
}

function compareJson(actual, expected, label) {
  if (!isDeepStrictEqual(actual, expected)) throw auditError(`${label} does not match the reviewed policy`);
}

function normalizeRule(rule) {
  assertPlainObject(rule, 'ruleset rule');
  const normalized = { type: rule.type };
  if (Object.hasOwn(rule, 'parameters')) normalized.parameters = rule.parameters;
  return normalized;
}

function assertRulesetDetail(document, expected, expectedId, label) {
  assertPlainObject(document, label);
  if (!Object.hasOwn(document, 'bypass_actors')) throw auditError(`${label} omits bypass_actors and is not auditable`);
  compareJson(document.bypass_actors, expected.bypassActors, `${label}.bypass_actors`);
  if (document.id !== expectedId || document.name !== expected.name || document.target !== expected.target || document.source_type !== expected.sourceType || document.enforcement !== expected.enforcement) {
    throw auditError(`${label} identity or enforcement does not match the reviewed policy`);
  }
  const conditions = {
    refName: {
      include: document.conditions?.ref_name?.include,
      exclude: document.conditions?.ref_name?.exclude
    }
  };
  compareJson(conditions, expected.conditions, `${label}.conditions`);
  if (!Array.isArray(document.rules)) throw auditError(`${label}.rules must be an array`);
  compareJson(document.rules.map(normalizeRule), expected.rules, `${label}.rules`);
}

function assertEffectiveMainRules(document, expectedRules, mainRulesetId) {
  if (!Array.isArray(document)) throw auditError('effective main rules response must be an array');
  const fromMainRuleset = document.filter(rule =>
    rule?.ruleset_id === mainRulesetId && rule?.ruleset_source_type === 'Repository' &&
    rule?.ruleset_source === 'neb6dav/ai_tech_tree'
  );
  const normalized = fromMainRuleset.map(normalizeRule);
  for (const expected of expectedRules) {
    if (!normalized.some(actual => isDeepStrictEqual(actual, expected))) {
      throw auditError(`effective main rules omit ${expected.type}`);
    }
  }
}

function assertMainRef(document, expectedCommit, label) {
  assertPlainObject(document, label);
  if (document.ref !== 'refs/heads/main' || document.object?.type !== 'commit' || document.object?.sha !== expectedCommit) {
    throw auditError(`${label} does not identify the exact expected main commit`);
  }
}

function assertRepository(document, policy) {
  assertPlainObject(document, 'repository response');
  if (
    document.full_name !== policy.repository.fullName ||
    document.default_branch !== policy.repository.defaultBranch ||
    document.visibility !== policy.repository.visibility ||
    document.archived !== false || document.disabled !== false
  ) {
    throw auditError('repository identity, visibility, or active state does not match policy');
  }
}

function assertEnvironment(document, policy) {
  assertPlainObject(document, 'environment response');
  if (!Object.hasOwn(document, 'can_admins_bypass')) throw auditError('environment response omits can_admins_bypass');
  if (document.name !== policy.environment.name || document.can_admins_bypass !== false) {
    throw auditError('environment name or administrator-bypass state does not match policy');
  }
  compareJson(document.deployment_branch_policy, {
    protected_branches: policy.environment.deploymentBranchPolicy.protectedBranches,
    custom_branch_policies: policy.environment.deploymentBranchPolicy.customBranchPolicies
  }, 'environment deployment branch policy');
  if (!Array.isArray(document.protection_rules)) throw auditError('environment protection_rules must be an array');
  const types = document.protection_rules.map(rule => rule?.type).sort();
  compareJson(types, [...policy.environment.protectionRules.exactTypes].sort(), 'environment protection rule types');
  const reviewerRule = document.protection_rules.find(rule => rule?.type === 'required_reviewers');
  if (!reviewerRule || reviewerRule.prevent_self_review !== true || !Array.isArray(reviewerRule.reviewers)) {
    throw auditError('environment required-reviewer rule is incomplete');
  }
  if (reviewerRule.reviewers.length < policy.environment.protectionRules.requiredReviewers.minimum) {
    throw auditError('environment has too few required reviewers');
  }
  for (const entry of reviewerRule.reviewers) {
    if (!policy.environment.protectionRules.requiredReviewers.allowedTypes.includes(entry?.type)) {
      throw auditError('environment contains an unsupported reviewer type');
    }
    if (!entry.reviewer || !Number.isSafeInteger(entry.reviewer.id) || entry.reviewer.id <= 0) {
      throw auditError('environment reviewer identity is incomplete');
    }
    if (entry.type === 'User') assertNonemptyString(entry.reviewer.login, 'environment user reviewer login');
    if (entry.type === 'Team') assertNonemptyString(entry.reviewer.slug, 'environment team reviewer slug');
  }
}

function assertDeploymentPolicies(document) {
  assertPlainObject(document, 'deployment branch policies response');
  if (document.total_count !== 0 || !Array.isArray(document.branch_policies) || document.branch_policies.length !== 0) {
    throw auditError('protected-branch environment must not contain custom deployment branch policies');
  }
}

function assertPages(document, policy) {
  assertPlainObject(document, 'Pages response');
  if (
    document.status !== policy.pages.status || document.build_type !== policy.pages.buildType ||
    document.https_enforced !== policy.pages.httpsEnforced || document.public !== policy.pages.public
  ) {
    throw auditError('Pages state does not match policy');
  }
}

function assertImmutableReleases(document, policy) {
  assertPlainObject(document, 'immutable Releases response');
  if (document.enabled !== policy.immutableReleases.enabled) throw auditError('immutable Releases are not enabled');
}

function assertWorkflow(document, policy) {
  assertPlainObject(document, 'validation workflow response');
  if (!Number.isSafeInteger(document.id) || document.id <= 0) throw auditError('validation workflow ID is invalid');
  if (
    document.name !== policy.validation.workflowName || document.path !== policy.validation.workflowPath ||
    document.state !== policy.validation.workflowState
  ) {
    throw auditError('validation workflow identity or state does not match policy');
  }
  return document.id;
}

function selectSuccessfulRun(runs, policy, expectedCommit, workflowId) {
  const matches = runs.filter(run =>
    run?.workflow_id === workflowId && run?.head_sha === expectedCommit &&
    run?.head_branch === policy.validation.requiredBranch && run?.event === policy.validation.requiredEvent &&
    run?.status === 'completed' && run?.conclusion === 'success' &&
    run?.path === policy.validation.workflowPath && Number.isSafeInteger(run?.id) && run.id > 0 &&
    Number.isSafeInteger(run?.run_attempt) && run.run_attempt > 0
  );
  if (matches.length === 0) throw auditError('no exact successful validation workflow run exists for the expected commit');
  const ids = new Set(matches.map(run => run.id));
  if (ids.size !== matches.length) throw auditError('validation workflow run list contains duplicate IDs');
  return [...matches].sort((a, b) => b.id - a.id)[0];
}

function assertSuccessfulJob(jobs, policy, run, expectedCommit) {
  const matches = jobs.filter(job =>
    job?.name === policy.validation.requiredJobName && job?.status === 'completed' &&
    job?.conclusion === 'success' && job?.run_id === run.id && job?.run_attempt === run.run_attempt &&
    job?.head_sha === expectedCommit && job?.workflow_name === policy.validation.workflowName &&
    Number.isSafeInteger(job?.id) && job.id > 0
  );
  if (matches.length !== 1) throw auditError('validation run must contain exactly one successful required job');
  return matches[0];
}

function createAuditSession({ policyRecord, expectedCommit, transport, clock, evidenceSource }) {
  if (typeof transport !== 'function') throw auditError('transport must be an injected function');
  const policy = policyRecord.policy;
  const evidence = [];
  let totalBytes = 0;

  async function requestJson(pathname, query = {}, expectedStatuses = [200]) {
    validateRequest(pathname, query);
    const descriptor = freezeDeep({ method: 'GET', path: pathname, query: { ...query }, expectedStatuses: [...expectedStatuses] });
    const response = normalizeResponse(await transport(descriptor), expectedStatuses, requestKey(pathname, query));
    if (response.body.length > policy.limits.maxResponseBytes) throw auditError('response exceeds maxResponseBytes');
    totalBytes += response.body.length;
    if (totalBytes > policy.limits.maxTotalResponseBytes) throw auditError('audit exceeds maxTotalResponseBytes');
    evidence.push({
      sequence: evidence.length + 1,
      method: 'GET',
      path: pathname,
      query: { ...query },
      status: response.status,
      bytes: response.body.length,
      sha256: sha256(response.body)
    });
    return { document: parseStrictJson(response.body, requestKey(pathname, query)), headers: response.headers };
  }

  async function requestPaginated(pathname, baseQuery, extract, idLabel) {
    const items = [];
    const ids = new Set();
    let declaredTotal = null;
    let page = 1;
    for (;;) {
      const query = { ...baseQuery, page, per_page: 100 };
      const { document, headers } = await requestJson(pathname, query);
      const extracted = extract(document);
      const pageItems = Array.isArray(extracted) ? extracted : extracted?.items;
      if (!Array.isArray(pageItems)) throw auditError(`${idLabel} page must contain an array`);
      if (!Array.isArray(extracted)) {
        if (!Number.isSafeInteger(extracted?.totalCount) || extracted.totalCount < 0) throw auditError(`${idLabel} total_count is invalid`);
        if (declaredTotal === null) declaredTotal = extracted.totalCount;
        if (declaredTotal !== extracted.totalCount) throw auditError(`${idLabel} total_count changed across pages`);
      }
      for (const item of pageItems) {
        if (!Number.isSafeInteger(item?.id) || item.id <= 0) throw auditError(`${idLabel} item ID is invalid`);
        if (ids.has(item.id)) throw auditError(`${idLabel} contains duplicate ID ${item.id}`);
        ids.add(item.id);
        items.push(item);
      }
      const next = parseLinkHeader(headers.link, {
        origin: policy.repository.apiOrigin,
        pathname,
        baseQuery,
        currentPage: page,
        maxPages: policy.limits.maxPages
      });
      if (next === null) break;
      page = next;
    }
    if (declaredTotal !== null && declaredTotal !== items.length) throw auditError(`${idLabel} total_count does not match complete pagination`);
    return items;
  }

  return { requestJson, requestPaginated, evidence, getTotalBytes: () => totalBytes, clock, evidenceSource, policy, expectedCommit };
}

async function performAudit({ policyRecord, expectedCommit, transport, clock, evidenceSource }) {
  assertPolicyRecord(policyRecord);
  assertFullCommit(expectedCommit);
  const session = createAuditSession({ policyRecord, expectedCommit, transport, clock, evidenceSource });
  const { policy } = session;

  const repository = (await session.requestJson('/repos/neb6dav/ai_tech_tree')).document;
  assertRepository(repository, policy);
  const mainStart = (await session.requestJson('/repos/neb6dav/ai_tech_tree/git/ref/heads/main')).document;
  assertMainRef(mainStart, expectedCommit, 'initial main ref');

  const rulesets = await session.requestPaginated(
    '/repos/neb6dav/ai_tech_tree/rulesets',
    { includes_parents: 'false' },
    document => document,
    'ruleset index'
  );
  const mainMatches = rulesets.filter(item => item.name === policy.rulesets.main.name && item.target === 'branch');
  const tagMatches = rulesets.filter(item => item.name === policy.rulesets.tag.name && item.target === 'tag');
  if (mainMatches.length !== 1 || tagMatches.length !== 1) throw auditError('ruleset index must contain exactly one reviewed main and tag ruleset');
  const mainDetail = (await session.requestJson(`/repos/neb6dav/ai_tech_tree/rulesets/${mainMatches[0].id}`)).document;
  const tagDetail = (await session.requestJson(`/repos/neb6dav/ai_tech_tree/rulesets/${tagMatches[0].id}`)).document;
  assertRulesetDetail(mainDetail, policy.rulesets.main, mainMatches[0].id, 'main ruleset');
  assertRulesetDetail(tagDetail, policy.rulesets.tag, tagMatches[0].id, 'tag ruleset');

  const effectiveRules = (await session.requestJson('/repos/neb6dav/ai_tech_tree/rules/branches/main')).document;
  assertEffectiveMainRules(effectiveRules, policy.rulesets.main.rules, mainMatches[0].id);
  const environment = (await session.requestJson('/repos/neb6dav/ai_tech_tree/environments/github-pages')).document;
  assertEnvironment(environment, policy);
  const branchPolicies = (await session.requestJson('/repos/neb6dav/ai_tech_tree/environments/github-pages/deployment-branch-policies', { page: 1, per_page: 100 })).document;
  assertDeploymentPolicies(branchPolicies);
  assertPages((await session.requestJson('/repos/neb6dav/ai_tech_tree/pages')).document, policy);
  assertImmutableReleases((await session.requestJson('/repos/neb6dav/ai_tech_tree/immutable-releases')).document, policy);
  const workflow = (await session.requestJson('/repos/neb6dav/ai_tech_tree/actions/workflows/validate.yml')).document;
  const workflowId = assertWorkflow(workflow, policy);
  const runs = await session.requestPaginated(
    `/repos/neb6dav/ai_tech_tree/actions/workflows/${workflowId}/runs`,
    { branch: 'main', event: 'push', head_sha: expectedCommit, status: 'success' },
    document => ({ items: document?.workflow_runs, totalCount: document?.total_count }),
    'validation workflow runs'
  );
  const run = selectSuccessfulRun(runs, policy, expectedCommit, workflowId);
  const jobs = await session.requestPaginated(
    `/repos/neb6dav/ai_tech_tree/actions/runs/${run.id}/jobs`,
    { filter: 'latest' },
    document => ({ items: document?.jobs, totalCount: document?.total_count }),
    'validation workflow jobs'
  );
  const job = assertSuccessfulJob(jobs, policy, run, expectedCommit);
  const mainEnd = (await session.requestJson('/repos/neb6dav/ai_tech_tree/git/ref/heads/main')).document;
  assertMainRef(mainEnd, expectedCommit, 'final main ref');

  const observedAt = isoTime(clock(), 'clock');
  const expiresAt = new Date(new Date(observedAt).valueOf() + policy.limits.receiptFreshnessSeconds * 1000).toISOString();
  const receipt = {
    schemaVersion: RECEIPT_SCHEMA_VERSION,
    toolVersion: SCRIPT_VERSION,
    scope: 'injected-control-response-shape-test',
    evidenceSource,
    promotionEligible: evidenceSource === 'github-api-live',
    policy: { path: policyRecord.path, sha256: policyRecord.sha256, schemaVersion: policy.schemaVersion, status: policy.status },
    repository: policy.repository.fullName,
    release: { version: policy.release.version, tag: policy.release.tag, environment: policy.release.environment },
    expectedCommit,
    observedAt,
    expiresAt,
    requestCount: session.evidence.length,
    responseBytes: session.getTotalBytes(),
    attestations: {
      githubControlsObservedLive: false,
      releaseSpecVerified: false,
      tagTargetVerified: false,
      toolSourceVerifiedAtExpectedCommit: false,
      workflowBlobVerifiedAtExpectedCommit: false
    },
    checks: {
      repositoryIdentity: true,
      mainRefBookended: true,
      mainRuleset: true,
      tagRuleset: true,
      effectiveMainRules: true,
      protectedEnvironment: true,
      pages: true,
      immutableReleases: true,
      exactValidationRun: true,
      exactValidationJob: true
    },
    rulesetEvidence: { mainId: mainMatches[0].id, tagId: tagMatches[0].id },
    validationEvidence: { workflowId, runId: run.id, jobId: job.id, event: run.event, conclusion: run.conclusion },
    evidence: session.evidence,
    summary: {
      status: 'fixture-controls-match-policy',
      auditorRequestedOnlyGets: true,
      transportSideEffectsAttested: false,
      externalMutationAuthorized: false
    }
  };
  return freezeDeep(receipt);
}

export async function auditPromotionControls({ policyRecord, expectedCommit, transport, clock = () => new Date() } = {}) {
  return performAudit({ policyRecord, expectedCommit, transport, clock, evidenceSource: 'injected-test-only' });
}

function assertReceiptEvidenceSequence(evidence, rulesetEvidence, validationEvidence, expectedCommit) {
  let index = 0;
  function take(pathname, query = {}) {
    const entry = evidence[index];
    if (!entry || entry.path !== pathname || !isDeepStrictEqual(entry.query, query)) {
      throw auditError(`control receipt evidence does not match required phase ${index + 1}`);
    }
    index += 1;
  }
  function takePages(pathname, baseQuery) {
    let page = 1;
    let count = 0;
    while (evidence[index]?.path === pathname) {
      take(pathname, { ...baseQuery, page, per_page: 100 });
      page += 1;
      count += 1;
    }
    if (count === 0) throw auditError(`control receipt evidence omits paginated phase ${pathname}`);
  }

  take('/repos/neb6dav/ai_tech_tree');
  take('/repos/neb6dav/ai_tech_tree/git/ref/heads/main');
  takePages('/repos/neb6dav/ai_tech_tree/rulesets', { includes_parents: 'false' });
  take(`/repos/neb6dav/ai_tech_tree/rulesets/${rulesetEvidence.mainId}`);
  take(`/repos/neb6dav/ai_tech_tree/rulesets/${rulesetEvidence.tagId}`);
  take('/repos/neb6dav/ai_tech_tree/rules/branches/main');
  take('/repos/neb6dav/ai_tech_tree/environments/github-pages');
  take('/repos/neb6dav/ai_tech_tree/environments/github-pages/deployment-branch-policies', { page: 1, per_page: 100 });
  take('/repos/neb6dav/ai_tech_tree/pages');
  take('/repos/neb6dav/ai_tech_tree/immutable-releases');
  take('/repos/neb6dav/ai_tech_tree/actions/workflows/validate.yml');
  takePages(`/repos/neb6dav/ai_tech_tree/actions/workflows/${validationEvidence.workflowId}/runs`, {
    branch: 'main', event: 'push', head_sha: expectedCommit, status: 'success'
  });
  takePages(`/repos/neb6dav/ai_tech_tree/actions/runs/${validationEvidence.runId}/jobs`, { filter: 'latest' });
  take('/repos/neb6dav/ai_tech_tree/git/ref/heads/main');
  if (index !== evidence.length) throw auditError('control receipt evidence contains unreviewed trailing phases');
}

function assertReceiptShape(receipt, { policyRecord, expectedCommit }) {
  assertExactKeys(receipt, [
    'attestations', 'checks', 'evidence', 'evidenceSource', 'expectedCommit', 'expiresAt', 'policy',
    'promotionEligible', 'release', 'repository', 'requestCount', 'responseBytes', 'rulesetEvidence',
    'schemaVersion', 'scope', 'summary', 'toolVersion', 'validationEvidence', 'observedAt'
  ], 'control receipt');
  if (receipt.schemaVersion !== RECEIPT_SCHEMA_VERSION || receipt.toolVersion !== SCRIPT_VERSION) throw auditError('control receipt version is unsupported');
  if (receipt.repository !== policyRecord.policy.repository.fullName || receipt.expectedCommit !== expectedCommit) throw auditError('control receipt repository or commit is inconsistent');
  if (receipt.scope !== 'injected-control-response-shape-test') throw auditError('control receipt scope is unsupported');
  compareJson(receipt.policy, { path: policyRecord.path, sha256: policyRecord.sha256, schemaVersion: POLICY_SCHEMA_VERSION, status: policyRecord.policy.status }, 'control receipt policy');
  compareJson(receipt.release, { version: '0.1.1', tag: 'v0.1.1', environment: 'github-pages' }, 'control receipt release');
  if (policyRecord.policy.status === 'planned') {
    if (receipt.evidenceSource !== 'injected-test-only' || receipt.promotionEligible !== false) {
      throw auditError('planned-policy receipts must remain injected-test-only and promotion-ineligible');
    }
  } else if (!['injected-test-only', 'github-api-live'].includes(receipt.evidenceSource)) {
    throw auditError('control receipt evidenceSource is unsupported');
  } else if (receipt.promotionEligible !== (receipt.evidenceSource === 'github-api-live')) {
    throw auditError('control receipt promotion eligibility contradicts its evidence source');
  }
  const observed = new Date(receipt.observedAt);
  const expires = new Date(receipt.expiresAt);
  if (Number.isNaN(observed.valueOf()) || observed.toISOString() !== receipt.observedAt || Number.isNaN(expires.valueOf()) || expires.toISOString() !== receipt.expiresAt) {
    throw auditError('control receipt timestamps must be canonical ISO instants');
  }
  if (expires.valueOf() - observed.valueOf() !== policyRecord.policy.limits.receiptFreshnessSeconds * 1000) throw auditError('control receipt freshness window is inconsistent');
  if (!Number.isSafeInteger(receipt.requestCount) || receipt.requestCount <= 0 || receipt.requestCount !== receipt.evidence.length) throw auditError('control receipt request count is inconsistent');
  if (!Number.isSafeInteger(receipt.responseBytes) || receipt.responseBytes < 0 || receipt.responseBytes > policyRecord.policy.limits.maxTotalResponseBytes) throw auditError('control receipt response byte count is invalid');
  let byteTotal = 0;
  receipt.evidence.forEach((entry, index) => {
    assertExactKeys(entry, ['bytes', 'method', 'path', 'query', 'sequence', 'sha256', 'status'], `control receipt evidence ${index + 1}`);
    if (entry.sequence !== index + 1 || entry.method !== 'GET' || entry.status !== 200) throw auditError('control receipt evidence sequence, method, or status is invalid');
    validateRequest(entry.path, entry.query);
    if (!Number.isSafeInteger(entry.bytes) || entry.bytes < 0 || entry.bytes > policyRecord.policy.limits.maxResponseBytes || !/^[0-9a-f]{64}$/u.test(entry.sha256)) throw auditError('control receipt evidence byte/hash metadata is invalid');
    byteTotal += entry.bytes;
  });
  if (byteTotal !== receipt.responseBytes) throw auditError('control receipt response byte total is inconsistent');
  const expectedChecks = {
    repositoryIdentity: true, mainRefBookended: true, mainRuleset: true, tagRuleset: true,
    effectiveMainRules: true, protectedEnvironment: true, pages: true, immutableReleases: true,
    exactValidationRun: true, exactValidationJob: true
  };
  compareJson(receipt.checks, expectedChecks, 'control receipt checks');
  compareJson(receipt.attestations, {
    githubControlsObservedLive: false,
    releaseSpecVerified: false,
    tagTargetVerified: false,
    toolSourceVerifiedAtExpectedCommit: false,
    workflowBlobVerifiedAtExpectedCommit: false
  }, 'control receipt attestations');
  compareJson(receipt.summary, {
    status: 'fixture-controls-match-policy',
    auditorRequestedOnlyGets: true,
    transportSideEffectsAttested: false,
    externalMutationAuthorized: false
  }, 'control receipt summary');
  assertExactKeys(receipt.rulesetEvidence, ['mainId', 'tagId'], 'control receipt ruleset evidence');
  for (const key of ['mainId', 'tagId']) if (!Number.isSafeInteger(receipt.rulesetEvidence[key]) || receipt.rulesetEvidence[key] <= 0) throw auditError(`control receipt ${key} is invalid`);
  if (receipt.rulesetEvidence.mainId === receipt.rulesetEvidence.tagId) throw auditError('control receipt ruleset IDs must be distinct');
  assertExactKeys(receipt.validationEvidence, ['conclusion', 'event', 'jobId', 'runId', 'workflowId'], 'control receipt validation evidence');
  if (receipt.validationEvidence.event !== 'push' || receipt.validationEvidence.conclusion !== 'success') throw auditError('control receipt validation evidence is not a successful push');
  for (const key of ['workflowId', 'runId', 'jobId']) if (!Number.isSafeInteger(receipt.validationEvidence[key]) || receipt.validationEvidence[key] <= 0) throw auditError(`control receipt ${key} is invalid`);
  assertReceiptEvidenceSequence(receipt.evidence, receipt.rulesetEvidence, receipt.validationEvidence, expectedCommit);
  return freezeDeep(clone(receipt));
}

export function validateControlReceipt(bytes, { policyRecord, expectedCommit } = {}) {
  if (!Buffer.isBuffer(bytes)) throw auditError('control receipt must be supplied as bytes');
  assertFullCommit(expectedCommit);
  assertPolicyRecord(policyRecord);
  return assertReceiptShape(parseStrictJson(bytes, 'control receipt'), { policyRecord, expectedCommit });
}

export function assertFreshLiveControlReceipt(receipt, { policyRecord, expectedCommit, now = new Date() } = {}) {
  if (policyRecord?.policy?.status !== 'ready') {
    throw auditError('live promotion-control receipts cannot be accepted while the reviewed policy is planned');
  }
  const validated = assertReceiptShape(receipt, { policyRecord, expectedCommit: assertFullCommit(expectedCommit) });
  if (validated.evidenceSource !== 'github-api-live' || validated.promotionEligible !== true) {
    throw auditError('only a live GitHub API receipt may satisfy promotion control freshness');
  }
  const current = new Date(now);
  if (Number.isNaN(current.valueOf())) throw auditError('now must be a valid time');
  const skew = policyRecord.policy.limits.maxClockSkewSeconds * 1000;
  const observed = new Date(validated.observedAt).valueOf();
  const expires = new Date(validated.expiresAt).valueOf();
  if (current.valueOf() < observed - skew || current.valueOf() > expires) throw auditError('live control receipt is outside its permitted freshness window');
  return validated;
}

function parseCli(argv) {
  const result = { repositoryRoot: DEFAULT_REPOSITORY_ROOT, policyPath: DEFAULT_POLICY_PATH, expectedCommit: null, execute: false, help: false };
  const seen = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help') {
      if (seen.has(argument)) throw auditError('duplicate --help');
      seen.add(argument); result.help = true; continue;
    }
    if (argument === '--execute') {
      if (seen.has(argument)) throw auditError('duplicate --execute');
      seen.add(argument); result.execute = true; continue;
    }
    const mapping = new Map([
      ['--repository-root', 'repositoryRoot'], ['--policy', 'policyPath'], ['--expected-commit', 'expectedCommit']
    ]);
    if (!mapping.has(argument)) throw auditError(`unknown argument ${argument}`);
    if (seen.has(argument)) throw auditError(`duplicate ${argument}`);
    seen.add(argument);
    index += 1;
    if (index >= argv.length || argv[index].startsWith('--')) throw auditError(`${argument} requires a value`);
    result[mapping.get(argument)] = argv[index];
  }
  if (result.help && seen.size !== 1) throw auditError('--help must be used by itself');
  return result;
}

const HELP = `Usage: node scripts/github-control-audit.mjs [options]

Default behavior is plan-only and makes no network request.

Options:
  --repository-root <absolute-path>  Repository checkout (default: script checkout)
  --policy <path>                   Must be config/github-promotion-policy.v1.json
  --expected-commit <40-hex-sha>    Intended finalized commit for an audit plan
  --execute                         Reserved for a separately authorized live read; rejected while policy is planned
  --help                            Show this help

This tool never creates a tag or Release, changes GitHub settings, deploys Pages, or authorizes mutation.
`;

export async function runCli(argv, { stdout = process.stdout, stderr = process.stderr } = {}) {
  try {
    const options = parseCli(argv);
    if (options.help) {
      stdout.write(HELP);
      return 0;
    }
    const policyRecord = await loadPromotionPolicy(options.repositoryRoot, options.policyPath);
    if (options.expectedCommit !== null) assertFullCommit(options.expectedCommit);
    if (options.execute) {
      if (policyRecord.policy.status !== 'ready') throw auditError('live execution is blocked while the promotion policy status is planned');
      throw auditError('live execution is not activated in this repository checkpoint');
    }
    stdout.write(`${JSON.stringify(buildControlRequestPlan({ policyRecord, expectedCommit: options.expectedCommit }), null, 2)}\n`);
    return 0;
  } catch (error) {
    stderr.write(`${error.message}\n`);
    return 1;
  }
}

export const githubControlAuditConstants = freezeDeep({
  scriptVersion: SCRIPT_VERSION,
  policySchemaVersion: POLICY_SCHEMA_VERSION,
  receiptSchemaVersion: RECEIPT_SCHEMA_VERSION,
  defaultPolicyPath: DEFAULT_POLICY_PATH,
  defaultRepositoryRoot: DEFAULT_REPOSITORY_ROOT,
  expectedPolicy: clone(EXPECTED_POLICY)
});

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await runCli(process.argv.slice(2));
}
