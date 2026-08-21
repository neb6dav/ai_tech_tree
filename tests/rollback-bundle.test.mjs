import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  symlink,
  writeFile
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { after, before, test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  rollbackBundleConstants,
  verifyRollbackBundle
} from '../scripts/verify-rollback-bundle.mjs';

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DESCRIPTOR_PATH = path.join(REPOSITORY_ROOT, ...rollbackBundleConstants.descriptorRelativePath.split('/'));
const ARCHIVE_PATH = path.join(REPOSITORY_ROOT, ...rollbackBundleConstants.archiveRelativePath.split('/'));
const VERIFIER_PATH = path.join(REPOSITORY_ROOT, 'scripts', 'verify-rollback-bundle.mjs');
const BLOCK_BYTES = 512;
let descriptorBytes;
let archiveBytes;
let offsets;
let temporaryRoot;
let childTemporaryParent;
let scrubbedChildEnvironment;

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function gitBlobSha1(bytes) {
  return createHash('sha1')
    .update(Buffer.from(`blob ${bytes.byteLength}\0`))
    .update(bytes)
    .digest('hex');
}

function octalAt(bytes, offset, length) {
  const field = bytes.subarray(offset, offset + length);
  const nul = field.indexOf(0);
  return Number.parseInt(field.subarray(0, nul < 0 ? field.length : nul).toString('ascii'), 8);
}

function archiveOffsets(bytes) {
  const result = [];
  let offset = 0;
  while (offset < bytes.byteLength) {
    const header = bytes.subarray(offset, offset + BLOCK_BYTES);
    if (header.every(byte => byte === 0)) break;
    const size = octalAt(header, 124, 12);
    const nameEnd = header.subarray(0, 100).indexOf(0);
    result.push({
      offset,
      name: header.subarray(0, nameEnd < 0 ? 100 : nameEnd).toString('ascii'),
      size,
      dataStart: offset + BLOCK_BYTES,
      paddedEnd: offset + BLOCK_BYTES + Math.ceil(size / BLOCK_BYTES) * BLOCK_BYTES
    });
    offset = result.at(-1).paddedEnd;
  }
  return result;
}

function cloneArchive() {
  return Buffer.from(archiveBytes);
}

function recomputeHeaderChecksum(bytes, headerOffset) {
  const header = bytes.subarray(headerOffset, headerOffset + BLOCK_BYTES);
  header.fill(0x20, 148, 156);
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  Buffer.from(`${checksum.toString(8).padStart(6, '0')}\0 `, 'ascii').copy(header, 148);
}

function setAsciiField(bytes, headerOffset, fieldOffset, length, value) {
  const field = bytes.subarray(headerOffset + fieldOffset, headerOffset + fieldOffset + length);
  field.fill(0);
  Buffer.from(value, 'ascii').copy(field);
  recomputeHeaderChecksum(bytes, headerOffset);
}

function verifyArchive(candidate) {
  return verifyRollbackBundle({ descriptorBytes, archiveBytes: candidate });
}

function replacePayloadText(candidate, entryName, before, after) {
  assert.equal(Buffer.byteLength(before), Buffer.byteLength(after), 'hostile replacement must preserve tar entry size');
  const entry = offsets.find(value => value.name === entryName);
  assert.ok(entry, `missing fixture entry ${entryName}`);
  const payload = candidate.subarray(entry.dataStart, entry.dataStart + entry.size);
  const index = payload.indexOf(Buffer.from(before));
  assert.notEqual(index, -1, `missing hostile replacement source in ${entryName}`);
  Buffer.from(after).copy(payload, index);
}

function exactScrubbedTemporaryEnvironment(temporaryParent) {
  return Object.freeze(process.platform === 'win32'
    ? { TEMP: temporaryParent, TMP: temporaryParent }
    : { TMPDIR: temporaryParent });
}

