const { spawn } = require("node:child_process");
const net = require("node:net");

const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
const tasks = [
  { name: "fdc", args: ["run", "start:fdc"], port: 3001 },
  { name: "plasma", args: ["run", "start:plasma"], port: 3002 },
  { name: "facts", args: ["run", "start:facts"], port: 3003 },
  { name: "ui", args: ["run", "start:ui"], port: 5173 }
];

const children = [];

function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port);
  });
}

async function assertPortsFree() {
  const conflicts = [];
  for (const task of tasks) {
    const free = await isPortAvailable(task.port);
    if (!free) {
      conflicts.push(task);
    }
  }

  if (conflicts.length > 0) {
    process.stderr.write("[stack] port conflict detected:\n");
    for (const conflict of conflicts) {
      process.stderr.write(`- ${conflict.name} requires port ${conflict.port}\n`);
    }
    process.stderr.write("[stack] stop existing processes, then rerun npm run start:stack\n");
    process.exit(1);
  }
}

function startTasks() {
  for (const task of tasks) {
    const command = `${npmCmd} ${task.args.join(" ")}`;
    process.stdout.write(`[stack] starting ${task.name}: ${command}\n`);
    const child = spawn(command, {
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
      shell: true
    });

    child.stdout.on("data", (chunk) => {
      process.stdout.write(`[${task.name}] ${chunk}`);
    });
    child.stderr.on("data", (chunk) => {
      process.stderr.write(`[${task.name}] ${chunk}`);
    });

    child.on("exit", (code) => {
      if (code && code !== 0) {
        process.stderr.write(`[${task.name}] exited with code ${code}\n`);
      }
    });

    child.on("error", (error) => {
      process.stderr.write(`[${task.name}] spawn error: ${error.message}\n`);
    });

    children.push(child);
  }
}

function shutdown(signal) {
  for (const child of children) {
    if (!child.killed) {
      child.kill(signal);
    }
  }
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

void (async () => {
  await assertPortsFree();
  startTasks();
})();
