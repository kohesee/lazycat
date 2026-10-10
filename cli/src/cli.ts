import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import process from "node:process";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import path from "node:path";
import pty from "node-pty";

const agents = ["codex", "claude", "gemini", "aider", "opencode", "crush", "qwen"] as const;
type Agent = (typeof agents)[number];
type Config = { wallet?: string; apiUrl?: string; webUrl?: string; enabled?: boolean };

const configDir = process.platform === "win32"
  ? path.join(process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming"), "lazycat")
  : path.join(os.homedir(), ".config", "lazycat");
const configPath = path.join(configDir, "config.json");
const profilePath = process.platform === "win32"
  ? path.join(os.homedir(), "Documents", "WindowsPowerShell", "Microsoft.PowerShell_profile.ps1")
  : path.join(os.homedir(), ".profile");
const profileStart = "# >>> lazycat auto-wrapper >>>";
const profileEnd = "# <<< lazycat auto-wrapper <<<";

function readConfig(): Config {
  if (!existsSync(configPath)) return {};
  try {
    return JSON.parse(readFileSync(configPath, "utf8")) as Config;
  } catch {
    console.error(`Invalid config: ${configPath}`);
    process.exit(1);
  }
}

function writeConfig(config: Config): void {
  mkdirSync(configDir, { recursive: true });
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

function agentName(value: string | undefined): Agent | undefined {
  return agents.includes(value as Agent) ? value as Agent : undefined;
}

function terminalWidth(): number {
  return process.stdout.columns || 100;
}

function terminalRows(): number {
  return process.stdout.rows || 24;
}

const adLines = [
  "  ◈ CURSOR  /  THE AI CODE EDITOR   Turn ideas into working software faster     ",
  "  ◇ SENTRY  /  SHIP WITH CONFIDENCE Catch issues before users do                 ",
  "  ✦ SUPABASE  /  YOUR BACKEND      Postgres, auth, storage, ready to build       ",
  "  ◎ VERCEL  /  SHIP IT             Deploy frontend changes at the speed of git   ",
  "  ▣ RAYCAST  /  COMMAND YOUR TOOLS Your shortcuts, workflows, and dev life       ",
];

function formatMon(wei: string | number | undefined): string {
  try {
    const value = BigInt(wei ?? 0);
    const whole = value / 1_000_000_000_000_000_000n;
    const fraction = (value % 1_000_000_000_000_000_000n).toString().padStart(18, "0").slice(0, 2);
    return `${whole}.${fraction}`;
  } catch {
    return "0.00";
  }
}

async function runAgent(agent: Agent, args: string[]): Promise<never> {
  const config = readConfig();
  const apiUrl = process.env.LAZY_CAT_API_URL ?? config.apiUrl ?? "http://localhost:8787";
  const wallet = process.env.LAZY_CAT_WALLET ?? config.wallet;
  const webUrl = process.env.LAZY_CAT_WEB_URL ?? config.webUrl ?? "http://localhost:5173/#pit-stop";
  const intervalMs = 30_000;
  let adIndex = 0;
  let lastHeartbeat = 0;
  let lastStatusRefresh = 0;
  let stopped = false;
  let childExited = false;
  let apiState = wallet ? "checking API" : "set wallet with lazycat wallet";
  let views = 0;
  let earned = "0.00";
  let pending = "0.00";

  function drawAd(): void {
    if (stopped) return;
    const width = terminalWidth();
    const text = (adLines[adIndex++ % adLines.length] ?? "").slice(0, Math.max(1, width - 1));
    const rows = terminalRows();
    const status = `  LAZYCAT  ·  ${apiState}  ·  ${earned} MON earned  ·  ${pending} claimable  ·  ${views} ads  ·  claim: ${webUrl}`;
    process.stdout.write(
      `\x1b7\x1b[${Math.max(1, rows - 1)};1H\x1b[2K\x1b[48;5;236m\x1b[38;5;255m${status.slice(0, Math.max(1, width - 1)).padEnd(Math.max(1, width - 1))}\x1b[0m` +
      `\x1b[${rows};1H\x1b[2K\x1b[48;5;22m\x1b[38;5;255m${text.padEnd(Math.max(1, width - 1))}\x1b[0m\x1b8`,
    );
  }

  async function refreshStatus(): Promise<void> {
    if (Date.now() - lastStatusRefresh < intervalMs) return;
    lastStatusRefresh = Date.now();
    if (!wallet) {
      apiState = "wallet not configured";
      return;
    }
    try {
      const response = await fetch(`${apiUrl}/status?wallet=${encodeURIComponent(wallet)}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const status = await response.json() as { earnedToday?: string; pending?: string; views?: number };
      earned = formatMon(status.earnedToday);
      pending = formatMon(status.pending);
      views = status.views ?? 0;
      apiState = "earning API online";
    } catch {
      apiState = "API offline · ads visual only";
    }
    drawAd();
  }

  async function heartbeat(): Promise<void> {
    if (!wallet || Date.now() - lastHeartbeat < intervalMs) return;
    lastHeartbeat = Date.now();
    try {
      const response = await fetch(`${apiUrl}/view`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ wallet }),
      });
      if (response.ok) apiState = "earning API online";
      else if (response.status === 429) apiState = "cooldown/cap applied";
      else apiState = `API rejected · HTTP ${response.status}`;
    } catch {
      apiState = "API offline · ads visual only";
    }
    await refreshStatus();
  }

  const shell = process.platform === "win32" ? "powershell.exe" : process.env.SHELL || "sh";
  const shellArgs = process.platform === "win32"
    ? ["-NoLogo", "-NoProfile", "-Command", agent, ...args]
    : [agent, ...args];
  const child = pty.spawn(shell, shellArgs, {
    name: "xterm-256color",
    cols: terminalWidth(),
    rows: Math.max(2, terminalRows() - 1),
    cwd: process.cwd(),
    env: { ...process.env, TERM: "xterm-256color" } as Record<string, string>,
  });

  const inputSocket = (child as unknown as { _agent?: { inSocket?: NodeJS.EventEmitter } })._agent?.inSocket;
  inputSocket?.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code !== "ERR_SOCKET_CLOSED") console.error("PTY input socket error:", error);
  });

  process.stdin.setRawMode?.(true);
  process.stdin.resume();
  const forwardInput = (data: Buffer): void => {
    if (stopped || childExited) return;
    try {
      child.write(data.toString());
    } catch {
      // Child can exit between the guard and write on Windows.
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
    child.resize(terminalWidth(), Math.max(2, terminalRows() - 1));
    drawAd();
    void refreshStatus();
  });
  drawAd();
  const timer = setInterval(() => {
    drawAd();
    void heartbeat();
  }, intervalMs);
  process.on("exit", () => clearInterval(timer));
  return new Promise(() => undefined) as Promise<never>;
}

function profileWithWrapper(content: string): string {
  const start = content.indexOf(profileStart);
  const end = content.indexOf(profileEnd);
  const launcher = process.argv[1]
    ? `& '${process.execPath.replaceAll("'", "''")}' '${path.resolve(process.argv[1]).replaceAll("'", "''")}'`
    : "& lazycat";
  const block = `${profileStart}
function codex { ${launcher} run codex @args }
function claude { ${launcher} run claude @args }
${profileEnd}`;
  if (start >= 0 && end >= start) {
    return `${content.slice(0, start)}${block}${content.slice(end + profileEnd.length)}`;
  }
  return `${content.trimEnd()}\n\n${block}\n`;
}

function removeProfileWrapper(content: string): string {
  const start = content.indexOf(profileStart);
  const end = content.indexOf(profileEnd);
  if (start < 0 || end < start) return content;
  return `${content.slice(0, start)}${content.slice(end + profileEnd.length)}`.replace(/\n{3,}/g, "\n\n");
}

async function setup(): Promise<void> {
  const existing = readConfig();
  const yes = process.argv.includes("--yes");
  if (!yes && process.stdin.isTTY) {
    const rl = readline.createInterface({ input, output });
    const answer = await rl.question("LazyCat will show sponsor ads and send periodic reward heartbeats. No prompts are read. Continue? [Y/n] ");
    rl.close();
    if (answer.trim().toLowerCase() === "n") {
      console.log("Setup cancelled.");
      return;
    }
  }
  mkdirSync(path.dirname(profilePath), { recursive: true });
  const content = existsSync(profilePath) ? readFileSync(profilePath, "utf8") : "";
  writeFileSync(profilePath, profileWithWrapper(content), "utf8");
  writeConfig({ ...existing, enabled: true });
  console.log(`LazyCat enabled for codex and claude.`);
  console.log(`Profile: ${profilePath}`);
  console.log("Open a new PowerShell window, or run: . $PROFILE");
}

function toggle(enabled: boolean): void {
  const content = existsSync(profilePath) ? readFileSync(profilePath, "utf8") : "";
  writeFileSync(profilePath, enabled ? profileWithWrapper(content) : removeProfileWrapper(content), "utf8");
  writeConfig({ ...readConfig(), enabled });
  console.log(enabled ? "LazyCat enabled." : "LazyCat disabled.");
}

function doctor(): void {
  const config = readConfig();
  console.log(`Config: ${configPath} ${existsSync(configPath) ? "OK" : "not configured"}`);
  console.log(`Wallet: ${config.wallet ? "configured" : "missing (run lazycat wallet <address>)"}`);
  console.log(`Backend: ${config.apiUrl ?? "http://localhost:8787"}`);
  for (const agent of ["codex", "claude"] as const) {
    try {
      execFileSync(agent, ["--version"], { stdio: "pipe", windowsHide: true });
      console.log(`${agent}: installed`);
    } catch {
      console.log(`${agent}: not found`);
    }
  }
  console.log(`PowerShell profile: ${existsSync(profilePath) ? profilePath : "missing (run lazycat setup)"}`);
}

function openClaimPage(): void {
  const url = readConfig().webUrl ?? "http://localhost:5173/#pit-stop";
  if (process.platform === "win32") execFileSync("cmd.exe", ["/c", "start", "", url], { stdio: "ignore" });
  else execFileSync("open", [url], { stdio: "ignore" });
  console.log(`Opened claim page: ${url}`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const action = args.shift();
  if (action === "setup") return setup();
  if (action === "enable") return toggle(true);
  if (action === "disable") return toggle(false);
  if (action === "doctor") return doctor();
  if (action === "wallet") {
    const wallet = args.shift();
    if (!wallet || !/^0x[a-fA-F0-9]{40}$/.test(wallet)) throw new Error("Usage: lazycat wallet 0xYourWallet");
    writeConfig({ ...readConfig(), wallet });
    console.log("Wallet saved locally. No private key was stored.");
    return;
  }
  if (action === "api") {
    const apiUrl = args.shift();
    if (!apiUrl || !/^https?:\/\//.test(apiUrl)) throw new Error("Usage: lazycat api http://localhost:8787");
    writeConfig({ ...readConfig(), apiUrl });
    console.log(`API saved: ${apiUrl}`);
    return;
  }
  if (action === "web") {
    const webUrl = args.shift();
    if (!webUrl || !/^https?:\/\//.test(webUrl)) throw new Error("Usage: lazycat web http://localhost:5173");
    writeConfig({ ...readConfig(), webUrl });
    console.log(`Claim page saved: ${webUrl}`);
    return;
  }
  if (action === "claim") {
    openClaimPage();
    return;
  }
  if (action === "passthrough") {
    const agent = agentName(args.shift());
    if (!agent) throw new Error(`Usage: lazycat passthrough ${agents.join("|")}`);
    execFileSync(agent, args, { stdio: "inherit" });
    return;
  }
  if (action === "run") {
    const agent = agentName(args.shift());
    if (!agent) throw new Error(`Usage: lazycat run ${agents.join("|")}`);
    return runAgent(agent, args);
  }
  const agent = agentName(action) ?? agentName(process.argv[2]) ?? "codex";
  return runAgent(agent, action ? args : process.argv.slice(3));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