async function repositorySentinelSnapshot() {
  const fixedPaths = [
    '.gitattributes',
    rollbackBundleConstants.descriptorRelativePath,
    rollbackBundleConstants.archiveRelativePath,
    'scripts/verify-rollback-bundle.mjs',
    'tests/rollback-bundle.test.mjs',
    '.git/HEAD',
    '.git/index'
  ];
  const files = {};
  for (const relativePath of fixedPaths) {
    const bytes = await readFile(path.join(REPOSITORY_ROOT, ...relativePath.split('/')));
    files[relativePath] = Object.freeze({ bytes: bytes.byteLength, sha256: sha256(bytes) });
  }
  return Object.freeze({
    rootInventory: Object.freeze((await readdir(REPOSITORY_ROOT)).sort()),
    files: Object.freeze(files)
  });
}

before(async () => {
  [descriptorBytes, archiveBytes] = await Promise.all([readFile(DESCRIPTOR_PATH), readFile(ARCHIVE_PATH)]);
  offsets = archiveOffsets(archiveBytes);
  const parent = await realpath(os.tmpdir());
  temporaryRoot = await mkdtemp(path.join(parent, 'ai-tree-rollback-test-'));
  childTemporaryParent = path.join(temporaryRoot, 'child-platform-temp');
  await mkdir(childTemporaryParent);
  childTemporaryParent = await realpath(childTemporaryParent);
  scrubbedChildEnvironment = exactScrubbedTemporaryEnvironment(childTemporaryParent);
});

after(async () => {
  if (temporaryRoot) await rm(temporaryRoot, { recursive: true, force: true });
});

test('repository holds the exact fixed descriptor and binary rollback archive without LFS', async () => {
  assert.equal(descriptorBytes.byteLength, rollbackBundleConstants.descriptorBytes);
  assert.equal(sha256(descriptorBytes), rollbackBundleConstants.descriptorSha256);
  assert.equal(archiveBytes.byteLength, 14059520);
  assert.equal(sha256(archiveBytes), 'f04f46196b74982f9d725f032278f9b7ed48ae1ffd82db0dcff3fc39f739f9c4');
  assert.equal(gitBlobSha1(archiveBytes), '651fab34624fd6b943054c8cb3e30c76a88e4024');
  const attributes = await readFile(path.join(REPOSITORY_ROOT, '.gitattributes'), 'utf8');
  assert.match(attributes, /^rollback\/\*\*\/\*\.tar binary -eol$/mu);
  assert.doesNotMatch(attributes, /\bfilter=lfs\b|\bdiff=lfs\b|\bmerge=lfs\b/u);
});

test('pure verifier closes descriptor, legacy tar, payloads, formats, and all negative authority flags', () => {
  const receipt = verifyRollbackBundle({ descriptorBytes, archiveBytes });
  assert.equal(receipt.outcome, 'verified-read-only-rollback-baseline');
  assert.equal(receipt.status, 'verified');
  assert.equal(receipt.archive.entryCount, 8);
  assert.equal(receipt.archive.payloadBytes, 14052260);
  assert.equal(receipt.archive.terminalZeroBytes, 1536);
  assert.equal(receipt.smokePlan.networkRequests, 0);
  assert.equal(receipt.smokePlan.ndjsonRecords, 3243);
  assert.equal(receipt.smokePlan.jsonLdGraphEntries, 3242);
  assert.deepEqual(receipt.smokePlan.socialCard, { width: 1731, height: 909 });
  assert.ok(Object.values(receipt.authority).every(value => value === false));
  assert.match(receipt.limitations.join(' '), /not evidence that the current release conforms/u);
  assert.throws(() => { receipt.authority.productionEligible = true; }, TypeError);
});

