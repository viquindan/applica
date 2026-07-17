'use client';
import Link from 'next/link';
import { LogoBadge } from '@/components/Logo';
import { useI18n } from '@/i18n/context';

const CONTENT = {
  es: {
    title: 'Términos de Servicio',
    updated: 'Última actualización',
    sections: [
      {
        h: '1. Aceptación de los términos',
        p: 'Al crear una cuenta o usar Applica ("el Servicio"), aceptas quedar sujeto a estos Términos de Servicio. Si no estás de acuerdo, no uses el Servicio.',
      },
      {
        h: '2. Qué hace Applica',
        p: 'Applica es una herramienta de automatización de búsqueda y postulación de empleo asistida por IA. Escaneamos plataformas de ATS (Greenhouse, Lever, Ashby, SmartRecruiters, Recruitee) y, en el plan Pro, LinkedIn, para encontrar vacantes relevantes a tu perfil, adaptar tu CV y carta de presentación con IA, y preparar o enviar la aplicación por ti.',
      },
      {
        h: '3. El swipe es tu única autorización de envío',
        p: 'Applica nunca envía una aplicación sin que la hayas aprobado explícitamente con un swipe en el Feed. Cuando un sitio exige verificación humana (CAPTCHA, inicio de sesión propio, etc.), dejamos la aplicación completamente preparada y te entregamos el paso final para que lo completes tú mismo en tu propio navegador - no intentamos evadir ni resolver esas verificaciones.',
      },
      {
        h: '4. Tus obligaciones',
        p: 'Debes proporcionar información veraz y actualizada durante el registro y en tu perfil profesional. Eres responsable de la confidencialidad de tu contraseña y de toda actividad bajo tu cuenta.',
      },
      {
        h: '5. Usos prohibidos',
        p: 'No puedes usar el Servicio para enviar spam, falsificar tu identidad o calificaciones profesionales, ni violar los términos de servicio de las plataformas de terceros (LinkedIn, Greenhouse, Lever, Ashby, SmartRecruiters, Recruitee) a las que aplicamos en tu nombre.',
      },
      {
        h: '6. Planes y facturación',
        p: 'El plan Free incluye un límite mensual de aplicaciones y las plataformas ATS principales. El plan Pro amplía ese límite y agrega LinkedIn. Puedes cancelar tu suscripción en cualquier momento desde tu cuenta; el cambio aplica al siguiente ciclo de facturación.',
      },
      {
        h: '7. Limitación de responsabilidad',
        p: 'Applica se provee "tal cual" y "según disponibilidad". No garantizamos que el uso del Servicio resulte en una oferta de empleo. No somos responsables de las decisiones de contratación de empleadores externos ni de errores u omisiones en los sitios de terceros que escaneamos.',
      },
      {
        h: '8. Cambios a estos términos',
        p: 'Podemos actualizar estos términos ocasionalmente. Te notificaremos de cambios materiales por correo o dentro de la app antes de que entren en vigor.',
      },
      {
        h: '9. Contacto',
        p: 'Para preguntas sobre estos términos, contáctanos a través de tu cuenta o al correo de soporte indicado en la app.',
      },
    ],
  },
  en: {
    title: 'Terms of Service',
    updated: 'Last updated',
    sections: [
      {
        h: '1. Acceptance of terms',
        p: 'By creating an account or using Applica ("the Service"), you agree to be bound by these Terms of Service. If you do not agree, do not use the Service.',
      },
      {
        h: '2. What Applica does',
        p: 'Applica is an AI-assisted job search and application automation tool. We scan ATS platforms (Greenhouse, Lever, Ashby, SmartRecruiters, Recruitee) and, on the Pro plan, LinkedIn, to find vacancies matching your profile, tailor your CV and cover letter with AI, and prepare or submit the application for you.',
      },
      {
        h: '3. Your swipe is the only submit authorization',
        p: "Applica never submits an application without your explicit swipe approval on the Feed. When a site requires human verification (CAPTCHA, its own login, etc.), we leave the application fully prepared and hand you the final step to complete yourself in your own browser - we do not attempt to bypass or defeat those checks.",
      },
      {
        h: '4. Your obligations',
        p: 'You must provide accurate, current information during registration and in your professional profile. You are responsible for keeping your password confidential and for all activity under your account.',
      },
      {
        h: '5. Prohibited uses',
        p: 'You may not use the Service to spam, misrepresent your identity or qualifications, or violate the terms of service of third-party platforms (LinkedIn, Greenhouse, Lever, Ashby, SmartRecruiters, Recruitee) we apply to on your behalf.',
      },
      {
        h: '6. Plans and billing',
        p: 'The Free plan includes a monthly application limit and the core ATS platforms. The Pro plan raises that limit and adds LinkedIn. You can cancel your subscription anytime from your account; the change applies at the next billing cycle.',
      },
      {
        h: '7. Limitation of liability',
        p: 'Applica is provided "as is" and "as available". We do not guarantee that using the Service will result in a job offer. We are not responsible for hiring decisions made by third-party employers or for errors/omissions on the third-party sites we scan.',
      },
      {
        h: '8. Changes to these terms',
        p: 'We may update these terms occasionally. We will notify you of material changes by email or in-app before they take effect.',
      },
      {
        h: '9. Contact',
        p: 'For questions about these terms, reach out through your account or the support email listed in the app.',
      },
    ],
  },
};

export default function TermsPage() {
  const { locale } = useI18n();
  const c = CONTENT[locale as 'es' | 'en'] ?? CONTENT.es;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column', color: 'var(--text)' }}>
      <header style={{ width: '100%', display: 'flex', alignItems: 'center', padding: '1.5rem 2rem', maxWidth: '900px', margin: '0 auto', borderBottom: '1px solid var(--border)' }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', textDecoration: 'none' }}>
          <LogoBadge size={26} radius="var(--radius-sm)" />
          <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.15rem', fontWeight: 700, color: 'var(--text)' }}>Applica</span>
        </Link>
      </header>
      <main style={{ flex: 1, maxWidth: '760px', margin: '0 auto', padding: '4rem 1.5rem', width: '100%' }} className="animate-fadein">
        <h1 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '.5rem', letterSpacing: '-0.01em' }}>{c.title}</h1>
        <p style={{ fontSize: '.8rem', color: 'var(--text-3)', marginBottom: '2.5rem' }}>
          {c.updated}: {new Date().toLocaleDateString(locale === 'en' ? 'en-US' : 'es', { month: 'long', year: 'numeric' })}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          {c.sections.map((s, i) => (
            <div key={i}>
              <h2 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '.6rem' }}>{s.h}</h2>
              <p style={{ fontSize: '.9rem', color: 'var(--text-2)', lineHeight: 1.7 }}>{s.p}</p>
            </div>
          ))}
        </div>
      </main>
      <footer style={{ width: '100%', borderTop: '1px solid var(--border)', padding: '2rem 0', textAlign: 'center' }}>
        <p style={{ color: 'var(--text-3)', fontSize: '.8rem' }}>{'©'} {new Date().getFullYear()} Applica.</p>
      </footer>
    </div>
  );
}
