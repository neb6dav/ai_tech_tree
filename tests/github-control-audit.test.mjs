import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  assertFreshLiveControlReceipt,
  auditPromotionControls,
  buildControlRequestPlan,
  githubControlAuditConstants,
  loadPromotionPolicy,
  runCli,
  validateControlReceipt,
  validatePromotionPolicy
} from '../scripts/github-control-audit.mjs';

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXPECTED_COMMIT = '0123456789abcdef0123456789abcdef01234567';
const OBSERVED_AT = new Date('2026-08-20T22:00:00.000Z');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function response(document, headers = {}) {
  return { status: 200, headers, body: Buffer.from(`${JSON.stringify(document)}\n`, 'utf8') };
}

function requestKey(request) {
  const search = new URLSearchParams();
  for (const key of Object.keys(request.query).sort()) search.set(key, String(request.query[key]));
  return `${request.path}${search.size > 0 ? `?${search}` : ''}`;
}

function apiRuleset(expected, id) {
  return {
    id,
    name: expected.name,
    target: expected.target,
    source: 'neb6dav/ai_tech_tree',
    source_type: expected.sourceType,
    enforcement: expected.enforcement,
    conditions: {
      ref_name: {
        include: clone(expected.conditions.refName.include),
        exclude: clone(expected.conditions.refName.exclude)
      }
    },
    bypass_actors: clone(expected.bypassActors),
    rules: clone(expected.rules)
  };
}

function buildFixture(policyRecord) {
  const policy = policyRecord.policy;
  const mainRuleset = apiRuleset(policy.rulesets.main, 101);
  const tagRuleset = apiRuleset(policy.rulesets.tag, 202);
  const documents = new Map([
    ['/repos/neb6dav/ai_tech_tree', {
      full_name: 'neb6dav/ai_tech_tree',
      default_branch: 'main',
      visibility: 'public',
      archived: false,
      disabled: false
    }],
    ['/repos/neb6dav/ai_tech_tree/git/ref/heads/main', {
      ref: 'refs/heads/main',
      object: { type: 'commit', sha: EXPECTED_COMMIT }
    }],
    ['/repos/neb6dav/ai_tech_tree/rulesets?includes_parents=false&page=1&per_page=100', [
      { id: 101, name: mainRuleset.name, target: 'branch', source: 'neb6dav/ai_tech_tree', source_type: 'Repository', enforcement: 'active' },
      { id: 202, name: tagRuleset.name, target: 'tag', source: 'neb6dav/ai_tech_tree', source_type: 'Repository', enforcement: 'active' }
    ]],
    ['/repos/neb6dav/ai_tech_tree/rulesets/101', mainRuleset],
    ['/repos/neb6dav/ai_tech_tree/rulesets/202', tagRuleset],
    ['/repos/neb6dav/ai_tech_tree/rules/branches/main', policy.rulesets.main.rules.map(rule => ({
      ...clone(rule),
      ruleset_source_type: 'Repository',
      ruleset_source: 'neb6dav/ai_tech_tree',
      ruleset_id: 101
    }))],
    ['/repos/neb6dav/ai_tech_tree/environments/github-pages', {
      name: 'github-pages',
      can_admins_bypass: false,
      deployment_branch_policy: { protected_branches: true, custom_branch_policies: false },
      protection_rules: [
        { type: 'branch_policy' },
        {
          type: 'required_reviewers',
          prevent_self_review: true,
          reviewers: [{ type: 'User', reviewer: { id: 77, login: 'independent-reviewer' } }]
        }
      ]
    }],
    ['/repos/neb6dav/ai_tech_tree/environments/github-pages/deployment-branch-policies?page=1&per_page=100', {
      total_count: 0,
      branch_policies: []
    }],
    ['/repos/neb6dav/ai_tech_tree/pages', {
      status: 'built', build_type: 'workflow', https_enforced: true, public: true
    }],
    ['/repos/neb6dav/ai_tech_tree/immutable-releases', { enabled: true }],
    ['/repos/neb6dav/ai_tech_tree/actions/workflows/validate.yml', {
      id: 303,
      name: 'Validate public artifact',
      path: '.github/workflows/validate.yml',
      state: 'active'
    }],
    [`/repos/neb6dav/ai_tech_tree/actions/workflows/303/runs?branch=main&event=push&head_sha=${EXPECTED_COMMIT}&page=1&per_page=100&status=success`, {
      total_count: 1,
      workflow_runs: [{
        id: 404,
        run_attempt: 1,
        workflow_id: 303,
        head_sha: EXPECTED_COMMIT,
        head_branch: 'main',
        event: 'push',
        status: 'completed',
        conclusion: 'success',
        path: '.github/workflows/validate.yml'
      }]
    }],
    ['/repos/neb6dav/ai_tech_tree/actions/runs/404/jobs?filter=latest&page=1&per_page=100', {
      total_count: 1,
      jobs: [{
        id: 505,
        run_id: 404,
        run_attempt: 1,
        head_sha: EXPECTED_COMMIT,
        workflow_name: 'Validate public artifact',
        name: 'Build, test, and verify generated files',
        status: 'completed',
        conclusion: 'success'
      }]
    }]
  ]);
  const calls = [];
  let mainRefCalls = 0;
  const transport = async request => {
    calls.push(clone(request));
    assert.equal(request.method, 'GET');
    assert.deepEqual(request.expectedStatuses, [200]);
    const key = requestKey(request);
    if (request.path === '/repos/neb6dav/ai_tech_tree/git/ref/heads/main') mainRefCalls += 1;
    if (!documents.has(key)) throw new Error(`fixture has no response for ${key}`);
    return response(clone(documents.get(key)));
  };
  return { calls, documents, transport, getMainRefCalls: () => mainRefCalls };
}