test('zero-argument CLI rehearses only in a removed tool-created temporary directory', async () => {
  const temporaryParent = childTemporaryParent;
  const before = new Set((await readdir(temporaryParent)).filter(name => name.startsWith(rollbackBundleConstants.temporaryPrefix)));
  const repositoryBefore = await repositorySentinelSnapshot();
  assert.deepEqual(
    Object.keys(scrubbedChildEnvironment).sort(),
    process.platform === 'win32' ? ['TEMP', 'TMP'] : ['TMPDIR'],
    'child environment may contain only exact platform-temporary selectors'
  );
  assert.ok(Object.values(scrubbedChildEnvironment).every(value => value === childTemporaryParent));
  const result = spawnSync(process.execPath, [VERIFIER_PATH], {
    cwd: REPOSITORY_ROOT,
    encoding: 'utf8',
    env: scrubbedChildEnvironment,
    windowsHide: true
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  const receipt = JSON.parse(result.stdout);
  assert.equal(receipt.outcome, 'rollback-bundle-rehearsed');
  assert.equal(receipt.nextStep, 'continue-to-final-read-only-preflight');
  assert.equal(receipt.extraction, 'verified-in-removed-tool-created-temporary-directory');
  assert.ok(Object.values(receipt.authority).every(value => value === false));
  assert.match(receipt.limitations.join(' '), /not evidence that the current release conforms/u);
  const after = (await readdir(temporaryParent)).filter(name => name.startsWith(rollbackBundleConstants.temporaryPrefix));
  assert.deepEqual(after.filter(name => !before.has(name)), []);
  assert.deepEqual(await repositorySentinelSnapshot(), repositoryBefore, 'CLI must preserve checkout bytes, Git index/HEAD, and root status inventory');
});

test('CLI rejects every argument and cannot accept a caller output directory', () => {
  const result = spawnSync(process.execPath, [VERIFIER_PATH, '--output-directory', temporaryRoot], {
    cwd: REPOSITORY_ROOT,
    encoding: 'utf8',
    env: scrubbedChildEnvironment,
    windowsHide: true
  });
  assert.notEqual(result.status, 0);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /accepts no arguments or caller-selected destination/u);
});

test('crafted argv cannot trigger CLI behavior when the verifier is imported', async () => {
  const temporaryParent = childTemporaryParent;
  const before = new Set((await readdir(temporaryParent)).filter(name => name.startsWith(rollbackBundleConstants.temporaryPrefix)));
  const repositoryBefore = await repositorySentinelSnapshot();
  const moduleUrl = pathToFileURL(VERIFIER_PATH).href;
  const program = `process.argv[1] = ${JSON.stringify(VERIFIER_PATH)}; await import(${JSON.stringify(moduleUrl)});`;
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', program], {
    cwd: REPOSITORY_ROOT,
    encoding: 'utf8',
    env: scrubbedChildEnvironment,
    windowsHide: true
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, '');
  const after = (await readdir(temporaryParent)).filter(name => name.startsWith(rollbackBundleConstants.temporaryPrefix));
  assert.deepEqual(after.filter(name => !before.has(name)), []);
  assert.deepEqual(await repositorySentinelSnapshot(), repositoryBefore, 'crafted import must leave checkout status sentinels unchanged');
});

