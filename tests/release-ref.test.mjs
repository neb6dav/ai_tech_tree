import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmod, copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { releaseRefConstants, verifyReleaseRef } from '../scripts/release-ref.mjs';

const VERSION = '1.2.3';
const TAG = `v${VERSION}`;
const RELEASE_DATE = '2026-08-20';
const TAGGED_AT = '2026-08-20T15:04:05-04:00';
const SCRIPT_PATH = fileURLToPath(new URL('../scripts/release-ref.mjs', import.meta.url));
const temporaryRoots = new Set();

function gitEnvironment(overrides = {}) {
  const nullDevice = process.platform === 'win32' ? 'NUL' : '/dev/null';
  return {
    ...process.env,
    GIT_CONFIG_GLOBAL: nullDevice,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_TERMINAL_PROMPT: '0',
    ...overrides
  };
}

function git(root, argumentsList, environment = {}) {
  return execFileSync('git', ['-C', root, ...argumentsList], {
    encoding: 'utf8',
    env: gitEnvironment(environment),
    windowsHide: true
  }).trim();
}

async function makeRoot(prefix = 'ai-tree-release-ref-test-') {
  const root = await mkdtemp(path.join(os.tmpdir(), prefix));
  temporaryRoots.add(root);
  return root;
}

async function addCommit(root, contents, message, date) {
  await writeFile(path.join(root, 'record.txt'), `${contents}\n`);
  git(root, ['add', 'record.txt']);
  git(root, ['commit', '-m', message], {
    GIT_AUTHOR_DATE: date,
    GIT_COMMITTER_DATE: date
  });
  return git(root, ['rev-parse', 'HEAD']);
}

async function createRepository({ createTag = true, objectFormat = 'sha1', tagDate = TAGGED_AT } = {}) {
  const root = await makeRoot();
  const initArguments = ['init', '-q'];
  if (objectFormat !== 'sha1') initArguments.push(`--object-format=${objectFormat}`);
  git(root, initArguments);
  git(root, ['config', 'user.name', 'Release Ref Test']);
  git(root, ['config', 'user.email', 'release-ref@example.test']);
  git(root, ['branch', '-M', 'main']);
  await addCommit(root, 'base', 'Base record', '2026-08-18T10:00:00-04:00');
  const head = await addCommit(root, 'release', 'Release record', '2026-08-19T11:00:00-04:00');
  if (createTag) {
    git(root, ['tag', '-a', TAG, '-m', 'Release fixture'], {
      GIT_COMMITTER_DATE: tagDate
    });
  }
  return {
    root,
    head,
    options: {
      repositoryRoot: root,
      tag: TAG,
      protectedMainRef: 'refs/heads/main',
      expectedVersion: VERSION,
      expectedReleaseDate: RELEASE_DATE,
      expectedCommit: head
    }
  };
}

test.afterEach(async () => {
  await Promise.all([...temporaryRoots].map(root => rm(root, { recursive: true, force: true })));
  temporaryRoots.clear();
});

test('accepts a correct annotated release tag and returns deterministic promotion metadata', async () => {
  const fixture = await createRepository();
  const first = await verifyReleaseRef(fixture.options);
  const second = await verifyReleaseRef(fixture.options);
  const tagObject = git(fixture.root, ['rev-parse', `refs/tags/${TAG}`]);

  assert.deepEqual(first, second);
  assert.deepEqual(first, {
    mode: 'annotated-tag',
    tagObject,
    tagCommit: fixture.head,
    taggedAt: TAGGED_AT,
    protectedMainRef: 'refs/heads/main',
    protectedMainCommit: fixture.head,
    reachableFromProtectedMain: true
  });
  assert.equal(Object.isFrozen(first), true);
  assert.deepEqual(releaseRefConstants, { scriptVersion: '1.0.0' });
});

test('recomputes annotated tag object IDs in a SHA-256 repository', async t => {
  let fixture;
  try {
    fixture = await createRepository({ objectFormat: 'sha256' });
  } catch (error) {
    if (/object-format|sha256|unknown option/iu.test(String(error?.stderr || error?.message || error))) {
      t.skip('installed Git does not support SHA-256 repositories');
      return;
    }
    throw error;
  }

  const metadata = await verifyReleaseRef(fixture.options);
  assert.match(metadata.tagObject, /^[0-9a-f]{64}$/u);
  assert.match(metadata.tagCommit, /^[0-9a-f]{64}$/u);
  assert.equal(metadata.tagCommit, fixture.head);
});

