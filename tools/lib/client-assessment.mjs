// SPDX-License-Identifier: AGPL-3.0-only
// Additional permission: APP-STORE-PERMISSION.md (AGPL section 7)
// Copyright 2026 Bipe contributors

const clients = ['ios', 'android', 'web', 'macos', 'windows'];
export const CORE_CAPABILITIES = ['message-text', 'message-reply', 'message-edit', 'message-delete',
  'message-reactions', 'typing-indicator', 'message-send-retry', 'media-images', 'media-videos',
  'media-files', 'media-voice', 'calls-audio', 'calls-video', 'calls-group', 'screen-sharing'];

/** Status lives in the ledger; acceptance requires actual client/build/OS evidence. */
export function checkClientAssessment(assessment, items) {
  const problems = [];
  const known = new Set(items.map(item => item.id));
  const date = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
  if (assessment?.version !== 1 || !date(assessment.reviewedOn)
      || JSON.stringify(assessment.clients) !== JSON.stringify(clients)) return ['client-assessment: version, review date and all five clients required'];
  const required = assessment.requiredCapabilities ?? [];
  if (new Set(required).size !== required.length || required.some(id => !known.has(id))
      || CORE_CAPABILITIES.some(id => !required.includes(id))) problems.push('client-assessment: explicit core messaging, media and call capabilities required');
  const scenarios = new Map();
  const covered = new Set();
  for (const scenario of assessment.scenarios ?? []) {
    if (!/^[a-z0-9-]+$/.test(scenario.id) || scenarios.has(scenario.id)
        || !scenario.capabilities?.length || scenario.capabilities.some(id => !known.has(id))
        || !scenario.checks?.length || scenario.checks.some(check => typeof check !== 'string' || !check.trim())) {
      problems.push(`client-assessment: invalid scenario ${scenario.id}`);
    }
    scenarios.set(scenario.id, scenario);
    for (const id of scenario.capabilities ?? []) covered.add(id);
  }
  for (const id of required) if (!covered.has(id)) problems.push(`client-assessment: no acceptance scenario for ${id}`);
  if (!Array.isArray(assessment.acceptanceRecords)) problems.push('client-assessment: acceptanceRecords must be an array; an empty array means not recorded');
  for (const record of assessment.acceptanceRecords ?? []) {
    if (!date(record.date) || !['passed', 'failed'].includes(record.result)
        || !scenarios.has(record.scenario) || !['personal', 'work', 'both'].includes(record.accountScope)
        || !record.clients?.length || new Set(record.clients.map(client => client.id)).size !== record.clients.length
        || record.clients.some(client => !clients.includes(client.id) || ['version', 'build', 'os'].some(key => !String(client[key] ?? '').trim()))
        || !record.evidence?.length || record.evidence.some(path => typeof path !== 'string' || !path.trim())) {
      problems.push('client-assessment: device records need scenario, result, date, account scope, client versions/builds/OS and evidence');
    }
  }
  return problems;
}

export function staleWebExclusion(item) {
  return item.web?.status === 'n/a' && /No web chat|ADR 0004|stock Element Web/i.test(item.web.reason ?? '');
}

export function assessmentMarkdown(assessment, ledger, plan) {
  const label = { built: 'Built', testing: 'Tester build', planned: 'Planned', policy: 'Policy', 'n/a': 'n/a' };
  const entry = (item, client) => typeof item[client] === 'string' ? { status: item[client] } : item[client];
  const items = new Map(ledger.items.map(item => [item.id, item]));
  const lines = [
    '## Client functionality assessment', '',
    `Source review: ${assessment.reviewedOn}. All ${ledger.items.length} ledger capabilities are included, covering personal and work features. Status and code evidence remain in parity.json; this matrix does not create another implementation status.`, '',
    'Built means app integration exists. Tester build means it is in a tester artifact. Neither means a cross-client device test passed. SDK APIs, a successful build, and video-file playback do not prove calls work. Video messages, voice messages, audio calls, video calls, group calls and screen sharing are separate capabilities.', '',
    'Device acceptance records live in client-assessment.json. Missing records mean **not recorded**, including phone-offline use, reconnect, revocation, permissions and incoming calls in background/locked/asleep/quit states. A source review cannot mark these passed.', '',
  ];
  for (const wave of plan.waves) {
    lines.push(`### ${wave.title} (#${wave.issue})`, '',
      '| Capability | iOS | Android | Web | Mac | Windows | Device acceptance |',
      '|---|---|---|---|---|---|---|');
    for (const id of wave.capabilities) {
      const item = items.get(id);
      const cells = clients.map(client => {
        const e = entry(item, client);
        if (client === 'web' && staleWebExclusion(item)) return 'Review required (ledger n/a)';
        const code = e.evidence?.[0];
        const match = code?.match(/^([^/]+)\/(.*)$/);
        return label[e.status] + (e.issue ? ` #${e.issue}` : '')
          + (match ? ` ([code](https://github.com/bipe-chat/${match[1]}/blob/main/${match[2]}))` : '');
      });
      const scenarios = new Set(assessment.scenarios.filter(s => s.capabilities.includes(id)).map(s => s.id));
      const records = assessment.acceptanceRecords.filter(r => scenarios.has(r.scenario));
      const acceptance = records.length ? `${records.filter(r => r.result === 'passed').length} passed / ${records.filter(r => r.result === 'failed').length} failed records; see source for clients/builds` : 'Not recorded';
      lines.push(`| ${item.name.replaceAll('|', '\\|')} (\`${id}\`) | ${cells.join(' | ')} | ${acceptance} |`);
    }
    lines.push('');
    for (const id of wave.capabilities) {
      const item = items.get(id);
      for (const client of clients) {
        const note = entry(item, client).note;
        if (note) lines.push(`- \`${id}\`, ${client}: ${note}`);
      }
    }
    lines.push('');
  }
  lines.push('### Acceptance scenarios', '');
  for (const scenario of assessment.scenarios) {
    lines.push(`**${scenario.id}**: ${scenario.capabilities.map(id => `\`${id}\``).join(', ')}.`, '',
      ...scenario.checks.map(check => `- [ ] ${check}`), '');
  }
  return lines;
}