async function loadedPolicy() {
  return loadPromotionPolicy(REPOSITORY_ROOT);
}

async function happyAudit() {
  const policyRecord = await loadedPolicy();
  const fixture = buildFixture(policyRecord);
  const receipt = await auditPromotionControls({
    policyRecord,
    expectedCommit: EXPECTED_COMMIT,
    transport: fixture.transport,
    clock: () => OBSERVED_AT
  });
  return { fixture, policyRecord, receipt };
}

test('reviewed promotion policy loads with fixed trust anchors', async () => {
  const record = await loadedPolicy();
  assert.equal(record.path, 'config/github-promotion-policy.v1.json');
  assert.match(record.sha256, /^[0-9a-f]{64}$/u);
  assert.equal(record.policy.status, 'planned');
  assert.equal(record.policy.repository.apiOrigin, 'https://api.github.com');
  assert.equal(record.policy.repository.fullName, 'neb6dav/ai_tech_tree');
  assert.equal(record.policy.validation.requiredEvent, 'push');
});

test('policy validation rejects candidate-defined trust anchors and extra keys', () => {
  const expected = githubControlAuditConstants.expectedPolicy;
  for (const mutate of [
    policy => { policy.repository.apiOrigin = 'https://example.invalid'; },
    policy => { policy.repository.defaultBranch = 'candidate'; },
    policy => { policy.release.environment = 'unreviewed'; },
    policy => { policy.limits.maxPages = 100; },
    policy => { policy.rulesets.main.bypassActors = [{ actor_id: 1 }]; },
    policy => { policy.rulesets.tag.rules = []; },
    policy => { policy.environment.canAdminsBypass = true; },
    policy => { policy.immutableReleases.enabled = false; },
    policy => { policy.validation.requiredEvent = 'pull_request'; },
    policy => { policy.unreviewed = true; }
  ]) {
    const hostile = clone(expected);
    mutate(hostile);
    assert.throws(() => validatePromotionPolicy(hostile), /exactly match the reviewed/iu);
  }
});

test('plan is deterministic, explicit about zero authority, and complete', async () => {
  const policyRecord = await loadedPolicy();
  const first = buildControlRequestPlan({ policyRecord });
  const second = buildControlRequestPlan({ policyRecord });
  assert.deepEqual(first, second);
  assert.equal(first.mode, 'plan-only');
  assert.equal(first.networkRequested, false);
  assert.equal(first.expectedCommit, null);
  assert.equal(first.expectedCommitRequiredForAudit, true);
  assert.equal(first.phases.length, 14);
  assert.ok(first.phases.every(item => item.method === 'GET'));
  assert.deepEqual(first.authorization, {
    liveReadAuthorized: false,
    mutationAuthorized: false,
    tagAuthorized: false,
    releaseAuthorized: false,
    deploymentAuthorized: false
  });
});

