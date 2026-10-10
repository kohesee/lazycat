import * as vscode from 'vscode';
import type { SignalTracker, Signals } from './focus';

function makeNonce(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  for (let i = 0; i < 32; i += 1) {
    nonce += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  }
  return nonce;
}

export class AdPanelProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  static readonly viewId = 'monadwatch.signals';
  static readonly panelViewId = 'kickbacks.agentRewards';

  private readonly views = new Set<vscode.WebviewView>();
  private readonly subscription: vscode.Disposable;
  private readonly viewDisposables = new Map<vscode.WebviewView, vscode.Disposable[]>();

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly tracker: SignalTracker,
  ) {
    this.subscription = tracker.onDidChangeSignals((signals) => this.post(signals));
  }

  dispose(): void {
    this.subscription.dispose();
    for (const view of this.views) {
      this.disposeView(view);
    }
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this.views.add(webviewView);
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };
    webviewView.webview.html = this.renderHtml(webviewView.webview, makeNonce());

    const disposables = [
      webviewView.onDidChangeVisibility(() => {
        this.tracker.setAdPanelVisible([...this.views].some((view) => view.visible));
      }),
      webviewView.onDidDispose(() => {
        this.disposeView(webviewView);
        this.tracker.setAdPanelVisible([...this.views].some((view) => view.visible));
      }),
      webviewView.webview.onDidReceiveMessage((message: { type?: string }) => {
        if (message.type === 'ready') {
          this.post(this.tracker.getState());
        }
      }),
    ];
    this.viewDisposables.set(webviewView, disposables);

    this.tracker.setAdPanelVisible([...this.views].some((view) => view.visible));
  }

  private disposeView(view: vscode.WebviewView): void {
    for (const disposable of this.viewDisposables.get(view) ?? []) {
      disposable.dispose();
    }
    this.viewDisposables.delete(view);
    this.views.delete(view);
  }

  private post(signals: Signals): void {
    for (const view of this.views) {
      void view.webview.postMessage({ type: 'signals', payload: signals });
    }
  }

  private renderHtml(webview: vscode.Webview, nonce: string): string {
    const cspSource = webview.cspSource;

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>MonadWatch</title>
<style>
  body {
    margin: 0;
    padding: 10px;
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    color: var(--vscode-foreground);
    background: var(--vscode-sideBar-background);
  }
  .tag {
    font-size: 9px;
    letter-spacing: 0.08em;
    opacity: 0.6;
    margin-bottom: 6px;
  }
  .ad {
    border: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.35));
    border-radius: 6px;
    padding: 10px;
    margin-bottom: 10px;
    transition: opacity 200ms linear;
  }
  .ad.dim { opacity: 0.45; }
  .headline { font-weight: 600; margin-bottom: 4px; }
  .body { opacity: 0.85; margin-bottom: 6px; }
  .cta { font-size: 11px; opacity: 0.7; }
  .meter { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
  .ring {
    min-width: 52px;
    text-align: center;
    padding: 6px 8px;
    border-radius: 999px;
    border: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.35));
    font-variant-numeric: tabular-nums;
    font-weight: 600;
  }
  .meta { font-size: 11px; opacity: 0.75; }
  .status { font-size: 11px; opacity: 0.75; }
  .status.live { color: var(--vscode-testing-iconPassed, #3fb950); opacity: 1; }
</style>
</head>
<body>
  <div class="tag">SPONSORED · MONAD TESTNET DEMO</div>
  <div class="ad" id="ad">
    <div class="headline" id="ad-headline">Monad Blitz</div>
    <div class="body" id="ad-body">Ship your first contract on Monad testnet.</div>
    <div class="cta" id="ad-cta">0.05 MON per ad · 1 MON daily cap</div>
  </div>
  <div class="meter">
    <div class="ring" id="ring">0s</div>
    <div class="meta">
      <div class="status" id="status">waiting for agent...</div>
      <div>Sponsored slot · testnet MON</div>
    </div>
  </div>
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();

  const ADS = [
    {
      headline: 'Monad Blitz',
      body: 'Ship your first contract on Monad testnet.',
      cta: '0.05 MON per ad · 1 MON daily cap',
    },
    {
      headline: 'Testnet MON, zero risk',
      body: 'Earn while your coding agent thinks. Claim on-chain.',
      cta: 'Sponsored slot 2 of 3',
    },
    {
      headline: 'Thinking time pays',
      body: 'Attention verified by focus and process signal.',
      cta: 'Sponsored slot 3 of 3',
    },
  ];

  const adEl = document.getElementById('ad');
  const headlineEl = document.getElementById('ad-headline');
  const bodyEl = document.getElementById('ad-body');
  const ctaEl = document.getElementById('ad-cta');
  const ringEl = document.getElementById('ring');
  const statusEl = document.getElementById('status');

  let adIndex = 0;
  function renderAd() {
    const ad = ADS[adIndex % ADS.length];
    headlineEl.textContent = ad.headline;
    bodyEl.textContent = ad.body;
    ctaEl.textContent = ad.cta;
  }
  renderAd();
  setInterval(() => {
    adIndex += 1;
    renderAd();
  }, 30000);

  function render(s) {
    ringEl.textContent = s.streakSeconds + 's';
    adEl.classList.toggle('dim', !s.earning);
    statusEl.textContent = s.earning
      ? 'Live · earning while ' + (s.agentName ?? 'agent') + ' runs'
      : s.agentDetected
        ? 'Agent detected · waiting for focus'
        : 'Waiting for Claude Code or Codex';
    statusEl.classList.toggle('live', s.earning);
  }

  window.addEventListener('message', (event) => {
    const message = event.data;
    if (message && message.type === 'signals') {
      render(message.payload);
    }
  });

  vscode.postMessage({ type: 'ready' });
</script>
</body>
</html>`;
  }
}
