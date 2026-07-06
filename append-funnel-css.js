const fs = require('fs');
const path = require('path');

const css = `
/* ── AI Sourcing Funnel & Ambient Monitoring ─ */

@keyframes radar-pulse {
  0% { transform: scale(0.8); opacity: 0.5; }
  100% { transform: scale(2.5); opacity: 0; }
}

@keyframes scan-line {
  0% { top: 0%; opacity: 0; }
  10% { opacity: 1; }
  90% { opacity: 1; }
  100% { top: 100%; opacity: 0; }
}

@keyframes terminal-typing {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

.ambient-radar {
  position: relative;
  width: 60px;
  height: 60px;
  border-radius: 50%;
  background: rgba(42,74,79, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
}
.ambient-radar::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  border-radius: 50%;
  border: 1px solid var(--petrol);
  animation: radar-pulse 3s cubic-bezier(0.4, 0, 0.2, 1) infinite;
}
.ambient-radar::after {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  border-radius: 50%;
  border: 1px solid var(--petrol);
  animation: radar-pulse 3s cubic-bezier(0.4, 0, 0.2, 1) infinite;
  animation-delay: 1.5s;
}

.funnel-container {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  width: 100%;
  max-width: 400px;
  margin: 0 auto;
}

.funnel-stage {
  position: relative;
  background: var(--bg-2);
  border-radius: var(--radius-sm);
  padding: 0.75rem 1rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  overflow: hidden;
  transition: all 0.3s;
  border: 1px solid transparent;
}
.funnel-stage.active {
  background: var(--surface);
  border-color: var(--petrol);
  box-shadow: 0 0 12px rgba(42,74,79, 0.1);
}
.funnel-stage.completed {
  background: var(--surface-2);
  border-color: var(--border);
  opacity: 0.6;
}

.funnel-scan-line {
  position: absolute;
  left: 0; right: 0;
  height: 2px;
  background: var(--petrol);
  box-shadow: 0 0 8px var(--petrol);
  animation: scan-line 1.5s linear infinite;
  z-index: 10;
}

.terminal-log-container {
  background: var(--petrol-dark);
  border-radius: var(--radius-md);
  padding: 1rem 1rem 1rem 2.5rem;
  color: #a0aec0;
  font-family: monospace;
  font-size: 0.75rem;
  height: 140px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  box-shadow: inset 0 4px 12px rgba(0,0,0,0.4);
  margin-top: 1.5rem;
  position: relative;
  text-align: left;
}
.terminal-log-container::before {
  content: 'LIVE STREAM';
  position: absolute;
  top: 8px; right: 12px;
  font-size: 0.6rem;
  color: var(--petrol-light);
  letter-spacing: 0.1em;
}
.terminal-log-container::after {
  content: '>';
  position: absolute;
  bottom: 1rem; left: 1rem;
  color: var(--gold-light);
  font-weight: bold;
}
.terminal-log-line {
  margin: 3px 0;
  animation: terminal-typing 0.15s ease-out forwards;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.terminal-log-line.highlight {
  color: var(--gold-light);
}
.terminal-log-line.danger {
  color: #e57373;
}
.terminal-log-line.success {
  color: #81c784;
}
`;

const globalsPath = path.join(__dirname, 'src', 'app', 'globals.css');
let content = fs.readFileSync(globalsPath, 'utf8');

if (!content.includes('AI Sourcing Funnel & Ambient Monitoring')) {
  fs.writeFileSync(globalsPath, content + '\\n' + css, 'utf8');
  console.log('Appended successfully');
} else {
  console.log('Already exists');
}
