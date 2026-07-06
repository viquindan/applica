import Link from 'next/link';

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-[var(--bg-1)] flex flex-col font-sans">
      <header className="w-full flex justify-between items-center px-8 py-6 max-w-7xl mx-auto border-b border-white/10">
        <Link href="/" className="flex items-center gap-2">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M12 2C12.8 7.8 16.2 11.2 22 12C16.2 12.8 12.8 16.2 12 22C11.2 16.2 7.8 12.8 2 12C7.8 11.2 11.2 7.8 12 2Z" fill="#B09460"/>
          </svg>
          <span className="font-display text-xl font-bold tracking-tight text-white">Applica</span>
        </Link>
      </header>
      <main className="flex-1 max-w-3xl mx-auto py-16 px-4">
        <h1 className="text-3xl font-bold text-white mb-8">Terms of Service / Términos de Servicio</h1>
        <div className="text-gray-300 space-y-6 text-sm leading-relaxed">
          <p>
            Last Updated: {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </p>
          <h2 className="text-xl text-white font-semibold">1. Acceptance of Terms</h2>
          <p>
            By accessing and using Applica ("the Service"), you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use the Service.
          </p>
          <h2 className="text-xl text-white font-semibold">2. Description of Service</h2>
          <p>
            Applica is an AI-powered job application automation tool. We assist users in discovering job vacancies, tailoring their professional materials, and submitting applications on their behalf using automation technologies.
          </p>
          <h2 className="text-xl text-white font-semibold">3. User Obligations</h2>
          <p>
            You agree to provide accurate, current, and complete information during the registration process and to update such information to keep it accurate, current, and complete. You are responsible for safeguarding your password.
          </p>
          <h2 className="text-xl text-white font-semibold">4. Prohibited Uses</h2>
          <p>
            You may not use the Service to spam, send unsolicited communications, misrepresent your identity or qualifications, or violate the terms of service of third-party job boards (such as LinkedIn, Greenhouse, Lever, etc.).
          </p>
          <h2 className="text-xl text-white font-semibold">5. Limitation of Liability</h2>
          <p>
            Applica is provided "as is" and "as available". We do not guarantee that your use of the Service will result in employment. We are not responsible for any decisions made by third-party employers.
          </p>
        </div>
      </main>
      <footer className="w-full border-t border-white/10 py-8 mt-10 text-center">
        <p className="text-gray-500 text-sm">© {new Date().getFullYear()} Applica.</p>
      </footer>
    </div>
  );
}
