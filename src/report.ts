import { RouteReport } from './server';

export function generateReport(routes: Map<string, RouteReport>) {
  const lines: string[] = [];

  lines.push(
    '<!DOCTYPE html><html><head><title>Routes usage</title><meta charset="utf-8"></head><body><table style="border: 2px;border-style: ridge;border-radius: 5px;padding: 10px;"><tr><th>Route</th><th>Hits</th><th>Successes</th><th>Fails</th></tr>',
  );

  const sorted = [...routes].sort(([a], [b]) => {
    if (a > b) return 1;
    else if (b > a) return -1;
    return 0;
  });

  sorted.forEach(([route, stats]) => {
    lines.push(
      `<tr><td>${route}</td><td>${stats.hits}</td><td>${stats.success}</td><td>${stats.fails}</td></tr>`,
    );
  });

  lines.push('</table></body></html>');

  return lines.join('');
}
