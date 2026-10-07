import fs from 'node:fs';
import path from 'node:path';

interface SecretCheckResult {
  passed: boolean;
  violations: string[];
}

function checkEnvExample(): string[] {
  const violations: string[] = [];
  const envExamplePath = path.resolve(process.cwd(), '.env.example');

  if (!fs.existsSync(envExamplePath)) {
    violations.push('Missing .env.example file');
    return violations;
  }

  const content = fs.readFileSync(envExamplePath, 'utf-8');
  const sensitiveKeys = [
    'AUTH_SECRET',
    'JWT_ACCESS_SECRET',
    'ENCRYPTION_KEK',
    'MEDIA_URL_SECRET',
    'PLIVO_AUTH_TOKEN',
    'PLIVO_WEBHOOK_AUTH_TOKEN',
    'SEED_OWNER_PASSWORD',
  ];

  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const [key, ...rest] = trimmed.split('=');
    const value = rest.join('=').trim();

    if (sensitiveKeys.includes(key.trim()) && value.length > 0) {
      violations.push(`.env.example contains non-empty value for sensitive key: ${key}`);
    }
  }

  return violations;
}

function scanFilesForSecrets(dir: string, baseDir: string = dir): string[] {
  const violations: string[] = [];
  const ignoredFolders = new Set(['node_modules', '.git', '.next', 'out', 'build', 'coverage', '.tmp']);
  const sensitivePatterns = [
    /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/,
    /["'](?:MAM|SA)[A-Za-z0-9]{18,}["']/, // Plivo auth IDs shouldn't be hardcoded
  ];

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!ignoredFolders.has(entry.name)) {
        violations.push(...scanFilesForSecrets(path.join(dir, entry.name), baseDir));
      }
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name);
      if (['.ts', '.tsx', '.js', '.jsx', '.json', '.md'].includes(ext)) {
        const fullPath = path.join(dir, entry.name);
        const relPath = path.relative(baseDir, fullPath);

        // Skip test fixture files or markdown doc files that discuss dummy values
        if (relPath.startsWith('tests\\') || relPath.startsWith('tests/') || relPath.endsWith('.md')) {
          continue;
        }

        const content = fs.readFileSync(fullPath, 'utf-8');
        for (const pattern of sensitivePatterns) {
          if (pattern.test(content)) {
            violations.push(`File ${relPath} matches suspicious secret pattern: ${pattern}`);
          }
        }
      }
    }
  }

  return violations;
}

export function runSecretAudit(): SecretCheckResult {
  const violations: string[] = [];

  // 1. Verify .env is not in git tracking
  const gitIgnorePath = path.resolve(process.cwd(), '.gitignore');
  if (fs.existsSync(gitIgnorePath)) {
    const gitIgnoreContent = fs.readFileSync(gitIgnorePath, 'utf-8');
    if (!gitIgnoreContent.includes('.env*')) {
      violations.push('.gitignore does not contain .env* pattern');
    }
  }

  // 2. Verify .env.example
  violations.push(...checkEnvExample());

  // 3. Scan code directories
  const codeFolders = ['src', 'prisma', 'tools'];
  for (const folder of codeFolders) {
    const folderPath = path.resolve(process.cwd(), folder);
    if (fs.existsSync(folderPath)) {
      violations.push(...scanFilesForSecrets(folderPath));
    }
  }

  return {
    passed: violations.length === 0,
    violations,
  };
}

// CLI Execution
const result = runSecretAudit();
console.log('--- SECRET AND CREDENTIAL SAFETY SCAN ---');
if (result.passed) {
  console.log('STATUS: PASSED (0 secret violations found)');
  console.log('Checked .gitignore, .env.example, src/, prisma/, and tools/.');
  process.exit(0);
} else {
  console.error(`STATUS: FAILED (${result.violations.length} violations found):`);
  for (const v of result.violations) {
    console.error(` - ${v}`);
  }
  process.exit(1);
}
