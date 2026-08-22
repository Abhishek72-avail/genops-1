const { spawn, execSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

console.log("\x1b[35m%s\x1b[0m", "==================================================");
console.log("\x1b[36m%s\x1b[0m", "   ⚡ GENERATOR DASHBOARD SYSTEM LAUNCHER ⚡");
console.log("\x1b[35m%s\x1b[0m", "==================================================");

// 1. Load .env file
const envPath = path.resolve(__dirname, ".env");
if (fs.existsSync(envPath)) {
  console.log("\x1b[32m%s\x1b[0m", "ℹ Loading environment variables from .env...");
  const envContent = fs.readFileSync(envPath, "utf8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const equalIndex = trimmed.indexOf("=");
      if (equalIndex > 0) {
        const key = trimmed.slice(0, equalIndex).trim();
        let value = trimmed.slice(equalIndex + 1).trim();
        // Remove quotes if present
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    }
  }
} else {
  console.log("\x1b[33m%s\x1b[0m", "⚠ .env file not found, using existing environment variables.");
}

// Ensure defaults
process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://gmsuser:gmspassword@localhost:5432/generatordb";
process.env.PORT = "5000"; // Backend always runs on 5000
process.env.FRONTEND_PORT = "3000"; // Frontend always runs on 3000
process.env.SESSION_SECRET = process.env.SESSION_SECRET || "super-secret-change-in-production";

// 2. Start PostgreSQL via Docker Compose
console.log("\x1b[33m%s\x1b[0m", "\n🐳 Starting Database container (Docker)...");
try {
  execSync("docker compose up -d db", { stdio: "inherit", cwd: __dirname });
  console.log("\x1b[32m%s\x1b[0m", "✔ Database container is up and running!");
} catch (error) {
  console.log("\x1b[31m%s\x1b[0m", "⚠ Could not run docker compose. Make sure Docker Desktop is open and running.");
  console.log("\x1b[33m%s\x1b[0m", "ℹ Will proceed in case you have a local PostgreSQL database running on port 5432...");
}

// 3. Push Database Schema
console.log("\x1b[33m%s\x1b[0m", "\n⚙ Syncing Database Schema...");
try {
  execSync("pnpm --filter @workspace/db run push", { stdio: "inherit", cwd: __dirname });
  console.log("\x1b[32m%s\x1b[0m", "✔ Database schema is synced!");
} catch (error) {
  console.log("\x1b[31m%s\x1b[0m", "⚠ Warning: Database schema sync failed. (Database might still be starting up, will continue)");
}

// 4. Run Backend and Frontend Concurrently
console.log("\x1b[36m%s\x1b[0m", "\n🚀 Starting Frontend and Backend servers...");

const children = [];

function startProcess(name, command, args, color) {
  console.log(`${color}[Launcher] Starting ${name}... [${command} ${args.join(" ")}]\x1b[0m`);
  
  const child = spawn(command, args, {
    cwd: __dirname,
    shell: true,
    env: process.env
  });
  
  child.stdout.on("data", (data) => {
    const lines = data.toString().trim().split("\n");
    for (const line of lines) {
      if (line.trim()) {
        console.log(`${color}[${name}]\x1b[0m ${line}`);
      }
    }
  });

  child.stderr.on("data", (data) => {
    const lines = data.toString().trim().split("\n");
    for (const line of lines) {
      if (line.trim()) {
        console.error(`${color}[${name}-Err]\x1b[0m \x1b[31m${line}\x1b[0m`);
      }
    }
  });

  child.on("close", (code) => {
    console.log(`${color}[${name}]\x1b[0m process exited with code ${code}`);
    cleanup();
  });

  children.push(child);
  return child;
}

// Start Backend (Green)
startProcess("Backend", "pnpm", ["--filter", "@workspace/api-server", "run", "dev"], "\x1b[32m");

// Start Frontend (Cyan)
startProcess("Frontend", "pnpm", ["--filter", "@workspace/generator-mgmt", "run", "dev"], "\x1b[36m");

let isCleaningUp = false;
function cleanup() {
  if (isCleaningUp) return;
  isCleaningUp = true;
  console.log("\x1b[33m%s\x1b[0m", "\nStopping all active processes...");
  for (const child of children) {
    try {
      if (child.pid) {
        process.kill(-child.pid, "SIGTERM");
      }
    } catch {
      try {
        child.kill("SIGTERM");
      } catch {}
    }
  }
  setTimeout(() => process.exit(0), 1000);
}

process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);
process.on("exit", cleanup);
