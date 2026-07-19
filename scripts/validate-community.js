import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { load as yamlLoad } from 'js-yaml';

export const REQUIRED_COMMUNITY_FILES = [
  'CODE_OF_CONDUCT.md', 'CONTRIBUTING.md', 'GOVERNANCE.md', 'MAINTAINERS.md',
  'SECURITY.md', 'SUPPORT.md', '.github/CODEOWNERS',
  '.github/ISSUE_TEMPLATE/config.yml', '.github/ISSUE_TEMPLATE/bug.yml',
  '.github/ISSUE_TEMPLATE/detector-result.yml',
  '.github/ISSUE_TEMPLATE/documentation.yml',
  '.github/ISSUE_TEMPLATE/integration.yml',
];

export function validateCommunity(root) {
  const errors = [];
  for (const relative of REQUIRED_COMMUNITY_FILES) {
    if (!fs.existsSync(path.join(root, relative))) errors.push(`missing ${relative}`);
  }
  for (const directory of ['.github/ISSUE_TEMPLATE', '.github/DISCUSSION_TEMPLATE']) {
    const absolute = path.join(root, directory);
    if (!fs.existsSync(absolute)) continue;
    for (const name of fs.readdirSync(absolute).filter((file) => /\.ya?ml$/.test(file))) {
      const relative = path.join(directory, name);
      try {
        const document = yamlLoad(fs.readFileSync(path.join(root, relative), 'utf8'));
        if (name !== 'config.yml') {
          if (!document?.name && directory.includes('ISSUE_TEMPLATE')) errors.push(`${relative} has no name`);
          if (!document?.title) errors.push(`${relative} has no title`);
          if (!Array.isArray(document?.body) || !document.body.length) errors.push(`${relative} has no body`);
          const ids = document?.body?.map((item) => item.id).filter(Boolean) || [];
          if (new Set(ids).size !== ids.length) errors.push(`${relative} has duplicate field ids`);
        }
      } catch (error) {
        errors.push(`${relative} is invalid YAML: ${error.message}`);
      }
    }
  }
  const securityFile = path.join(root, 'SECURITY.md');
  const security = fs.existsSync(securityFile) ? fs.readFileSync(securityFile, 'utf8') : '';
  if (!/private vulnerability reporting/i.test(security)) errors.push('SECURITY.md must route to private vulnerability reporting');
  if (/confidential issue/i.test(security)) errors.push('SECURITY.md must not claim public issues are confidential');
  return errors;
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  const errors = validateCommunity(process.cwd());
  if (errors.length) {
    errors.forEach((error) => console.error(error));
    process.exitCode = 1;
  } else console.log(`community contract valid (${REQUIRED_COMMUNITY_FILES.length} required files)`);
}
