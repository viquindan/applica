'use client';
import { useEffect, useState } from 'react';

const PHRASES = [
  'Escaneando bolsas de empleo…',
  'Revisando LinkedIn…',
  'Comparando con tu perfil…',
  'Filtrando por tus preferencias…',
  'Calculando compatibilidad…',
  'Preparando candidatos…',
];

/**
 * Fills the Feed honestly while a real search runs server-side - same job as
 * the funnel table, just framed as "we're on it" instead of a static table.
 * Mirrors mobile's searching-panel.tsx (rotating phrases + radar pulse).
 */
export default function SearchingPanel({
  monitored = 0,
  related = 0,
  selected = 0,
}: {
  monitored?: number;
  related?: number;
  selected?: number;
}) {
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setPhraseIndex((i) => (i + 1) % PHRASES.length);
        setVisible(true);
      }, 200);
    }, 1900);
    return () => clearInterval(interval);
  }, []);

  const hasProgress = monitored > 0 || related > 0 || selected > 0;

  return (
    <div className="bento-card" style={{ padding: '3.5rem 2rem', textAlign: 'center', borderRadius: 'var(--radius-xl)', maxWidth: 460, margin: '0 auto' }}>
      <div className="ambient-radar" style={{ margin: '0 auto 1.5rem auto', width: 84, height: 84 }}>
        <div style={{ width: 16, height: 16, borderRadius: '50%', background: 'var(--petrol)', boxShadow: '0 0 14px var(--petrol)' }} />
      </div>
      <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text)', marginBottom: '.5rem' }}>
        Applica está buscando por ti
      </h3>
      <p
        style={{
          fontSize: '.85rem', color: 'var(--text-2)', maxWidth: 380, margin: '0 auto',
          opacity: visible ? 1 : 0, transition: 'opacity 200ms ease',
          minHeight: '1.3em',
        }}
      >
        {PHRASES[phraseIndex]}
      </p>
      {hasProgress && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: '1.5rem', marginTop: '1.75rem' }}>
          {[
            { label: 'Fuentes', value: monitored },
            { label: 'Relacionadas', value: related },
            { label: 'Listas para ti', value: selected },
          ].map((s) => (
            <div key={s.label} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--petrol)', fontVariantNumeric: 'tabular-nums' }}>{s.value}</div>
              <div style={{ fontSize: '.65rem', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.04em' }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
