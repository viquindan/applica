'use client';
import Link from 'next/link';
import { LogoBadge } from '@/components/Logo';
import { useI18n } from '@/i18n/context';

const CONTENT = {
  es: {
    title: 'Política de Privacidad',
    updated: 'Última actualización',
    sections: [
      {
        h: '1. Qué información recopilamos',
        p: 'Recopilamos la información que nos das directamente: nombre, correo, contraseña (hasheada, nunca en texto plano), tu CV y su contenido, experiencia, habilidades, preferencias de empleo y modalidad de trabajo. También registramos datos de uso de la plataforma (búsquedas realizadas, aplicaciones enviadas) para que el producto funcione.',
      },
      {
        h: '2. Cómo usamos tu información',
        p: 'Usamos tu perfil para buscar vacantes relevantes, calcular tu compatibilidad con cada una, y adaptar tu CV y carta de presentación con IA (Google Gemini) para la vacante específica a la que decides aplicar con tu swipe.',
      },
      {
        h: '3. Con quién compartimos datos',
        p: 'Compartimos tu información únicamente con: (a) las plataformas de ATS a las que aplicas por tu decisión explícita (Greenhouse, Lever, Ashby, SmartRecruiters, Recruitee, LinkedIn en Pro); y (b) nuestro proveedor de IA (Google Gemini) para procesar tu CV y generar materiales adaptados. No vendemos tu información a terceros ni la usamos para entrenar modelos de terceros.',
      },
      {
        h: '4. Seguridad',
        p: 'Tu contraseña se almacena hasheada con bcrypt. Tus documentos y datos de sesión se guardan cifrados. El acceso a producción está restringido y protegido por autenticación por clave SSH.',
      },
      {
        h: '5. Retención de datos',
        p: 'Conservamos tu información mientras tu cuenta esté activa. Si eliminas tu cuenta, borramos tus datos personales, CVs y aplicaciones asociadas, salvo lo que debamos retener por obligación legal o para resolver disputas.',
      },
      {
        h: '6. Tus derechos',
        p: 'Puedes acceder, editar o eliminar tu información en cualquier momento desde tu Perfil, o solicitando la eliminación completa de tu cuenta. No necesitas justificar la solicitud.',
      },
      {
        h: '7. Cookies y sesión',
        p: 'Usamos cookies estrictamente necesarias para mantener tu sesión iniciada. No usamos cookies de rastreo publicitario de terceros.',
      },
      {
        h: '8. Cambios a esta política',
        p: 'Si hacemos cambios materiales a cómo tratamos tus datos, te lo notificaremos por correo o dentro de la app antes de que entren en vigor.',
      },
      {
        h: '9. Contacto',
        p: 'Para ejercer tus derechos o resolver dudas sobre privacidad, contáctanos a través de tu cuenta o el correo de soporte indicado en la app.',
      },
    ],
  },
  en: {
    title: 'Privacy Policy',
    updated: 'Last updated',
    sections: [
      {
        h: '1. Information we collect',
        p: "We collect what you give us directly: name, email, password (hashed, never stored in plain text), your CV and its content, experience, skills, job preferences and work modality. We also log platform usage (searches run, applications sent) so the product works.",
      },
      {
        h: '2. How we use your information',
        p: 'We use your profile to find relevant vacancies, score your fit against each one, and tailor your CV and cover letter with AI (Google Gemini) for the specific vacancy you decide to apply to with your swipe.',
      },
      {
        h: '3. Who we share data with',
        p: 'We share your information only with: (a) the ATS platforms you apply to by your explicit decision (Greenhouse, Lever, Ashby, SmartRecruiters, Recruitee, LinkedIn on Pro); and (b) our AI provider (Google Gemini) to process your CV and generate tailored materials. We do not sell your information to third parties or use it to train third-party models.',
      },
      {
        h: '4. Security',
        p: 'Your password is stored hashed with bcrypt. Your documents and session data are stored encrypted. Production access is restricted and protected by SSH key authentication.',
      },
      {
        h: '5. Data retention',
        p: 'We keep your information while your account is active. If you delete your account, we remove your personal data, CVs, and associated applications, except what we must retain for legal obligations or to resolve disputes.',
      },
      {
        h: '6. Your rights',
        p: 'You can access, edit, or delete your information at any time from your Profile, or by requesting full account deletion. You do not need to justify the request.',
      },
      {
        h: '7. Cookies and session',
        p: 'We use strictly necessary cookies to keep you signed in. We do not use third-party advertising tracking cookies.',
      },
      {
        h: '8. Changes to this policy',
        p: 'If we make material changes to how we handle your data, we will notify you by email or in-app before they take effect.',
      },
      {
        h: '9. Contact',
        p: 'To exercise your rights or ask privacy questions, reach out through your account or the support email listed in the app.',
      },
    ],
  },
};

export default function PrivacyPage() {
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
