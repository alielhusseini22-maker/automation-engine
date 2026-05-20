// Chargeur de configuration projet. Tous les commands passent par ici.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

export function loadProject(projectId) {
  const id = projectId || process.env.PROJECT;
  if (!id) {
    throw new Error("Missing project id (set PROJECT env var or pass --project <id>)");
  }
  const configPath = path.join(ROOT, "projects", id, "config.json");
  if (!fs.existsSync(configPath)) {
    throw new Error(`Project config not found: ${configPath}`);
  }
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  config._root = ROOT;
  config._projectDir = path.join(ROOT, "projects", id);
  config._runsDir = path.join(ROOT, "runs", id);
  config._brandCharterPath = path.join(config._projectDir, "brand-charter.md");
  if (!fs.existsSync(config._runsDir)) {
    fs.mkdirSync(config._runsDir, { recursive: true });
  }
  return config;
}

export function loadBrandCharter(config) {
  if (!fs.existsSync(config._brandCharterPath)) return "";
  return fs.readFileSync(config._brandCharterPath, "utf8");
}

export function getEnvCredential(envName) {
  const value = process.env[envName];
  if (!value) {
    throw new Error(`Missing env variable: ${envName}`);
  }
  return value;
}

export function runDir(config, runType) {
  const date = new Date().toISOString().slice(0, 10);
  const dir = path.join(config._runsDir, runType, date);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function parseArgs(argv) {
  const out = { project: null, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--project" || a === "-p") out.project = argv[++i];
    else if (a === "--dry-run" || a === "-n") out.dryRun = true;
    else if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        out[key] = next;
        i++;
      } else {
        out[key] = true;
      }
    }
  }
  return out;
}
