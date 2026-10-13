import { build } from "esbuild";
import { copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const destination = path.join(root, "dist-public-policy");
const legacyFiles = [
  "2026-06-08-weekly-policy-memo.pdf",
  "2026-06-08-weekly-policy-memo-cover.png",
  "1H2026-us-digital-asset-policy.pdf",
  "1H2026-us-digital-asset-policy-cover.png",
];
await rm(destination, { recursive: true, force: true });
await mkdir(path.join(destination, "resources"), { recursive: true });
const result = await build({
  entryPoints: [path.join(root, "workers/public-policy.ts")],
  outfile: path.join(destination, "index.js"),
  bundle: true, platform: "node", target: "node22", format: "cjs", minify: true,
  tsconfig: path.join(root, "tsconfig.json"), metafile: true,
});
await Promise.all(legacyFiles.map((file) => copyFile(path.join(root, "public/resources", file), path.join(destination, "resources", file))));
await writeFile(path.join(destination, "bundle-manifest.json"), JSON.stringify({ inputs: Object.keys(result.metafile.inputs).sort(), resources: legacyFiles }, null, 2) + "\n");
console.log(`Built public policy worker at ${destination}`);