test('lexical cleanup removes an alias without recursively deleting its resolved victim', async () => {
  const victim = path.join(temporaryRoot, 'cleanup-victim');
  const cleanupAlias = path.join(temporaryRoot, 'cleanup-alias');
  const marker = path.join(victim, 'must-survive.txt');
  await mkdir(victim);
  await writeFile(marker, 'victim must survive\n', { flag: 'wx' });
  await symlink(victim, cleanupAlias, process.platform === 'win32' ? 'junction' : 'dir');
  await rm(cleanupAlias, { recursive: true, force: true });
  assert.equal(await readFile(marker, 'utf8'), 'victim must survive\n');
  await assert.rejects(access(cleanupAlias), { code: 'ENOENT' });
  await rm(victim, { recursive: true, force: true });

  const source = await readFile(VERIFIER_PATH, 'utf8');
  assert.match(source, /const cleanupRoot = await mkdtemp/u);
  assert.match(source, /await rm\(cleanupRoot, \{ recursive: true, force: true \}\)/u);
  assert.doesNotMatch(source, /await rm\(canonicalRoot/u);
});

test('pure API rejects accessors without invoking them, extra fields, aliases, and shared buffers', () => {
  let getterCalled = false;
  const accessor = { archiveBytes };
  Object.defineProperty(accessor, 'descriptorBytes', {
    enumerable: true,
    get() {
      getterCalled = true;
      return descriptorBytes;
    }
  });
  assert.throws(() => verifyRollbackBundle(accessor), /own data properties only/u);
  assert.equal(getterCalled, false);
  assert.throws(
    () => verifyRollbackBundle({ descriptorBytes, archiveBytes, extra: false }),
    /exactly descriptorBytes and archiveBytes/u
  );
  assert.throws(
    () => verifyRollbackBundle(Object.assign(Object.create(null), { descriptorBytes, archiveBytes })),
    /plain object/u
  );
  const shared = Buffer.from(new SharedArrayBuffer(archiveBytes.byteLength));
  assert.throws(
    () => verifyRollbackBundle({ descriptorBytes, archiveBytes: shared }),
    /ordinary non-shared Buffer/u
  );
});

test('descriptor parser rejects BOM, CRLF, trailing data, duplicate keys, and noncanonical bytes', async t => {
  const text = descriptorBytes.toString('utf8');
  const cases = [
    ['BOM', Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), descriptorBytes]), /BOM/u],
    ['CRLF', Buffer.from(text.replaceAll('\n', '\r\n')), /canonical JSON encoding|fixed historical baseline/u],
    ['trailing data', Buffer.concat([descriptorBytes, Buffer.from('\n')]), /canonical JSON encoding|trailing data/u],
    [
      'duplicate key',
      Buffer.from(text.replace('{\n', '{\n  "schemaVersion": "1.0.0",\n')),
      /duplicate key/u
    ],
    ['compact encoding', Buffer.from(JSON.stringify(JSON.parse(text))), /canonical JSON encoding/u],
    [
      'semantic mutation',
      Buffer.from(text.replace('"historical-pre-repair-snapshot"', '"historical-pre-repair-snapshox"')),
      /fixed historical baseline/u
    ]
  ];
  for (const [label, candidate, expected] of cases) {
    await t.test(label, () => {
      assert.throws(() => verifyRollbackBundle({ descriptorBytes: candidate, archiveBytes }), expected);
    });
  }
});

test('archive rejects truncation, appended blocks, malformed magic, and malformed version', async t => {
  const cases = [
    ['truncated terminal blocks', archiveBytes.subarray(0, archiveBytes.byteLength - BLOCK_BYTES), /truncated|exactly 1536 zero bytes/u],
    ['appended terminal block', Buffer.concat([archiveBytes, Buffer.alloc(BLOCK_BYTES)]), /exactly 1536 zero bytes/u],
    ['legacy magic', (() => { const b = cloneArchive(); b[257] ^= 1; return b; })(), /legacy-GNU magic/u],
    ['legacy version', (() => { const b = cloneArchive(); b[263] = 0x30; return b; })(), /legacy-GNU version/u]
  ];
  for (const [label, candidate, expected] of cases) {
    await t.test(label, () => assert.throws(() => verifyArchive(candidate), expected));
  }
});

test('archive rejects bad checksums, noncanonical numbers, and changed fixed header metadata', async t => {
  const scenarios = [
    ['checksum', b => { b[offsets[1].offset + 148] ^= 1; }, /checksum does not match/u],
    ['base-256 size', b => { b[offsets[1].offset + 124] = 0x80; }, /canonical legacy-GNU octal/u],
    ['mode', b => setAsciiField(b, offsets[1].offset, 100, 8, '0000600'), /mode does not match/u],
    ['uid', b => setAsciiField(b, offsets[1].offset, 108, 8, '0001752'), /uid does not match/u],
    ['gid', b => setAsciiField(b, offsets[1].offset, 116, 8, '0001752'), /gid does not match/u],
    ['mtime', b => setAsciiField(b, offsets[1].offset, 136, 12, '15241471474'), /mtime does not match/u],
    ['uname', b => setAsciiField(b, offsets[1].offset, 265, 32, 'root'), /uname does not match/u],
    ['gname', b => setAsciiField(b, offsets[1].offset, 297, 32, 'root'), /gname does not match/u]
  ];
  for (const [label, mutate, expected] of scenarios) {
    await t.test(label, () => {
      const candidate = cloneArchive();
      mutate(candidate);
      assert.throws(() => verifyArchive(candidate), expected);
    });
  }
});

