import { access, readFile } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8'));

const requiredFiles = [
  manifest.background?.service_worker,
  manifest.side_panel?.default_path,
  ...(manifest.content_scripts || []).flatMap((script) => [...(script.js || []), ...(script.css || [])]),
  ...Object.values(manifest.icons || {}),
  ...Object.values(manifest.action?.default_icon || {}),
].filter(Boolean);

await Promise.all([...new Set(requiredFiles)].map((file) => access(join(root, file))));

const requiredPermissions = ['activeTab', 'sidePanel', 'storage', 'tabs'];
for (const permission of requiredPermissions) {
  if (!manifest.permissions?.includes(permission)) {
    throw new Error(`Missing required permission: ${permission}`);
  }
}

for (const script of (manifest.content_scripts || []).flatMap((item) => item.js || [])) {
  checkJavaScript(join(root, script));
}
if (manifest.background?.service_worker) {
  checkJavaScript(join(root, manifest.background.service_worker));
}
checkJavaScript(join(root, 'src/sidepanel.js'));

console.log(`Validated ${requiredFiles.length} extension assets and manifest wiring.`);

function checkJavaScript(file) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`${file} failed syntax check:\n${result.stderr || result.stdout}`);
  }
}