test('rejects a lightweight release tag', async () => {
  const fixture = await createRepository({ createTag: false });
  git(fixture.root, ['tag', TAG]);

  await assert.rejects(
    verifyReleaseRef(fixture.options),
    /release ref must identify an annotated tag object/u
  );
});

test('rejects an annotated tag that targets another tag', async () => {
  const fixture = await createRepository({ createTag: false });
  git(fixture.root, ['tag', '-a', 'release-candidate', '-m', 'Inner tag'], {
    GIT_COMMITTER_DATE: TAGGED_AT
  });
  git(fixture.root, ['tag', '-a', TAG, '-m', 'Outer tag', 'release-candidate'], {
    GIT_COMMITTER_DATE: TAGGED_AT
  });

  await assert.rejects(
    verifyReleaseRef(fixture.options),
    /annotated tag must directly target a commit/u
  );
});

test('rejects version/tag disagreement and non-canonical semantic versions', async t => {
  await t.test('version mismatch', async () => {
    const fixture = await createRepository();
    await assert.rejects(
      verifyReleaseRef({ ...fixture.options, expectedVersion: '1.2.4' }),
      /tag must be exactly v1\.2\.4/u
    );
  });

  await t.test('leading zero', async () => {
    const fixture = await createRepository();
    await assert.rejects(
      verifyReleaseRef({ ...fixture.options, tag: 'v01.2.3', expectedVersion: '01.2.3' }),
      /expectedVersion must be a strict semantic version/u
    );
  });
});

test('rejects a direct tag target that differs from HEAD and expectedCommit', async () => {
  const fixture = await createRepository();
  const next = await addCommit(
    fixture.root,
    'post-release',
    'Post-release change',
    '2026-08-20T16:00:00-04:00'
  );

  await assert.rejects(
    verifyReleaseRef({ ...fixture.options, expectedCommit: next }),
    /annotated tag must directly target HEAD and expectedCommit/u
  );
});

test('rejects a tag commit that is unreachable from the protected main ref', async () => {
  const fixture = await createRepository();
  git(fixture.root, ['checkout', '--orphan', 'protected-unrelated']);
  await writeFile(path.join(fixture.root, 'record.txt'), 'unrelated\n');
  git(fixture.root, ['add', 'record.txt']);
  git(fixture.root, ['commit', '-m', 'Unrelated protected history'], {
    GIT_AUTHOR_DATE: '2026-08-20T09:00:00-04:00',
    GIT_COMMITTER_DATE: '2026-08-20T09:00:00-04:00'
  });
  git(fixture.root, ['checkout', 'main']);

  await assert.rejects(
    verifyReleaseRef({ ...fixture.options, protectedMainRef: 'refs/heads/protected-unrelated' }),
    /release tag commit is not reachable from protectedMainRef/u
  );
});

test('compares the tagger calendar date in the timezone recorded by the tag', async () => {
  const fixture = await createRepository({ tagDate: '2026-08-20T00:30:00+14:00' });
  const metadata = await verifyReleaseRef(fixture.options);
  assert.equal(metadata.taggedAt, '2026-08-20T00:30:00+14:00');

  await assert.rejects(
    verifyReleaseRef({ ...fixture.options, expectedReleaseDate: '2026-08-19' }),
    /annotated tag calendar date 2026-08-20 does not match expectedReleaseDate 2026-08-19/u
  );
});

test('rejects malformed tag, protected ref, commit, and release-date inputs', async t => {
  await t.test('tag revision expression', async () => {
    const fixture = await createRepository();
    await assert.rejects(
      verifyReleaseRef({ ...fixture.options, tag: `${TAG}^{}` }),
      /tag must be exactly v1\.2\.3/u
    );
  });

  await t.test('protected ref revision expression', async () => {
    const fixture = await createRepository();
    await assert.rejects(
      verifyReleaseRef({ ...fixture.options, protectedMainRef: 'refs/heads/main^{}' }),
      /protectedMainRef must be a canonical/u
    );
  });

  await t.test('abbreviated commit', async () => {
    const fixture = await createRepository();
    await assert.rejects(
      verifyReleaseRef({ ...fixture.options, expectedCommit: fixture.head.slice(0, 12) }),
      /expectedCommit must be a full lowercase sha1 object ID/u
    );
  });

  await t.test('impossible date', async () => {
    const fixture = await createRepository();
    await assert.rejects(
      verifyReleaseRef({ ...fixture.options, expectedReleaseDate: '2026-02-30' }),
      /expectedReleaseDate must be a real calendar date/u
    );
  });
});

