import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

function normalizePackEntries(parsed) {
  if (Array.isArray(parsed)) {
    return parsed.some((entry) => entry?.filename && Array.isArray(entry.files)) ? parsed : null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  if (parsed.filename && Array.isArray(parsed.files)) return [parsed];
  const values = Object.values(parsed);
  return values.some((entry) => entry?.filename && Array.isArray(entry.files)) ? values : null;
}

export function parsePackJson(output) {
  for (let start = 0; start < output.length; start += 1) {
    if (output[start] !== '[' && output[start] !== '{') continue;
    const stack = [];
    let inString = false;
    let escaped = false;
    for (let index = start; index < output.length; index += 1) {
      const char = output[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === '"') inString = false;
        continue;
      }
      if (char === '"') inString = true;
      else if (char === '[') stack.push(']');
      else if (char === '{') stack.push('}');
      else if (char === ']' || char === '}') {
        if (stack.pop() !== char) break;
        if (stack.length === 0) {
          const entries = normalizePackEntries(JSON.parse(output.slice(start, index + 1)));
          if (entries) return entries;
          break;
        }
      }
    }
  }
  throw new Error('npm pack did not emit package metadata JSON');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) throw new Error('usage: node scripts/pack-json.js <input-json> <output-filename>');
  const [pack] = parsePackJson(fs.readFileSync(input, 'utf8'));
  fs.writeFileSync(output, `${pack.filename}\n`);
}
