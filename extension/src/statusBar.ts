import * as vscode from 'vscode';
import type { SignalTracker, Signals } from './focus';

export class StatusBar implements vscode.Disposable {
  private readonly item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  private readonly subscription: vscode.Disposable;

  constructor(tracker: SignalTracker) {
    this.item.name = 'MonadWatch';
    this.item.command = 'monadwatch.showSignals';
    this.subscription = tracker.onDidChangeSignals((signals) => this.render(signals));
    this.render(tracker.getState());
    this.item.show();
  }

  dispose(): void {
    this.subscription.dispose();
    this.item.dispose();
  }

  private render(signals: Signals): void {
    const focus = signals.windowFocused ? '1' : '0';
    const agent = signals.agentName ?? 'none';
    const cpu = signals.agentCpuPercent.toFixed(0);
    const dwell = signals.streakSeconds;

    this.item.text = `$(megaphone) F:${focus} ${agent} ${cpu}% ${dwell}s`;
    this.item.tooltip = this.buildTooltip(signals);
  }

  private buildTooltip(signals: Signals): vscode.MarkdownString {
    const tooltip = new vscode.MarkdownString();
    tooltip.appendMarkdown('**MonadWatch signal probe**\n\n');
    tooltip.appendMarkdown(`- window focused: \`${signals.windowFocused}\`\n`);
    tooltip.appendMarkdown(
      `- active terminal: \`${signals.activeTerminalName ?? 'none'}\` (pid ${signals.activeTerminalPid ?? 'n/a'})\n`,
    );
    tooltip.appendMarkdown(
      `- agent: \`${signals.agentName ?? 'none'}\` (pid ${signals.agentPid ?? 'n/a'}, cpu ${signals.agentCpuPercent}%)\n`,
    );
    tooltip.appendMarkdown(`- agent in active terminal: \`${signals.agentInActiveTerminal}\`\n`);
    tooltip.appendMarkdown(`- ad panel visible: \`${signals.adPanelVisible}\`\n`);
    tooltip.appendMarkdown(`- earning: \`${signals.earning}\`\n`);
    tooltip.appendMarkdown(
      `- streak: \`${signals.streakSeconds}s\` · credited: \`${signals.creditedSeconds}s\`\n`,
    );
    if (signals.lastError) {
      tooltip.appendMarkdown(`\n**last error:** \`${signals.lastError}\``);
    }
    return tooltip;
  }
}
