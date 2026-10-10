import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const IS_WINDOWS = process.platform === 'win32';

export interface ProcInfo {
  pid: number;
  ppid: number;
  name: string;
  commandLine: string;
  cpuPercent: number;
}

export interface AgentMatch {
  proc: ProcInfo;
  pattern: string;
}

interface CimProcess {
  ProcessId?: number;
  ParentProcessId?: number;
  Name?: string | null;
  CommandLine?: string | null;
  KernelModeTime?: number | string | null;
  UserModeTime?: number | string | null;
}

let lastWindowsSample: { at: number; cpuMs: Map<number, number> } | null = null;

async function listWindowsProcesses(): Promise<ProcInfo[]> {
  const script =
    'Get-CimInstance Win32_Process | ' +
    'Select-Object ProcessId,ParentProcessId,Name,CommandLine,KernelModeTime,UserModeTime | ' +
    'ConvertTo-Json -Compress -Depth 3';

  const { stdout } = await execFileAsync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', script],
    { maxBuffer: 32 * 1024 * 1024, windowsHide: true },
  );

  const text = stdout.trim();
  if (!text) {
    return [];
  }

  const parsed: unknown = JSON.parse(text);
  const rows: CimProcess[] = Array.isArray(parsed) ? (parsed as CimProcess[]) : [parsed as CimProcess];

  const now = Date.now();
  const previous = lastWindowsSample;
  const currentCpuMs = new Map<number, number>();
  const result: ProcInfo[] = [];

  for (const row of rows) {
    const pid = Number(row.ProcessId);
    if (!Number.isFinite(pid)) {
      continue;
    }

    // KernelModeTime + UserModeTime are reported in 100-nanosecond units.
    const cpuMs =
      (Number(row.KernelModeTime ?? 0) + Number(row.UserModeTime ?? 0)) / 10_000;
    currentCpuMs.set(pid, cpuMs);

    let cpuPercent = 0;
    if (previous) {
      const before = previous.cpuMs.get(pid);
      const elapsedMs = now - previous.at;
      if (before !== undefined && elapsedMs > 0) {
        cpuPercent = Math.max(0, ((cpuMs - before) / elapsedMs) * 100);
      }
    }

    result.push({
      pid,
      ppid: Number(row.ParentProcessId ?? 0),
      name: String(row.Name ?? ''),
      commandLine: String(row.CommandLine ?? ''),
      cpuPercent,
    });
  }

  lastWindowsSample = { at: now, cpuMs: currentCpuMs };
  return result;
}

const PS_ROW = /^\s*(\d+)\s+(\d+)\s+([\d.]+)\s+(\S+)\s+(.*)$/;

async function listUnixProcesses(): Promise<ProcInfo[]> {
  const { stdout } = await execFileAsync('ps', ['-eo', 'pid=,ppid=,pcpu=,comm=,args='], {
    maxBuffer: 32 * 1024 * 1024,
  });

  const result: ProcInfo[] = [];
  for (const line of stdout.split('\n')) {
    const match = PS_ROW.exec(line);
    if (!match) {
      continue;
    }

    result.push({
      pid: Number(match[1]),
      ppid: Number(match[2]),
      name: match[4] ?? '',
      commandLine: match[5] ?? '',
      cpuPercent: Number(match[3] ?? 0),
    });
  }

  return result;
}

export async function listProcesses(): Promise<ProcInfo[]> {
  return IS_WINDOWS ? listWindowsProcesses() : listUnixProcesses();
}

export function descendantPids(procs: ProcInfo[], rootPid: number): Set<number> {
  const childrenByParent = new Map<number, number[]>();
  for (const proc of procs) {
    const siblings = childrenByParent.get(proc.ppid);
    if (siblings) {
      siblings.push(proc.pid);
    } else {
      childrenByParent.set(proc.ppid, [proc.pid]);
    }
  }

  const seen = new Set<number>([rootPid]);
  const queue: number[] = [rootPid];
  while (queue.length > 0) {
    const current = queue.pop() as number;
    for (const child of childrenByParent.get(current) ?? []) {
      if (!seen.has(child)) {
        seen.add(child);
        queue.push(child);
      }
    }
  }

  return seen;
}

export function findAgents(procs: ProcInfo[], patterns: string[]): AgentMatch[] {
  const needles = patterns.map((p) => p.trim().toLowerCase()).filter((p) => p.length > 0);
  if (needles.length === 0) {
    return [];
  }

  const matches: AgentMatch[] = [];
  for (const proc of procs) {
    const haystack = `${proc.name} ${proc.commandLine}`.toLowerCase();
    const pattern = needles.find((needle) => haystack.includes(needle));
    if (pattern) {
      matches.push({ proc, pattern });
    }
  }

  return matches;
}
