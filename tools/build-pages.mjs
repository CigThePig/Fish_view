import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));

// Fingerprint the whole module graph, not just app.js: a fresh entry point
// importing cached pre-migration config/state modules would still fail.
export async function buildPages({ root = repositoryRoot, output = path.join(root, '_site') } = {}) {
  const topLevel = (await readdir(root)).filter(name => /\.(html|css)$/.test(name)).sort();
  const modules = (await readdir(path.join(root, 'src'), { recursive: true }))
    .filter(name => name.endsWith('.js')).map(name => `src/${name}`).sort();
  const hash = createHash('sha256');
  for (const name of [...topLevel, ...modules]) {
    hash.update(name).update('\0').update(await readFile(path.join(root, name))).update('\0');
  }
  const release = hash.digest('hex').slice(0, 16);
  const assets = `assets/${release}`;
  await rm(output, { recursive: true, force: true });
  await mkdir(path.join(output, assets), { recursive: true });
  await cp(path.join(root, 'src'), path.join(output, assets, 'src'), { recursive: true });
  for (const name of topLevel) {
    if (name.endsWith('.css')) {
      await cp(path.join(root, name), path.join(output, assets, name));
      continue;
    }
    const html = (await readFile(path.join(root, name), 'utf8')).replace(
      /((?:src|href)=")([^"?]+\.(?:js|css))(?:\?[^"\s]*)?"/g,
      (_, prefix, asset) => `${prefix}${assets}/${asset}"`,
    );
    await writeFile(path.join(output, name), html);
  }
  for (const name of ['LICENSE', 'THIRD_PARTY_NOTICES.md']) await cp(path.join(root, name), path.join(output, name));
  await writeFile(path.join(output, '.nojekyll'), '');
  await writeFile(path.join(output, 'asset-manifest.json'), JSON.stringify({ release, assets, modules }, null, 2) + '\n');
  return { release, assets, output };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(await buildPages());
}