test('default CLI prints only the plan and planned execution fails before network activation', async () => {
  let output = '';
  let errors = '';
  const io = {
    stdout: { write: value => { output += value; } },
    stderr: { write: value => { errors += value; } }
  };
  assert.equal(await runCli([], io), 0);
  const plan = JSON.parse(output);
  assert.equal(plan.networkRequested, false);
  assert.equal(plan.authorization.liveReadAuthorized, false);
  output = '';
  assert.equal(await runCli(['--execute', '--expected-commit', EXPECTED_COMMIT], io), 1);
  assert.match(errors, /blocked while the promotion policy status is planned/iu);
  assert.equal(output, '');
});

test('injected audit validates all controls, bookends main, and remains promotion-ineligible', async () => {
  const { fixture, receipt } = await happyAudit();
  assert.equal(fixture.getMainRefCalls(), 2);
  assert.equal(receipt.evidenceSource, 'injected-test-only');
  assert.equal(receipt.promotionEligible, false);
  assert.equal(receipt.expectedCommit, EXPECTED_COMMIT);
  assert.equal(receipt.observedAt, OBSERVED_AT.toISOString());
  assert.equal(receipt.expiresAt, '2026-08-20T22:05:00.000Z');
  assert.equal(receipt.summary.auditorRequestedOnlyGets, true);
  assert.equal(receipt.summary.transportSideEffectsAttested, false);
  assert.equal(receipt.validationEvidence.event, 'push');
  assert.equal(receipt.validationEvidence.conclusion, 'success');
  assert.ok(fixture.calls.every(call => call.method === 'GET'));
  assert.ok(fixture.calls.every(call =>
    call.path === '/repos/neb6dav/ai_tech_tree' || call.path.startsWith('/repos/neb6dav/ai_tech_tree/')
  ));
});

test('receipt bytes validate but injected evidence can never satisfy live freshness', async () => {
  const { policyRecord, receipt } = await happyAudit();
  const bytes = Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  const validated = validateControlReceipt(bytes, { policyRecord, expectedCommit: EXPECTED_COMMIT });
  assert.equal(validated.evidenceSource, 'injected-test-only');
  assert.throws(
    () => assertFreshLiveControlReceipt(validated, { policyRecord, expectedCommit: EXPECTED_COMMIT, now: OBSERVED_AT }),
    /cannot be accepted while the reviewed policy is planned/iu
  );
  const forged = clone(receipt);
  forged.evidenceSource = 'github-api-live';
  forged.promotionEligible = true;
  assert.throws(
    () => validateControlReceipt(Buffer.from(JSON.stringify(forged)), { policyRecord, expectedCommit: EXPECTED_COMMIT }),
    /planned-policy receipts/iu
  );
});

test('receipt validation rejects tampered closure metadata', async () => {
  const { policyRecord, receipt } = await happyAudit();
  for (const mutate of [
    value => { value.expectedCommit = 'f'.repeat(40); },
    value => { value.policy.sha256 = '0'.repeat(64); },
    value => { value.checks.tagRuleset = false; },
    value => { value.summary.externalMutationAuthorized = true; },
    value => { value.evidence[0].method = 'POST'; },
    value => { value.evidence[0].path = '/repos/neb6dav/ai_tech_tree/pages'; },
    value => { value.evidence[0].sha256 = 'bad'; },
    value => { value.responseBytes += 1; },
    value => { value.expiresAt = '2026-08-20T22:06:00.000Z'; },
    value => { value.unreviewed = true; }
  ]) {
    const hostile = clone(receipt);
    mutate(hostile);
    assert.throws(() => validateControlReceipt(Buffer.from(JSON.stringify(hostile)), {
      policyRecord,
      expectedCommit: EXPECTED_COMMIT
    }));
  }
});

