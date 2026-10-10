import * as vscode from 'vscode';
import { AdPanelProvider } from './adPanel';
import { SignalTracker } from './focus';
import { StatusBar } from './statusBar';

let tracker: SignalTracker | undefined;

export function activate(context: vscode.ExtensionContext): void {
  tracker = new SignalTracker();

  const adPanel = new AdPanelProvider(context.extensionUri, tracker);
  const statusBar = new StatusBar(tracker);

  context.subscriptions.push(
    tracker,
    adPanel,
    statusBar,
    vscode.window.registerWebviewViewProvider(AdPanelProvider.viewId, adPanel, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.window.registerWebviewViewProvider(AdPanelProvider.panelViewId, adPanel, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.commands.registerCommand('monadwatch.showSignals', () => {
      const signals = tracker?.getState();
      void vscode.window.showInformationMessage(
        signals ? JSON.stringify(signals, null, 2) : 'tracker not started',
        { modal: true },
      );
    }),
    vscode.commands.registerCommand('monadwatch.probeProcesses', async () => {
      const processes = tracker?.getProcesses() ?? [];
      const lines = processes
        .filter((proc) => proc.cpuPercent > 0 || proc.name.length > 0)
        .sort((a, b) => b.cpuPercent - a.cpuPercent)
        .slice(0, 40)
        .map(
          (proc) =>
            `${proc.pid}\t${proc.ppid}\t${proc.cpuPercent.toFixed(1)}%\t${proc.name}\t${proc.commandLine.slice(0, 80)}`,
        );

      const document = await vscode.workspace.openTextDocument({
        content: lines.join('\n') || 'no processes sampled yet',
        language: 'log',
      });
      await vscode.window.showTextDocument(document, { preview: true });
    }),
  );

  tracker.start();
}

export function deactivate(): void {
  tracker = undefined;
}
