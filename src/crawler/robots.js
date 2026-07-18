/** Minimal robots.txt parser sufficient for governance checks. */
export function parseRobots(text) {
  const groups = [];
  let current = null;
  const sitemaps = [];
  const errors = [];
  const lines = String(text ?? '').split(/\r?\n/);
  lines.forEach((line, i) => {
    const noComment = line.replace(/#.*$/, '').trim();
    if (!noComment) return;
    const m = noComment.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) {
      errors.push(`line ${i + 1}: unparseable: "${line.trim()}"`);
      return;
    }
    const key = m[1].toLowerCase();
    const value = m[2].trim();
    if (key === 'user-agent') {
      if (!current || current.rulesStarted) {
        current = { agents: [], rules: [], rulesStarted: false };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
    } else if (key === 'allow' || key === 'disallow') {
      if (!current) {
        errors.push(`line ${i + 1}: ${key} before any User-agent`);
        return;
      }
      current.rulesStarted = true;
      current.rules.push({ type: key, path: value });
    } else if (key === 'sitemap') {
      sitemaps.push(value);
    } else if (key === 'crawl-delay') {
      if (current) { current.rulesStarted = true; current.rules.push({ type: 'crawl-delay', path: value }); }
    } else {
      errors.push(`line ${i + 1}: unknown directive "${m[1]}"`);
    }
  });
  return { groups, sitemaps, errors };
}

function ruleMatches(rulePath, urlPath) {
  if (rulePath === '') return false; // empty disallow = allow all
  let re = rulePath.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  if (re.endsWith('\\$')) re = re.slice(0, -2) + '$';
  return new RegExp('^' + re).test(urlPath);
}

/** Decide whether userAgent may fetch urlPath under parsed robots. */
export function isAllowed(parsed, userAgent, urlPath) {
  const ua = userAgent.toLowerCase();
  let group =
    parsed.groups.find((g) => g.agents.some((a) => a !== '*' && ua.includes(a))) ||
    parsed.groups.find((g) => g.agents.includes('*'));
  if (!group) return { allowed: true, rule: null };
  let best = null;
  for (const r of group.rules) {
    if (r.type !== 'allow' && r.type !== 'disallow') continue;
    if (ruleMatches(r.path, urlPath)) {
      if (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.type === 'allow')) {
        best = r;
      }
    }
  }
  if (!best) return { allowed: true, rule: null };
  return { allowed: best.type === 'allow', rule: `${best.type}: ${best.path}` };
}