async function expectAuditFailure(mutator, pattern) {
  const policyRecord = await loadedPolicy();
  const fixture = buildFixture(policyRecord);
  mutator(fixture.documents);
  await assert.rejects(
    auditPromotionControls({
      policyRecord,
      expectedCommit: EXPECTED_COMMIT,
      transport: fixture.transport,
      clock: () => OBSERVED_AT
    }),
    pattern
  );
}

test('audit rejects repository or main-ref drift', async () => {
  await expectAuditFailure(documents => {
    documents.get('/repos/neb6dav/ai_tech_tree').default_branch = 'candidate';
  }, /repository identity/iu);
  await expectAuditFailure(documents => {
    documents.get('/repos/neb6dav/ai_tech_tree/git/ref/heads/main').object.sha = 'f'.repeat(40);
  }, /exact expected main commit/iu);

  const policyRecord = await loadedPolicy();
  const fixture = buildFixture(policyRecord);
  let mainCalls = 0;
  const driftingTransport = async request => {
    const result = await fixture.transport(request);
    if (request.path === '/repos/neb6dav/ai_tech_tree/git/ref/heads/main' && ++mainCalls === 2) {
      return response({ ref: 'refs/heads/main', object: { type: 'commit', sha: 'f'.repeat(40) } });
    }
    return result;
  };
  await assert.rejects(
    auditPromotionControls({ policyRecord, expectedCommit: EXPECTED_COMMIT, transport: driftingTransport, clock: () => OBSERVED_AT }),
    /final main ref does not identify the exact expected main commit/iu
  );
});

test('audit rejects unobservable or bypassable rulesets', async () => {
  await expectAuditFailure(documents => {
    delete documents.get('/repos/neb6dav/ai_tech_tree/rulesets/101').bypass_actors;
  }, /omits bypass_actors/iu);
  await expectAuditFailure(documents => {
    documents.get('/repos/neb6dav/ai_tech_tree/rulesets/202').bypass_actors.push({ actor_id: 1 });
  }, /bypass_actors/iu);
  await expectAuditFailure(documents => {
    documents.get('/repos/neb6dav/ai_tech_tree/rulesets/101').source = 'other/repository';
  }, /identity or enforcement/iu);
  await expectAuditFailure(documents => {
    documents.get('/repos/neb6dav/ai_tech_tree/rules/branches/main').pop();
  }, /effective main rules (?:omit|contain)/iu);
});

test('audit fails closed on unknown security fields and enum values across every control surface', async () => {
  const runsKey = `/repos/neb6dav/ai_tech_tree/actions/workflows/303/runs?branch=main&event=push&head_sha=${EXPECTED_COMMIT}&page=1&per_page=100&status=success`;
  const jobsKey = '/repos/neb6dav/ai_tech_tree/actions/runs/404/jobs?filter=latest&page=1&per_page=100';
  const mutations = [
    documents => { documents.get('/repos/neb6dav/ai_tech_tree').future_security_control = true; },
    documents => { documents.get('/repos/neb6dav/ai_tech_tree/git/ref/heads/main').object.future_target_type = 'proxy'; },
    documents => { documents.get('/repos/neb6dav/ai_tech_tree/rulesets?includes_parents=false&page=1&per_page=100')[0].future_enforcement = 'soft'; },
    documents => { documents.get('/repos/neb6dav/ai_tech_tree/rulesets?includes_parents=false&page=1&per_page=100')[0].target = 'repository'; },
    documents => { documents.get('/repos/neb6dav/ai_tech_tree/rulesets/101').future_bypass_policy = []; },
    documents => { documents.get('/repos/neb6dav/ai_tech_tree/rulesets/101').rules[0].future_rule_mode = 'advisory'; },
    documents => { documents.get('/repos/neb6dav/ai_tech_tree/rules/branches/main')[0].future_rule_source = 'parent'; },
    documents => { documents.get('/repos/neb6dav/ai_tech_tree/environments/github-pages').future_bypass_policy = false; },
    documents => { documents.get('/repos/neb6dav/ai_tech_tree/environments/github-pages').deployment_branch_policy.future_ref_mode = 'tag'; },
    documents => { documents.get('/repos/neb6dav/ai_tech_tree/environments/github-pages').protection_rules[1].future_review_mode = 'optional'; },
    documents => { documents.get('/repos/neb6dav/ai_tech_tree/environments/github-pages/deployment-branch-policies?page=1&per_page=100').future_policy_count = 0; },
    documents => { documents.get('/repos/neb6dav/ai_tech_tree/pages').future_visibility = 'internal'; },
    documents => { documents.get('/repos/neb6dav/ai_tech_tree/pages').protected_domain_state = 'future-state'; },
    documents => { documents.get('/repos/neb6dav/ai_tech_tree/immutable-releases').future_override = false; },
    documents => { documents.get('/repos/neb6dav/ai_tech_tree/actions/workflows/validate.yml').future_state = 'trusted'; },
    documents => { documents.get(runsKey).future_total = 1; },
    documents => { documents.get(runsKey).workflow_runs[0].future_event = 'trusted_push'; },
    documents => { documents.get(runsKey).workflow_runs[0].event = 'future_event'; },
    documents => { documents.get(jobsKey).future_total = 1; },
    documents => { documents.get(jobsKey).jobs[0].future_conclusion = 'trusted'; },
    documents => { documents.get(jobsKey).jobs[0].status = 'future_status'; }
  ];
  for (const mutate of mutations) await expectAuditFailure(mutate, /unsupported|does not match|unreviewed/iu);
});

