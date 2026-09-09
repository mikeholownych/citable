import { exportExecutiveCroReport } from '../reporting/executiveCroReport.js';

export async function executiveCroCommand(args = [], root = process.cwd()) {
  const target = argVal(args, '--target');
  const baseUrl = argVal(args, '--base-url');
  const runId = argVal(args, '--run');
  const client = argVal(args, '--client');
  const format = args.includes('--json') ? 'json' : argVal(args, '--format') || 'markdown';
  const output = argVal(args, '--output');
  const input = argVal(args, '--input');
  const funnel = argVal(args, '--funnel');

  const r = await exportExecutiveCroReport(root, {
    target,
    baseUrl,
    runId,
    clientName: client || 'Enterprise Client',
    format,
    output,
    telemetryInput: input,
    funnelId: funnel,
  });

  return format === 'json' ? r.data : r.content;
}

function argVal(args, flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : null;
}
