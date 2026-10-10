// Standalone probe for the Windows/Linux process-walk path in src/procs.ts.
// Bundled separately from the extension so it can run under plain node.
import { descendantPids, findAgents, listProcesses } from './dist/procs.probe.mjs';

const PATTERNS = ['claude', 'codex', 'gemini', 'aider', 'opencode', 'crush', 'qwen'];

const first = await listProcesses();
console.log('sample 1: ' + first.length + ' processes');

await new Promise((resolve) => setTimeout(resolve, 2000));

const second = await listProcesses();
console.log('sample 2: ' + second.length + ' processes');

const byCpu = [...second].sort((a, b) => b.cpuPercent - a.cpuPercent);
console.log('\ntop cpu after delta:');
for (const proc of byCpu.slice(0, 8)) {
  console.log(
    '  ' +
      String(proc.pid).padStart(7) +
      '  ppid=' +
      String(proc.ppid).padStart(7) +
      '  ' +
      proc.cpuPercent.toFixed(1).padStart(5) +
      '%  ' +
      proc.name +
      '  ' +
      proc.commandLine.slice(0, 60),
  );
}

const agents = findAgents(second, PATTERNS);
console.log('\nagent matches: ' + agents.length);
for (const match of agents.slice(0, 8)) {
  console.log(
    '  pattern=' + match.pattern + ' pid=' + match.proc.pid + ' cpu=' + match.proc.cpuPercent.toFixed(1) + '%',
  );
}

// Self-test: the probe's own process tree must be walkable, proving the parent map works.
const selfTree = descendantPids(second, process.pid);
console.log('\nself tree size (should be >= 1): ' + selfTree.size);
console.log('self pid in tree: ' + selfTree.has(process.pid));

const selfMatches = findAgents(second, ['node']);
console.log('node processes visible: ' + selfMatches.length);
