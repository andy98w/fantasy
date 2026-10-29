import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const python = path.join(root, ".venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
if (!existsSync(python)) {
  console.error("Run uv sync --frozen to install the sync worker before npm run dev.");
  process.exit(1);
}

const children = new Set();
let stopping = false;
function stop(code) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) child.kill("SIGTERM");
  // Bound shutdown if an upstream request or dev server refuses to exit.
  const timeout = setTimeout(() => {
    for (const child of children) child.kill("SIGKILL");
  }, 5000);
  timeout.unref();
}
function launch(command, args, optional = false) {
  const child = spawn(command, args, {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, PYTHONUNBUFFERED: "1" },
  });
  children.add(child);
  child.on("error", () => {
    console.error("Could not start a development process.");
    stop(1);
  });
  child.on("exit", (code) => {
    children.delete(child);
    if (!stopping && !(optional && code === 0)) stop(code ?? 1);
  });
}
process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));
launch(process.execPath, [path.join(root, "node_modules/next/dist/bin/next"), "dev", "--hostname", "127.0.0.1", ...process.argv.slice(2)]);
launch(python, ["-m", "worker.watch"], true);
