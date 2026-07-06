'use client';
import { useState } from'react';

type Status = 'none' | 'connected' | 'expired';

const META: Record<Status, { label: string; color: string; bg: string }> = {
  none: { label: 'No conectado', color: 'var(--text-3)', bg: 'var(--bg-2)' },
  connected: { label: 'Conectado', color: '#1f8a5b', bg: 'rgba(78,204,163,.12)' },
  expired: { label: 'Sesión expirada - reconecta', color: '#b8860b', bg: 'rgba(240,192,64,.12)' },
};

export default function LinkedInConnectCard({ initialStatus }: { initialStatus: Status }) {
  const [status, setStatus] = useState<Status>(initialStatus);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [liAt, setLiAt] = useState('');

  const meta = META[status];

  // ── Option A: assisted login (opens a real LinkedIn window, captures session) ──
  async function assistedLogin() {
    setBusy('login');
    setMsg({ ok: true, text: 'Se abrió LinkedIn en tu navegador - inicia sesión una vez y listo.' });
    try {
      const res = await fetch('/api/linkedin/session/login', { method: 'POST' });
      const data = await res.json();
      if (data.ok) {
        setStatus('connected');
        setMsg({ ok: true, text: 'Conectado. Ya puedes aplicar en LinkedIn con 1 clic.' });
      } else if (data.reason?.startsWith('no_display')) {
        setMsg({ ok: false, text: 'No se pudo abrir una ventana en este entorno. Usa el modo avanzado (pegar cookie) más abajo.' });
        setShowAdvanced(true);
      } else if (data.reason === 'timeout') {
        setMsg({ ok: false, text: 'No completaste el inicio de sesión a tiempo. Inténtalo de nuevo.' });
      } else if (data.reason === 'window_closed') {
        setMsg({ ok: false, text: 'Cerraste la ventana antes de iniciar sesión. Inténtalo de nuevo.' });
      } else {
        setMsg({ ok: false, text: 'No pudimos capturar la sesión. Inténtalo de nuevo.' });
      }
    } catch {
      setMsg({ ok: false, text: 'Error de red.' });
    } finally {
      setBusy(null);
    }
  }

  async function connectByCookie() {
    setBusy('cookie'); setMsg(null);
    try {
      const res = await fetch('/api/linkedin/session', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ li_at: liAt.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setMsg({ ok: false, text: data.error ?? 'No se pudo guardar.' }); return; }
      const v = await fetch('/api/linkedin/session/validate', { method: 'POST' }).then((r) => r.json());
      if (v.valid) { setStatus('connected'); setLiAt(''); setMsg({ ok: true, text: 'Conectado y verificado.' }); }
      else { setStatus('expired'); setMsg({ ok: false, text: 'LinkedIn no aceptó la cookie. Revisa que la copiaste completa.' }); }
    } catch { setMsg({ ok: false, text: 'Error de red.' }); }
    finally { setBusy(null); }
  }

  async function disconnect() {
    setBusy('disconnect'); setMsg(null);
    await fetch('/api/linkedin/session', { method: 'DELETE' });
    setStatus('none'); setMsg({ ok: true, text: 'Sesión desconectada.' });
    setBusy(null);
  }

  async function verify() {
    setBusy('validate'); setMsg(null);
    const v = await fetch('/api/linkedin/session/validate', { method: 'POST' }).then((r) => r.json());
    if (v.valid) setMsg({ ok: true, text: 'Sesión activa.' });
    else { setStatus('expired'); setMsg({ ok: false, text: 'La sesión ya no es válida - reconecta.' }); }
    setBusy(null);
  }

  return (
    <div className="bento-card" style={{ padding: '1.5rem', borderRadius: 'var(--radius-lg)', marginBottom: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text)' }}>Conectar LinkedIn para aplicar</div>
          <p style={{ fontSize: '.82rem', color: 'var(--text-2)', margin: '.35rem 0 0', maxWidth: 560, lineHeight: 1.5 }}>
            Inicia sesión una vez y Applica podrá enviar postulaciones"Easy Apply" por ti. Tu sesión se guarda <strong>cifrada</strong>; nunca vemos tu contraseña ni la compartimos.
          </p>
        </div>
        <span style={{ fontSize: '.78rem', fontWeight: 700, color: meta.color, background: meta.bg, padding: '.3rem .7rem', borderRadius: 999, whiteSpace: 'nowrap' }}>
          {meta.label}
        </span>
      </div>

      {status !== 'connected' ? (
        <div style={{ marginTop: '1rem' }}>
          <button className="btn btn-primary" disabled={!!busy} onClick={assistedLogin}>
            {busy === 'login' ? 'Esperando tu inicio de sesión…' : 'Conectar con LinkedIn'}
          </button>
          <p style={{ fontSize: '.75rem', color: 'var(--text-3)', margin: '.6rem 0 0', lineHeight: 1.5 }}>
            Se abrirá una ventana con el login real de LinkedIn. Inicia sesión como siempre (incluido 2FA) y la conexión se completa sola.
          </p>
        </div>
      ) : (
        <div style={{ marginTop: '1rem', display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
          <button className="btn btn-secondary btn-sm" disabled={!!busy} onClick={verify}>
            {busy === 'validate' ? 'Verificando…' : 'Verificar sesión'}
          </button>
          <button className="btn btn-ghost btn-sm" disabled={!!busy} onClick={disconnect} style={{ color: 'var(--text-3)' }}>
            Desconectar
          </button>
        </div>
      )}

      {msg && (
        <div style={{ marginTop: '.85rem', fontSize: '.8rem', fontWeight: 500, color: msg.ok ? '#1f8a5b' : '#c0392b', lineHeight: 1.5 }}>{msg.text}</div>
      )}

      {status !== 'connected' && (
        <div style={{ marginTop: '1rem', borderTop: '1px solid var(--border-light)', paddingTop: '.85rem' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setShowAdvanced((v) => !v)} style={{ fontSize: '.72rem', color: 'var(--text-3)' }}>
            {showAdvanced ? 'Ocultar modo avanzado' : 'Modo avanzado (pegar cookie manualmente)'}
          </button>
          {showAdvanced && (
            <div style={{ marginTop: '.6rem', display: 'flex', gap: '.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <input className="input" placeholder="Cookie li_at…" value={liAt} onChange={(e) => setLiAt(e.target.value)}
                style={{ flex: 1, minWidth: 220, fontFamily: 'monospace', fontSize: '.78rem' }} />
              <button className="btn btn-secondary btn-sm" disabled={!liAt.trim() || !!busy} onClick={connectByCookie}>
                {busy === 'cookie' ? 'Conectando…' : 'Conectar'}
              </button>
            </div>
          )}
        </div>
      )}

      <p style={{ fontSize: '.72rem', color: 'var(--text-3)', marginTop: '1rem', lineHeight: 1.5 }}>
         Automatizar acciones en LinkedIn puede ir contra sus términos; usamos tu propia sesión y volumen bajo para minimizar el riesgo, sin eliminarlo. En la app móvil podrás iniciar sesión dentro de un webview (mismo flujo).
      </p>
    </div>
  );
}
