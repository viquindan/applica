const tokEl = document.getElementById('tok');
const statusEl = document.getElementById('status');

chrome.storage.local.get('applicaToken').then(({ applicaToken }) => {
  if (applicaToken) { tokEl.value = applicaToken; statusEl.innerHTML = '<span class="ok">Conectado.</span> Ya puedes llenar postulaciones.'; }
});

document.getElementById('save').addEventListener('click', async () => {
  const token = tokEl.value.trim();
  if (!token) { statusEl.textContent = 'Pega tu token primero.'; return; }
  // Validate against the backend before saving.
  statusEl.textContent = 'Verificando...';
  try {
    const res = await fetch(`${APPLICA_BASE_URL}/api/extension/materials?url=test`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 401) { statusEl.textContent = 'Token invalido. Copialo de nuevo del dashboard.'; return; }
    await chrome.storage.local.set({ applicaToken: token });
    statusEl.innerHTML = '<span class="ok">Conectado.</span> Ya puedes llenar postulaciones.';
  } catch (e) {
    // Save anyway (backend may be unreachable from popup but reachable from bg).
    await chrome.storage.local.set({ applicaToken: token });
    statusEl.innerHTML = '<span class="ok">Guardado.</span> Si no funciona, revisa que Applica este corriendo.';
  }
});
