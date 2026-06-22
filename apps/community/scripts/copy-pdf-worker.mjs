import { copyFileSync, mkdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const pdfjsPackagePath = require.resolve("pdfjs-dist/package.json");
const pdfjsPackageDir = dirname(pdfjsPackagePath);
const source = join(pdfjsPackageDir, "legacy", "build", "pdf.worker.min.mjs");
const targetDir = join(process.cwd(), ".next", "server", "chunks");
const target = join(targetDir, "pdf.worker.mjs");

mkdirSync(targetDir, { recursive: true });
copyFileSync(source, target);

const { size } = statSync(target);
console.log(`Copied PDF.js worker to ${target} (${size} bytes).`);
