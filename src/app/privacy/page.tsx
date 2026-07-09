import Link from 'next/link';
import { LogoBadge } from '@/components/Logo';

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[var(--bg-1)] flex flex-col font-sans">
      <header className="w-full flex justify-between items-center px-8 py-6 max-w-7xl mx-auto border-b border-white/10">
        <Link href="/" className="flex items-center gap-2">
          <LogoBadge size={24} radius="var(--radius-sm)" />
          <span className="font-display text-xl font-bold tracking-tight text-white">Applica</span>
        </Link>
      </header>
      <main className="flex-1 max-w-3xl mx-auto py-16 px-4">
        <h1 className="text-3xl font-bold text-white mb-8">Privacy Policy / Política de Privacidad</h1>
        <div className="text-gray-300 space-y-6 text-sm leading-relaxed">
          <p>
            Last Updated: {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </p>
          <h2 className="text-xl text-white font-semibold">1. Information We Collect</h2>
          <p>
            We collect personal information that you provide to us, including your name, email address, password, resume/CV details, and job preferences. We also collect data regarding your usage of the platform.
          </p>
          <h2 className="text-xl text-white font-semibold">2. How We Use Your Information</h2>
          <p>
            We use your information to provide, maintain, and improve the Service. Specifically, we use your resume and job preferences to tailor job applications using AI and submit them on your behalf.
          </p>
          <h2 className="text-xl text-white font-semibold">3. Data Sharing</h2>
          <p>
            We share your information with third-party job boards (e.g., LinkedIn, Greenhouse, Lever) exclusively for the purpose of submitting job applications on your behalf. We may also share data with our AI providers (e.g., OpenAI, Anthropic) to process your CV; however, we ensure they do not use your data to train their models.
          </p>
          <h2 className="text-xl text-white font-semibold">4. Security</h2>
          <p>
            We implement appropriate technical and organizational security measures to protect your personal information against unauthorized access, alteration, disclosure, or destruction.
          </p>
          <h2 className="text-xl text-white font-semibold">5. Your Rights</h2>
          <p>
            You have the right to access, update, or delete your personal information at any time through your account settings or by contacting us.
          </p>
        </div>
      </main>
      <footer className="w-full border-t border-white/10 py-8 mt-10 text-center">
        <p className="text-gray-500 text-sm">© {new Date().getFullYear()} Applica.</p>
      </footer>
    </div>
  );
}
