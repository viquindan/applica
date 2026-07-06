import { loadEnvLocal } from './src/lib/loadEnvLocal';
loadEnvLocal();
(async () => {
  process.env.ENABLE_REAL_SUBMISSIONS = 'true';
  process.env.APPLY_HEADFUL = 'false';
  const { runAssistedApply } = await import('./src/core/automation/assistedApply');
  const html = `<html><body>
    <div id="p1"><label for="e">Email</label><input id="e" type="email" required><button id="nextBtn">Next</button></div>
    <div id="p2" style="display:none"><label for="g">Gender</label><input id="g" required><button id="subBtn">Submit application</button></div>
    <div id="done" style="display:none">Thank you for applying</div>
    <script>
      document.getElementById('nextBtn').onclick = function(){ document.getElementById('p1').style.display='none'; document.getElementById('p2').style.display='block'; };
      document.getElementById('subBtn').onclick = function(){ document.getElementById('p2').style.display='none'; document.getElementById('done').style.display='block'; };
    </script>
  </body></html>`;
  const url = 'data:text/html;base64,' + Buffer.from(html).toString('base64');
  const adapter: any = { applyPlaywright: async () => ({ status: 'pending_review', submissionStatus: 'assisted_ready', logs: [] }) };
  const outcome = await runAssistedApply(adapter, url, {
    applicationId: 'test', profileData: { email: 'x@y.com' }, resumePath: '', formAnswers: { Gender: 'Male' },
  } as any, { timeoutMs: 90000 });
  console.log('OUTCOME:', outcome.status, outcome.reason || '');
  process.exit(0);
})();