test('audit rejects weak environment, Pages, or immutable Release controls', async () => {
  await expectAuditFailure(documents => {
    documents.get('/repos/neb6dav/ai_tech_tree/environments/github-pages').can_admins_bypass = true;
  }, /administrator-bypass/iu);
  await expectAuditFailure(documents => {
    documents.get('/repos/neb6dav/ai_tech_tree/environments/github-pages').protection_rules[1].reviewers = [];
  }, /too few required reviewers/iu);
  await expectAuditFailure(documents => {
    documents.get('/repos/neb6dav/ai_tech_tree/pages').build_type = 'legacy';
  }, /Pages state/iu);
  await expectAuditFailure(documents => {
    Object.assign(documents.get('/repos/neb6dav/ai_tech_tree/pages'), {
      cname: 'attacker.example',
      protected_domain_state: 'unverified',
      source: { branch: 'attacker-controlled', path: '/payload' },
      https_certificate: null
    });
  }, /unreviewed custom domain/iu);
  await expectAuditFailure(documents => {
    Object.assign(documents.get('/repos/neb6dav/ai_tech_tree/pages'), {
      cname: null,
      protected_domain_state: 'verified',
      source: null,
      https_certificate: {
        description: 'wrong certificate',
        domains: ['attacker.example'],
        expires_at: '2027-08-20T00:00:00.000Z',
        state: 'approved'
      }
    });
  }, /certificate domains/iu);
  await expectAuditFailure(documents => {
    Object.assign(documents.get('/repos/neb6dav/ai_tech_tree/pages'), {
      cname: null,
      protected_domain_state: 'verified',
      source: null,
      https_certificate: {
        description: 'GitHub Pages certificate',
        domains: ['neb6dav.github.io'],
        expires_at: 'not-a-date',
        state: 'approved'
      }
    });
  }, /expires_at/iu);
  for (const expiresAt of [0, '1970-01-01T00:00:00.000Z', '2027-08-20']) {
    await expectAuditFailure(documents => {
      Object.assign(documents.get('/repos/neb6dav/ai_tech_tree/pages'), {
        cname: null,
        protected_domain_state: 'verified',
        source: null,
        https_certificate: {
          description: 'GitHub Pages certificate',
          domains: ['neb6dav.github.io'],
          expires_at: expiresAt,
          state: 'approved'
        }
      });
    }, /expires_at/iu);
  }
  const validCertificateRecord = await loadedPolicy();
  const validCertificateFixture = buildFixture(validCertificateRecord);
  Object.assign(validCertificateFixture.documents.get('/repos/neb6dav/ai_tech_tree/pages'), {
    cname: null,
    protected_domain_state: 'verified',
    source: null,
    https_certificate: {
      description: 'GitHub Pages certificate',
      domains: ['neb6dav.github.io'],
      expires_at: '2027-08-20T00:00:00.000Z',
      state: 'approved'
    }
  });
  const validCertificateReceipt = await auditPromotionControls({
    policyRecord: validCertificateRecord,
    expectedCommit: EXPECTED_COMMIT,
    transport: validCertificateFixture.transport,
    clock: () => OBSERVED_AT
  });
  assert.equal(validCertificateReceipt.checks.pages, true);
  await expectAuditFailure(documents => {
    documents.get('/repos/neb6dav/ai_tech_tree/immutable-releases').enabled = false;
  }, /immutable Releases/iu);
});