test('archive rejects extension, link, special, and nonzero auxiliary metadata', async t => {
  const scenarios = [
    ['PAX extension', b => { b[offsets[1].offset + 156] = 0x78; recomputeHeaderChecksum(b, offsets[1].offset); }, /extension, link, or special/u],
    ['symbolic link', b => { b[offsets[1].offset + 156] = 0x32; recomputeHeaderChecksum(b, offsets[1].offset); }, /extension, link, or special/u],
    ['character device', b => { b[offsets[1].offset + 156] = 0x33; recomputeHeaderChecksum(b, offsets[1].offset); }, /extension, link, or special/u],
    ['link target', b => { b[offsets[1].offset + 157] = 0x78; recomputeHeaderChecksum(b, offsets[1].offset); }, /forbidden link target/u],
    ['device major', b => { b[offsets[1].offset + 329] = 0x31; recomputeHeaderChecksum(b, offsets[1].offset); }, /forbidden device major/u],
    ['device minor', b => { b[offsets[1].offset + 337] = 0x31; recomputeHeaderChecksum(b, offsets[1].offset); }, /forbidden device minor/u],
    ['prefix', b => { b[offsets[1].offset + 345] = 0x78; recomputeHeaderChecksum(b, offsets[1].offset); }, /forbidden prefix/u],
    ['reserved bytes', b => { b[offsets[1].offset + 500] = 0x78; recomputeHeaderChecksum(b, offsets[1].offset); }, /forbidden reserved metadata/u]
  ];
  for (const [label, mutate, expected] of scenarios) {
    await t.test(label, () => {
      const candidate = cloneArchive();
      mutate(candidate);
      assert.throws(() => verifyArchive(candidate), expected);
    });
  }
});

test('archive rejects traversal, absolute, backslash, NUL-tail, case-collision, and file-directory paths', async t => {
  const scenarios = [
    ['traversal', b => setAsciiField(b, offsets[1].offset, 0, 100, './../escape'), /portable top-level path/u],
    ['absolute', b => setAsciiField(b, offsets[1].offset, 0, 100, '/escape'), /absolute, non-canonical/u],
    ['drive absolute', b => setAsciiField(b, offsets[1].offset, 0, 100, 'C:/escape'), /absolute, non-canonical/u],
    ['backslash', b => setAsciiField(b, offsets[1].offset, 0, 100, '.\\escape'), /forbidden separator/u],
    ['NUL tail', b => {
      const start = offsets[1].offset;
      b.fill(0, start, start + 100);
      Buffer.from('./safe\0evil', 'binary').copy(b, start);
      recomputeHeaderChecksum(b, start);
    }, /data after its NUL terminator/u],
    ['case collision', b => setAsciiField(b, offsets[3].offset, 0, 100, './INDEX.HTML'), /case-colliding path/u],
    ['file-directory collision', b => {
      b[offsets[1].offset + 156] = 0x35;
      recomputeHeaderChecksum(b, offsets[1].offset);
    }, /exact \.\/ root directory/u]
  ];
  for (const [label, mutate, expected] of scenarios) {
    await t.test(label, () => {
      const candidate = cloneArchive();
      mutate(candidate);
      assert.throws(() => verifyArchive(candidate), expected);
    });
  }
});

test('archive rejects nonzero payload padding and any terminal-zero mutation', async t => {
  await t.test('payload padding', () => {
    const candidate = cloneArchive();
    const entry = offsets.find(value => value.size > 0 && value.size % BLOCK_BYTES !== 0);
    assert.ok(entry);
    candidate[entry.dataStart + entry.size] = 1;
    assert.throws(() => verifyArchive(candidate), /nonzero padding/u);
  });
  await t.test('terminal zeros', () => {
    const candidate = cloneArchive();
    candidate[candidate.byteLength - 1] = 1;
    assert.throws(() => verifyArchive(candidate), /exactly 1536 zero bytes/u);
  });
});