test('requires the canonical worktree root rather than a relative path or subdirectory', async t => {
  await t.test('relative root', async () => {
    const fixture = await createRepository();
    await assert.rejects(
      verifyReleaseRef({ ...fixture.options, repositoryRoot: '.' }),
      /repositoryRoot must be an absolute path/u
    );
  });

  await t.test('worktree subdirectory', async () => {
    const fixture = await createRepository();
    const child = path.join(fixture.root, 'child');
    await mkdir(child);
    await assert.rejects(
      verifyReleaseRef({ ...fixture.options, repositoryRoot: child }),
      /repositoryRoot must be the canonical Git worktree root/u
    );
  });
});

test('disables replacement refs and ambient Git repository/config injection', async () => {
  const fixture = await createRepository();
  const parent = git(fixture.root, ['rev-parse', 'HEAD^']);
  git(fixture.root, ['replace', fixture.head, parent]);

  const attack = await createRepository({ tagDate: '2026-08-21T12:00:00-04:00' });
  const argumentsList = [
    SCRIPT_PATH,
    '--repository-root', fixture.root,
    '--tag', TAG,
    '--protected-main-ref', 'refs/heads/main',
    '--expected-version', VERSION,
    '--expected-release-date', RELEASE_DATE,
    '--expected-commit', fixture.head
  ];
  const output = execFileSync(process.execPath, argumentsList, {
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_CONFIG_COUNT: '1',
      GIT_CONFIG_KEY_0: 'core.repositoryformatversion',
      GIT_CONFIG_VALUE_0: '99',
      GIT_DIR: path.join(attack.root, '.git'),
      GIT_OBJECT_DIRECTORY: path.join(attack.root, '.git', 'objects'),
      GIT_REPLACE_REF_BASE: 'refs/replace-injected/',
      GIT_WORK_TREE: attack.root
    },
    windowsHide: true
  });
  const metadata = JSON.parse(output);

  assert.equal(metadata.tagCommit, fixture.head);
  assert.equal(metadata.protectedMainCommit, fixture.head);
  assert.equal(metadata.reachableFromProtectedMain, true);
});

test('rejects valid tag bytes stored under the wrong tag object ID', async () => {
  const fixture = await createRepository();
  const expectedObject = git(fixture.root, ['rev-parse', `refs/tags/${TAG}`]);
  git(fixture.root, ['tag', '-a', 'alternate-release-object', '-m', 'Different tag bytes'], {
    GIT_COMMITTER_DATE: TAGGED_AT
  });
  const alternateObject = git(fixture.root, ['rev-parse', 'refs/tags/alternate-release-object']);
  const objectPath = oid => path.join(fixture.root, '.git', 'objects', oid.slice(0, 2), oid.slice(2));
  await chmod(objectPath(expectedObject), 0o666);
  await copyFile(objectPath(alternateObject), objectPath(expectedObject));

  await assert.rejects(
    verifyReleaseRef(fixture.options),
    /annotated tag bytes do not match the release tag object ID/u
  );
});

test('rejects repository-local fsck overrides that could suppress malformed release objects', async () => {
  const fixture = await createRepository({ createTag: false });
  const tree = git(fixture.root, ['rev-parse', 'HEAD^{tree}']);
  const malformedPath = path.join(fixture.root, 'malformed.commit');
  await writeFile(malformedPath, [
    `tree ${tree}`,
    `parent ${fixture.head}`,
    'author Missing Email 1787241600 +0000',
    'committer Missing Email 1787241600 +0000',
    '',
    'Malformed release commit',
    ''
  ].join('\n'));
  const malformedCommit = git(fixture.root, ['hash-object', '--literally', '-t', 'commit', '-w', malformedPath]);
  git(fixture.root, ['update-ref', 'refs/heads/main', malformedCommit]);
  git(fixture.root, ['tag', '-a', TAG, '-m', 'Malformed release fixture', malformedCommit], {
    GIT_COMMITTER_DATE: TAGGED_AT
  });
  const skipList = path.join(fixture.root, 'fsck-skip-list.txt');
  await writeFile(skipList, `${malformedCommit}\n`);
  git(fixture.root, ['config', 'fsck.skipList', skipList]);

  await assert.rejects(
    verifyReleaseRef({ ...fixture.options, expectedCommit: malformedCommit }),
    /Git fsck configuration overrides are not allowed/u
  );
});
