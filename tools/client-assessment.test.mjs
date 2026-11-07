// SPDX-License-Identifier: AGPL-3.0-only
// Additional permission: APP-STORE-PERMISSION.md (AGPL section 7)
// Copyright 2026 Bipe contributors

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkClientAssessment, assessmentMarkdown, staleWebExclusion, CORE_CAPABILITIES } from './lib/client-assessment.mjs';
const read = file => JSON.parse(readFileSync(new URL('../product/' + file, import.meta.url)));
const assessment = read('client-assessment.json'), ledger = read('parity.json'), plan = read('desktop-plan.json');

test('the matrix covers every personal/work capability and keeps all core call/media rows explicit', () => {
  assert.deepEqual(checkClientAssessment(assessment, ledger.items), []);
  const text = assessmentMarkdown(assessment, ledger, plan).join('\n');
  for (const item of ledger.items) assert.ok(text.includes('`' + item.id + '`'), item.id);
  for (const id of CORE_CAPABILITIES) {
    const changed = structuredClone(assessment);
    changed.requiredCapabilities = changed.requiredCapabilities.filter(value => value !== id);
    assert.ok(checkClientAssessment(changed, ledger.items).length, id);
  }
  assert.ok(text.includes('Not recorded'));
  assert.ok(staleWebExclusion(ledger.items.find(item => item.id === 'scam-alerts')));
});

test('compilation or an unversioned claim cannot pass as device acceptance', () => {
  const changed = structuredClone(assessment);
  changed.acceptanceRecords = [{ scenario: 'calls', result: 'passed', evidence: ['CI compiled'] }];
  assert.ok(checkClientAssessment(changed, ledger.items).length);
  changed.acceptanceRecords = [{ scenario: 'calls', result: 'passed', date: '2026-11-07', accountScope: 'both',
    clients: [{ id: 'macos', version: '1.0.1', build: 'example', os: 'macOS example' }], evidence: ['test fixture only'] }];
  assert.deepEqual(checkClientAssessment(changed, ledger.items), []);
});
