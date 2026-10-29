// Next.js copies loaded .env files to standalone independently of tracing excludes.
// Remove only generated copies; secrets must be injected by the runtime host.
import { cp, readdir, rm } from "node:fs/promises";
import path from "node:path";
const root = path.resolve(".next/standalone");
async function clean(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) await clean(file);
    else if (entry.name === ".env" || entry.name.startsWith(".env."))
      await rm(file);
  }
}
await clean(root);
await rm(path.join(root, "data"), { recursive: true, force: true });
await cp("public", path.join(root, "public"), { recursive: true });
await cp(".next/static", path.join(root, ".next/static"), { recursive: true });
console.log(
  "Standalone output includes static assets and excludes environment files and private runtime snapshots.",
);
