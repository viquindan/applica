const fs = require('fs');
const files = ['Step1Personal.tsx', 'Step2Profile.tsx', 'Step3Preferences.tsx'];

for(const file of files) {
  const p = 'src/app/onboarding/steps/' + file;
  if (!fs.existsSync(p)) continue;
  let code = fs.readFileSync(p, 'utf8');

  code = code.replace(/className="card"/g, '');
  code = code.replace(/var\(--space-8\)/g, '2rem');
  code = code.replace(/var\(--space-5\)/g, '1.25rem');
  code = code.replace(/var\(--space-4\)/g, '1rem');
  code = code.replace(/var\(--space-3\)/g, '0.75rem');
  code = code.replace(/var\(--space-2\)/g, '0.5rem');
  code = code.replace(/var\(--space-10\)/g, '2.5rem');
  code = code.replace(/var\(--space-6\)/g, '1.5rem');
  code = code.replace(/var\(--color-bg\)/g, 'var(--bg)');
  code = code.replace(/var\(--color-bg-2\)/g, 'var(--bg-2)');
  code = code.replace(/var\(--color-text\)/g, 'var(--text)');
  code = code.replace(/var\(--color-text-2\)/g, 'var(--text-2)');
  code = code.replace(/var\(--color-text-3\)/g, 'var(--text-3)');
  code = code.replace(/var\(--color-border\)/g, 'var(--border)');
  code = code.replace(/var\(--color-primary\)/g, 'var(--petrol)');
  code = code.replace(/var\(--color-success\)/g, 'var(--success)');
  code = code.replace(/var\(--text-xl\)/g, '1.5rem');
  code = code.replace(/var\(--text-sm\)/g, '0.875rem');
  code = code.replace(/var\(--text-xs\)/g, '0.75rem');
  code = code.replace(/<h2 className="card-title">/g, '<h2 style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--text)", marginBottom: "0.5rem", letterSpacing: "-0.02em" }}>');
  
  fs.writeFileSync(p, code);
}
