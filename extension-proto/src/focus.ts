import * as vscode from 'vscode';
import { descendantPids, findAgents, listProcesses, type ProcInfo } from './procs';

export interface Signals {
  windowFocused: boolean;
  activeTerminalName: string | null;
  activeTerminalPid: number | null;
  agentDetected: boolean;
  agentName: string | null;
  agentPid: number | null;
  agentInActiveTerminal: boolean;
  agentCpuPercent: number;
  agentThinking: boolean;
  adPanelVisible: boolean;
  earning: boolean;
  creditedSeconds: number;
  streakSeconds: number;
  pollSeconds: number;
  tickSeconds: number;
  cpuThreshold: number;
  requireCpu: boolean;
  lastError: string | null;
  updatedAt: number;
}

interface TrackerConfig {
  patterns: string[];
  cpuThinkingThreshold: number;
  requireCpuForThinking: boolean;
  requirePanelVisible: boolean;
  requireAgentInActiveTerminal: boolean;
  pollSeconds: number;
  dwellTickSeconds: number;
}

const DEFAULT_PATTERNS = ['claude', 'codex', 'gemini', 'aider', 'opencode', 'crush', 'qwen'];

function readConfig(): TrackerConfig {
  const config = vscode.workspace.getConfiguration('monadwatch');
  return {
    patterns: config.get<string[]>('agentPatterns', DEFAULT_PATTERNS),
    cpuThinkingThreshold: config.get<number>('cpuThinkingThreshold', 3),
    requireCpuForThinking: config.get<boolean>('requireCpuForThinking', false),
    requirePanelVisible: config.get<boolean>('requirePanelVisible', true),
    requireAgentInActiveTerminal: config.get<boolean>('requireAgentInActiveTerminal', false),
    pollSeconds: Math.max(1, config.get<number>('pollSeconds', 2)),
    dwellTickSeconds: Math.max(1, config.get<number>('dwellTickSeconds', 5)),
  };
}

async function resolveTerminalPid(terminal: vscode.Terminal | undefined): Promise<number | null> {
  if (!terminal) {
    return null;
  }
  try {
    const pid = await terminal.processId;
    return typeof pid === 'number' ? pid : null;
  } catch {
    return null;
  }
}

export class SignalTracker implements vscode.Disposable {
  private readonly emitter = new vscode.EventEmitter<Signals>();
  readonly onDidChangeSignals = this.emitter.event;

  private readonly disposables: vscode.Disposable[] = [];
  private config = readConfig();
  private pollTimer: NodeJS.Timeout | undefined;
  private tickTimer: NodeJS.Timeout | undefined;
  private panelVisible = false;
  private processes: ProcInfo[] = [];

  private readonly state: Signals = {
    windowFocused: vscode.window.state.focused,
    activeTerminalName: null,
    activeTerminalPid: null,
    agentDetected: false,
    agentName: null,
    agentPid: null,
    agentInActiveTerminal: false,
    agentCpuPercent: 0,
    agentThinking: false,
    adPanelVisible: false,
    earning: false,
    creditedSeconds: 0,
    streakSeconds: 0,
    pollSeconds: 2,
    tickSeconds: 5,
    cpuThreshold: 3,
    requireCpu: false,
    lastError: null,
    updatedAt: Date.now(),
  };

  start(): void {
    this.applyConfig();

    this.disposables.push(
      vscode.window.onDidChangeWindowState(() => {
        void this.poll();
      }),
      vscode.window.onDidChangeActiveTerminal(() => {
        void this.poll();
      }),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration('monadwatch')) {
          this.applyConfig();
          this.restartTimers();
        }
      }),
    );

    this.restartTimers();
    void this.poll();
  }

  getState(): Signals {
    return { ...this.state };
  }

  getProcesses(): ProcInfo[] {
    return this.processes;
  }

  setAdPanelVisible(visible: boolean): void {
    this.panelVisible = visible;
    this.state.adPanelVisible = visible;
    this.state.earning = this.refreshEarning();
    this.emitter.fire({ ...this.state });
  }

  dispose(): void {
    this.stopTimers();
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables.length = 0;
    this.emitter.dispose();
  }

  private applyConfig(): void {
    this.config = readConfig();
    this.state.pollSeconds = this.config.pollSeconds;
    this.state.tickSeconds = this.config.dwellTickSeconds;
    this.state.cpuThreshold = this.config.cpuThinkingThreshold;
    this.state.requireCpu = this.config.requireCpuForThinking;
  }

  private restartTimers(): void {
    this.stopTimers();
    this.pollTimer = setInterval(() => {
      void this.poll();
    }, this.config.pollSeconds * 1000);
    this.tickTimer = setInterval(() => {
      this.tick();
    }, this.config.dwellTickSeconds * 1000);
  }

  private stopTimers(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = undefined;
    }
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = undefined;
    }
  }

  private async poll(): Promise<void> {
    const state = this.state;

    try {
      const processes = await listProcesses();
      this.processes = processes;

      const terminal = vscode.window.activeTerminal;
      const terminalPid = await resolveTerminalPid(terminal);

      let agent: ProcInfo | null = null;
      let agentPattern: string | null = null;
      let inActiveTerminal = false;

      if (terminalPid !== null) {
        const tree = descendantPids(processes, terminalPid);
        const inTree = findAgents(processes, this.config.patterns).filter((match) =>
          tree.has(match.proc.pid),
        );
        if (inTree.length > 0) {
          agent = inTree[0]?.proc ?? null;
          agentPattern = inTree[0]?.pattern ?? null;
          inActiveTerminal = true;
        }
      }

      if (!agent && !this.config.requireAgentInActiveTerminal) {
        const anyAgent = findAgents(processes, this.config.patterns)[0];
        if (anyAgent) {
          agent = anyAgent.proc;
          agentPattern = anyAgent.pattern;
        }
      }

      state.activeTerminalName = terminal?.name ?? null;
      state.activeTerminalPid = terminalPid;
      state.agentDetected = agent !== null;
      state.agentName = agentPattern;
      state.agentPid = agent?.pid ?? null;
      state.agentInActiveTerminal = inActiveTerminal;
      state.agentCpuPercent = agent ? Number(agent.cpuPercent.toFixed(1)) : 0;
      state.agentThinking =
        agent !== null && agent.cpuPercent >= this.config.cpuThinkingThreshold;
      state.adPanelVisible = this.panelVisible;
      state.lastError = null;
    } catch (error) {
      state.lastError = error instanceof Error ? error.message : String(error);
    }

    state.earning = this.refreshEarning();
    if (!state.earning) {
      state.streakSeconds = 0;
    }
    state.updatedAt = Date.now();
    this.emitter.fire({ ...state });
  }

  private tick(): void {
    const state = this.state;
    state.earning = this.refreshEarning();

    if (state.earning) {
      state.streakSeconds += this.config.dwellTickSeconds;
      state.creditedSeconds += this.config.dwellTickSeconds;
    } else {
      state.streakSeconds = 0;
    }

    state.updatedAt = Date.now();
    this.emitter.fire({ ...state });
  }

  private refreshEarning(): boolean {
    const state = this.state;
    const config = this.config;

    state.windowFocused = vscode.window.state.focused;

    if (!state.windowFocused) {
      return false;
    }
    if (!state.agentDetected) {
      return false;
    }
    if (config.requirePanelVisible && !this.panelVisible) {
      return false;
    }
    if (config.requireAgentInActiveTerminal && !state.agentInActiveTerminal) {
      return false;
    }
    if (config.requireCpuForThinking && !state.agentThinking) {
      return false;
    }

    return true;
  }
}