test('audit binds success to exact validation workflow, commit, event, and job', async () => {
  const runsKey = `/repos/neb6dav/ai_tech_tree/actions/workflows/303/runs?branch=main&event=push&head_sha=${EXPECTED_COMMIT}&page=1&per_page=100&status=success`;
  const jobsKey = '/repos/neb6dav/ai_tech_tree/actions/runs/404/jobs?filter=latest&page=1&per_page=100';
  for (const [field, value] of [
    ['head_sha', 'f'.repeat(40)],
    ['event', 'pull_request'],
    ['conclusion', 'failure'],
    ['path', '.github/workflows/other.yml']
  ]) {
    await expectAuditFailure(documents => {
      documents.get(runsKey).workflow_runs[0][field] = value;
    }, /validation workflow runs\[0\]|no exact successful validation workflow run/iu);
  }
  await expectAuditFailure(documents => {
    documents.get(jobsKey).jobs[0].conclusion = 'failure';
  }, /validation workflow jobs\[0\]|exactly one successful required job/iu);
  await expectAuditFailure(documents => {
    documents.get(jobsKey).jobs[0].run_id = 999;
    documents.get(jobsKey).jobs[0].head_sha = 'f'.repeat(40);
    documents.get(jobsKey).jobs[0].workflow_name = 'Other workflow';
  }, /validation workflow jobs\[0\]|exactly one successful required job/iu);
  await expectAuditFailure(documents => {
    documents.get(jobsKey).total_count = 2;
    documents.get(jobsKey).jobs.push({
      ...clone(documents.get(jobsKey).jobs[0]),
      id: 506,
      name: 'Unreviewed job',
      run_id: 999
    });
  }, /validation workflow jobs\[1\].*unsupported identity/iu);
  await expectAuditFailure(documents => {
    documents.get(runsKey).total_count = 999;
  }, /total_count does not match complete pagination/iu);
});

test('pagination rejects cross-origin next links and response budgets fail closed', async () => {
  const policyRecord = await loadedPolicy();
  const fixture = buildFixture(policyRecord);
  const baseTransport = fixture.transport;
  const transport = async request => {
    const result = await baseTransport(request);
    if (request.path.endsWith('/rulesets')) {
      result.headers.link = '<https://evil.example/repos/neb6dav/ai_tech_tree/rulesets?includes_parents=false&page=2&per_page=100>; rel="next"';
    }
    return result;
  };
  await assert.rejects(
    auditPromotionControls({ policyRecord, expectedCommit: EXPECTED_COMMIT, transport, clock: () => OBSERVED_AT }),
    /escapes the fixed GitHub endpoint/iu
  );

  const orphanFixture = buildFixture(policyRecord);
  const orphanTransport = async request => {
    const result = await orphanFixture.transport(request);
    if (request.path.endsWith('/rulesets')) {
      result.headers.link = '<https://api.github.com/repos/neb6dav/ai_tech_tree/rulesets?includes_parents=false&page=2&per_page=100>; rel="last"';
    }
    return result;
  };
  await assert.rejects(
    auditPromotionControls({ policyRecord, expectedCommit: EXPECTED_COMMIT, transport: orphanTransport, clock: () => OBSERVED_AT }),
    /later last page without an exact next link/iu
  );

  const hiddenPolicyFixture = buildFixture(policyRecord);
  const deploymentPath = '/repos/neb6dav/ai_tech_tree/environments/github-pages/deployment-branch-policies';
  const hiddenPolicyTransport = async request => {
    if (request.path === deploymentPath && request.query.page === 1) {
      return response({ total_count: 1, branch_policies: [] }, {
        link: `<https://api.github.com${deploymentPath}?page=2&per_page=100>; rel="next", <https://api.github.com${deploymentPath}?page=2&per_page=100>; rel="last"`
      });
    }
    if (request.path === deploymentPath && request.query.page === 2) {
      return response({ total_count: 1, branch_policies: [{ id: 909, name: 'hidden-tag-policy', type: 'tag' }] }, {
        link: `<https://api.github.com${deploymentPath}?page=1&per_page=100>; rel="first", <https://api.github.com${deploymentPath}?page=1&per_page=100>; rel="prev", <https://api.github.com${deploymentPath}?page=2&per_page=100>; rel="last"`
      });
    }
    return hiddenPolicyFixture.transport(request);
  };
  await assert.rejects(
    auditPromotionControls({ policyRecord, expectedCommit: EXPECTED_COMMIT, transport: hiddenPolicyTransport, clock: () => OBSERVED_AT }),
    /must not contain custom deployment branch policies/iu
  );

  const oversizedFixture = buildFixture(policyRecord);
  const oversized = async request => {
    if (request.path === '/repos/neb6dav/ai_tech_tree') {
      return { status: 200, headers: {}, body: Buffer.alloc(policyRecord.policy.limits.maxResponseBytes + 1, 0x20) };
    }
    return oversizedFixture.transport(request);
  };
  await assert.rejects(
    auditPromotionControls({ policyRecord, expectedCommit: EXPECTED_COMMIT, transport: oversized, clock: () => OBSERVED_AT }),
    /exceeds maxResponseBytes/iu
  );
});