test('archive rejects changed order, inventory, root metadata, and payload digests', async t => {
  const scenarios = [
    ['inventory', b => setAsciiField(b, offsets[1].offset, 0, 100, './other.html'), /path does not match the descriptor/u],
    ['root mode', b => setAsciiField(b, offsets[0].offset, 100, 8, '0000644'), /mode does not match/u],
    ['regular payload digest', b => { b[offsets[6].dataStart + offsets[6].size - 20] ^= 1; }, /payload digest or Git blob does not match/u]
  ];
  for (const [label, mutate, expected] of scenarios) {
    await t.test(label, () => {
      const candidate = cloneArchive();
      mutate(candidate);
      assert.throws(() => verifyArchive(candidate), expected);
    });
  }
});

test('offline smoke rejects HTML, JSON, JSON-LD, NDJSON, robots, sitemap, and PNG mutations before extraction', async t => {
  const scenarios = [
    [
      'HTML identity',
      b => replacePayloadText(b, './index.html',
        'AI Research Tech Tree - Curated 1879-2026 Atlas',
        'AI Research Tech Tree - Curated 1879-2026 Atlay'),
      /fixed title/u
    ],
    [
      'normalized JSON edition',
      b => replacePayloadText(b, './ai-research-tech-tree.json',
        '"edition": "2026-08-13-public-beta-1"',
        '"edition": "2026-08-13-public-beta-2"'),
      /normalized JSON dataset does not close/u
    ],
    [
      'JSON-LD digest',
      b => replacePayloadText(b, './ai-research-tech-tree.jsonld', DATA_DIGEST_FOR_TEST, `${DATA_DIGEST_FOR_TEST.slice(0, -1)}c`),
      /JSON-LD identity does not cross-bind/u
    ],
    [
      'NDJSON edition',
      b => replacePayloadText(b, './ai-research-tech-tree.ndjson',
        '"edition":"2026-08-13-public-beta-1"',
        '"edition":"2026-08-13-public-beta-2"'),
      /NDJSON dataset does not close/u
    ],
    [
      'robots URL',
      b => replacePayloadText(b, './robots.txt', 'ai_tech_tree', 'ai_tech_treE'),
      /robots\.txt does not match/u
    ],
    [
      'sitemap URL',
      b => replacePayloadText(b, './sitemap.xml', 'ai_tech_tree', 'ai_tech_treE'),
      /fixed sitemap production URL/u
    ],
    [
      'PNG dimensions',
      b => {
        const entry = offsets.find(value => value.name === './social-card.png');
        b.writeUInt32BE(1732, entry.dataStart + 16);
      },
      /dimensions do not match/u
    ]
  ];
  for (const [label, mutate, expected] of scenarios) {
    await t.test(label, () => {
      const candidate = cloneArchive();
      mutate(candidate);
      assert.throws(() => verifyArchive(candidate), expected);
    });
  }
});

const DATA_DIGEST_FOR_TEST = 'f2d78f9cb04820bb9ed6ebaeb9a6a75f7faf64edbb52314eefc3114650a7455b';

test('source verifier contains no network, token, environment-option, or subprocess capability', async () => {
  const source = await readFile(VERIFIER_PATH, 'utf8');
  assert.doesNotMatch(source, /node:(?:child_process|http|https|http2|net|tls|dns)|\bfetch\s*\(|process\.env|authorization|bearer|github[_-]?token/iu);
  assert.match(source, /if \(import\.meta\.main\)/u);
  assert.doesNotMatch(source, /process\.argv\[1\].*(?:import\.meta\.url|fileURLToPath)/u);
});

test('fixed descriptor is the only adjacent checksum-bearing prose-free binding', async () => {
  const rollbackRoot = path.join(REPOSITORY_ROOT, 'rollback', 'production-2026-08-20-76483d2d');
  assert.deepEqual(await readdir(rollbackRoot), ['artifact.tar']);
  await assert.rejects(access(path.join(rollbackRoot, 'extracted')), { code: 'ENOENT' });
  await assert.rejects(access(path.join(rollbackRoot, 'SHA256SUMS.txt')), { code: 'ENOENT' });
  await assert.rejects(access(path.join(rollbackRoot, 'RECOVERY-METADATA.md')), { code: 'ENOENT' });
});
