import os from "node:os";
import process from "node:process";
import pty from "node-pty";

const args = process.argv.slice(2);
const command = args.shift() ?? "codex";
const allowed = new Set(["codex", "claude", "gemini", "aider", "opencode", "crush", "qwen"]);
if (!allowed.has(command)) {
  console.error(`Unsupported agent "${command}". Use: ${[...allowed].join(", ")}`);
  process.exit(2);
}

const apiUrl = process.env.KICKBACKS_API_URL ?? "http://localhost:8787";
const wallet = process.env.KICKBACKS_WALLET;
const intervalMs = 30_000;
const width = process.stdout.columns || 100;
const adLines = [
  "  SPONSORED · KICKBACKS   Earn testnet MON while your agent works   0.05 MON/ad  ",
  "  MONAD TESTNET · Thinking time pays   Claim rewards on-chain   kickbacks.ai  ",
  "  BUILD ON MONAD · Sponsored slot   No prompts read   Testnet only             ",
];
let adIndex = 0;
let lastHeartbeat = 0;
let stopped = false;
let childExited = false;

function drawAd(): void {
  if (stopped) return;
  const text = (adLines[adIndex++ % adLines.length] ?? "").slice(0, Math.max(1, width - 1));
  // Save cursor, move to bottom row, paint banner, restore cursor. Agent output remains untouched.
  process.stdout.write(`\x1b7\x1b[${process.stdout.rows || 24};1H\x1b[2K\x1b[48;5;22m\x1b[38;5;255m${text.padEnd(Math.max(1, width - 1))}\x1b[0m\x1b8`);
}

async function heartbeat(): Promise<void> {
  if (!wallet || Date.now() - lastHeartbeat < intervalMs) return;
  lastHeartbeat = Date.now();
  try {
    await fetch(`${apiUrl}/view`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ wallet }),
    });
  } catch {
    // CLI remains usable if backend is offline; payout still requires backend claim.
  }
}

const shell = process.platform === "win32" ? "powershell.exe" : process.env.SHELL || "sh";
const shellArgs = process.platform === "win32" ? ["-NoLogo", "-NoProfile", "-Command", command, ...args] : [command, ...args];
const child = pty.spawn(shell, shellArgs, {
  name: "xterm-256color",
  cols: process.stdout.columns || 120,
  rows: process.stdout.rows || 30,
  cwd: process.cwd(),
  env: { ...process.env, TERM: "xterm-256color" } as Record<string, string>,
});

type WindowsPtyInternals = {
  _agent?: {
    inSocket?: NodeJS.EventEmitter;
  };
};
const inputSocket = (child as unknown as WindowsPtyInternals)._agent?.inSocket;
if (inputSocket) {
  inputSocket.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code !== "ERR_SOCKET_CLOSED") {
      console.error("PTY input socket error:", error);
    }
  });
}

process.stdin.setRawMode?.(true);
process.stdin.resume();
const forwardInput = (data: Buffer): void => {
  if (stopped || childExited) return;
  try {
    child.write(data.toString());
  } catch {
    // The child can exit between the guard and write on Windows.
  }
};
process.stdin.on("data", forwardInput);
child.onData((data) => {
  if (stopped) return;
  process.stdout.write(data);
  void heartbeat();
});
child.onExit(({ exitCode }) => {
  if (childExited) return;
  childExited = true;
  stopped = true;
  process.stdin.removeListener("data", forwardInput);
  process.stdin.pause();
  process.stdin.setRawMode?.(false);
  process.stdout.write("\x1b[0m\x1b[?25h\n");
  process.exit(exitCode);
});
process.stdout.on("resize", () => {
  if (stopped || childExited) return;
  child.resize(process.stdout.columns || 120, process.stdout.rows || 30);
  drawAd();
});
drawAd();
const timer = setInterval(() => {
  drawAd();
  void heartbeat();
}, intervalMs);
process.on("exit", () => clearInterval(timer));
