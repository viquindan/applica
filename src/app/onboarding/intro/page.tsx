'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogoBadge } from '@/components/Logo';

const STEPS = [
  {
    headline: 'Bienvenido a Applica',
    body: 'La forma más rápida de encontrar tu próximo trabajo. Desliza a la derecha para aplicar, a la izquierda para descartar - nosotros nos encargamos del resto.',
    illustration: 'swipe' as const,
  },
  {
    headline: 'La IA prepara todo por ti',
    body: 'Por cada vacante, adaptamos tu CV y tu carta de presentación en segundos - resaltando exactamente lo que esa empresa busca.',
    illustration: 'cv' as const,
  },
  {
    headline: 'Tú tienes el control',
    body: 'Revisa antes de enviar, o déjanos aplicar automáticamente en los ATS compatibles. Un captcha o un dato que no sepamos siempre queda en tus manos.',
    illustration: 'control' as const,
  },
];

function SwipeIllustration() {
  return (
    <div style={{ position: 'relative', width: 220, height: 260 }}>
      <div aria-hidden style={{ position: 'absolute', left: 14, right: 14, top: 16, bottom: -16, background: 'var(--surface)', borderRadius: 'var(--radius-xl)', boxShadow: 'var(--shadow-sm)', opacity: .5 }} />
      <div style={{ position: 'relative', width: '100%', height: '100%', background: 'var(--surface)', borderRadius: 'var(--radius-xl)', boxShadow: 'var(--shadow-lg)', overflow: 'hidden', border: '1px solid rgba(18,51,56,.05)' }}>
        <div style={{ height: 5, background: 'linear-gradient(90deg, var(--petrol), var(--gold))' }} />
        <div style={{ padding: '1.25rem 1rem', textAlign: 'center' }}>
          <div style={{ width: 48, height: 48, borderRadius: 'var(--radius-lg)', margin: '0 auto .6rem', background: 'linear-gradient(135deg, var(--petrol), var(--petrol-light))' }} />
          <div style={{ height: 8, width: '70%', background: 'var(--border)', borderRadius: 4, margin: '0 auto .4rem' }} />
          <div style={{ height: 8, width: '45%', background: 'var(--border-light)', borderRadius: 4, margin: '0 auto' }} />
        </div>
      </div>
      <div style={{ position: 'absolute', left: -18, top: '50%', transform: 'translateY(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, opacity: .55 }}>
        <div style={{ width: 34, height: 34, borderRadius: '50%', border: '1.5px solid var(--danger)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--danger)', fontSize: '.85rem' }}>✕</div>
        <span style={{ fontSize: '.6rem', fontWeight: 800, color: 'var(--danger)' }}>NO</span>
      </div>
      <div style={{ position: 'absolute', right: -18, top: '50%', transform: 'translateY(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, opacity: .55 }}>
        <div style={{ width: 34, height: 34, borderRadius: '50%', border: '1.5px solid var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--success)', fontSize: '.85rem' }}>✓</div>
        <span style={{ fontSize: '.6rem', fontWeight: 800, color: 'var(--success)' }}>SÍ</span>
      </div>
    </div>
  );
}

function CvIllustration() {
  return (
    <div style={{ width: 200, height: 240, background: 'var(--surface)', borderRadius: 'var(--radius-xl)', boxShadow: 'var(--shadow-lg)', border: '1px solid rgba(18,51,56,.05)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem', position: 'relative' }}>
      <div style={{ width: 90, height: 116, background: 'var(--bg)', border: '2px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '.85rem .7rem', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ height: 6, width: '80%', background: 'var(--petrol)', borderRadius: 3 }} />
        <div style={{ height: 4, width: '60%', background: 'var(--border)', borderRadius: 2 }} />
        <div style={{ height: 4, width: '90%', background: 'var(--border)', borderRadius: 2, marginTop: 6 }} />
        <div style={{ height: 4, width: '70%', background: 'var(--border)', borderRadius: 2 }} />
        <div style={{ height: 4, width: '85%', background: 'var(--border)', borderRadius: 2 }} />
      </div>
      <div style={{ position: 'absolute', bottom: 22, right: 30, width: 34, height: 34, borderRadius: '50%', background: 'var(--gold)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--shadow-md)' }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-gold)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v6m0 6v6M5 12h4m6 0h4" /></svg>
      </div>
    </div>
  );
}

function ControlIllustration() {
  return (
    <div style={{ width: 220, background: 'var(--surface)', borderRadius: 'var(--radius-xl)', boxShadow: 'var(--shadow-lg)', border: '1px solid rgba(18,51,56,.05)', padding: '1.25rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '.6rem' }}>
        <span className="spinner" style={{ width: 14, height: 14 }} />
        <span style={{ fontWeight: 700, fontSize: '.8rem', color: 'var(--text)' }}>Aplicando por ti…</span>
      </div>
      <div style={{ height: 6, width: '100%', background: 'var(--border-light)', borderRadius: 3, marginBottom: '.4rem' }} />
      <div style={{ height: 6, width: '70%', background: 'var(--border-light)', borderRadius: 3, marginBottom: '1rem' }} />
      <div style={{ display: 'flex', gap: '.5rem' }}>
        <div style={{ flex: 1, padding: '.5rem', textAlign: 'center', borderRadius: 'var(--radius-full)', background: 'var(--petrol)', color: '#fff', fontSize: '.72rem', fontWeight: 700 }}>Ya envié</div>
        <div style={{ flex: 1, padding: '.5rem', textAlign: 'center', borderRadius: 'var(--radius-full)', background: 'var(--bg-2)', color: 'var(--text-3)', fontSize: '.72rem', fontWeight: 700 }}>No se envió</div>
      </div>
    </div>
  );
}

export default function OnboardingIntroPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const isLast = step === STEPS.length - 1;
  const current = STEPS[step];

  function next() {
    if (isLast) router.push('/onboarding');
    else setStep((s) => s + 1);
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden',
      background: 'var(--bg)',
    }}>
      <div aria-hidden style={{ position: 'absolute', top: '-10%', right: '-10%', width: 380, height: 380, background: 'var(--petrol)', opacity: .05, borderRadius: '50%', filter: 'blur(60px)' }} />
      <div aria-hidden style={{ position: 'absolute', bottom: '-5%', left: '-5%', width: 300, height: 300, background: 'var(--gold)', opacity: .12, borderRadius: '50%', filter: 'blur(60px)' }} />

      <div style={{ display: 'flex', justifyContent: 'center', gap: '.4rem', paddingTop: '2rem', position: 'relative', zIndex: 1 }}>
        {STEPS.map((_, i) => (
          <div key={i} style={{ height: 5, width: 44, borderRadius: 'var(--radius-full)', background: i <= step ? 'var(--petrol)' : 'var(--border)', transition: 'background var(--transition)' }} />
        ))}
      </div>

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem 1.5rem', position: 'relative', zIndex: 1, textAlign: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '2.5rem' }}>
          <LogoBadge size={30} radius="var(--radius-sm)" />
          <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.35rem', fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.01em' }}>Applica</span>
        </div>

        <div className="animate-fadein" key={step} style={{ marginBottom: '2.5rem' }}>
          {current.illustration === 'swipe' && <SwipeIllustration />}
          {current.illustration === 'cv' && <CvIllustration />}
          {current.illustration === 'control' && <ControlIllustration />}
        </div>

        <div className="animate-fadein" key={`copy-${step}`} style={{ maxWidth: 380 }}>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 800, color: 'var(--text)', marginBottom: '.75rem', letterSpacing: '-0.01em' }}>
            {current.headline}
          </h1>
          <p style={{ fontSize: '.95rem', color: 'var(--text-2)', lineHeight: 1.6 }}>
            {current.body}
          </p>
        </div>
      </main>

      <footer style={{ width: '100%', maxWidth: 420, margin: '0 auto', padding: '1.5rem', position: 'relative', zIndex: 1 }}>
        <button className="btn btn-primary btn-lg w-full" onClick={next} style={{ justifyContent: 'center', gap: '.5rem' }}>
          {isLast ? 'Comenzar' : 'Siguiente'}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
        </button>
        {!isLast && (
          <div style={{ marginTop: '1rem', textAlign: 'center' }}>
            <button onClick={() => router.push('/onboarding')} style={{ background: 'none', border: 'none', color: 'var(--text-3)', fontSize: '.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em', cursor: 'pointer' }}>
              Saltar intro
            </button>
          </div>
        )}
      </footer>
    </div>
  );
}