test('pagination accepts validated first, previous, next, and last links while preserving complete closure', async () => {
  const policyRecord = await loadedPolicy();
  const fixture = buildFixture(policyRecord);
  const original = fixture.documents.get('/repos/neb6dav/ai_tech_tree/rulesets?includes_parents=false&page=1&per_page=100');
  const endpoint = 'https://api.github.com/repos/neb6dav/ai_tech_tree/rulesets?includes_parents=false';
  const transport = async request => {
    if (request.path === '/repos/neb6dav/ai_tech_tree/rulesets') {
      if (request.query.page === 1) {
        return response([original[0]], {
          link: `<${endpoint}&page=2&per_page=100>; rel="next", <${endpoint}&page=2&per_page=100>; rel="last"`
        });
      }
      if (request.query.page === 2) {
        return response([original[1]], {
          link: `<${endpoint}&page=1&per_page=100>; rel="first", <${endpoint}&page=1&per_page=100>; rel="prev", <${endpoint}&page=2&per_page=100>; rel="last"`
        });
      }
    }
    return fixture.transport(request);
  };
  const receipt = await auditPromotionControls({
    policyRecord,
    expectedCommit: EXPECTED_COMMIT,
    transport,
    clock: () => OBSERVED_AT
  });
  assert.equal(receipt.evidence.filter(item => item.path.endsWith('/rulesets')).length, 2);
  validateControlReceipt(Buffer.from(JSON.stringify(receipt)), { policyRecord, expectedCommit: EXPECTED_COMMIT });
});

test('invalid commits, alternate policy paths, duplicate CLI flags, and unknown flags fail', async () => {
  const policyRecord = await loadedPolicy();
  assert.throws(() => buildControlRequestPlan({ policyRecord, expectedCommit: 'abc' }), /full lowercase 40-character/iu);
  const falseRecord = { ...policyRecord, sha256: '0'.repeat(64) };
  assert.throws(() => buildControlRequestPlan({ policyRecord: falseRecord }), /does not match its policy bytes/iu);
  await assert.rejects(loadPromotionPolicy(REPOSITORY_ROOT, 'config/other.json'), /must be exactly/iu);
  let errors = '';
  const io = { stdout: { write() {} }, stderr: { write: value => { errors += value; } } };
  assert.equal(await runCli(['--help', '--help'], io), 1);
  assert.match(errors, /duplicate --help/iu);
  errors = '';
  assert.equal(await runCli(['--network'], io), 1);
  assert.match(errors, /unknown argument/iu);
});
