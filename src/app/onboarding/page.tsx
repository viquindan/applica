'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/i18n/context';
import Step1Personal from './steps/Step1Personal';
import Step2Profile from './steps/Step2Profile';
import Step3Preferences from './steps/Step3Preferences';

export type OnboardingData = {
  personal: any;
  profile: any;
  preferences: any;
};

const TOTAL_STEPS = 3;

export default function OnboardingPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<OnboardingData>({
    personal: {}, profile: {}, preferences: {}
  });

  const progress = ((step - 1) / (TOTAL_STEPS - 1)) * 100;

  async function saveStep(stepKey: keyof OnboardingData, stepData: any) {
    setSaving(true);
    const updated = { ...data, [stepKey]: { ...data[stepKey], ...stepData } };
    setData(updated);
    await fetch('/api/onboarding/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ step, stepKey, data: stepData }),
    });
    setSaving(false);
    return updated;
  }

  // New handler specifically for the CV upload step to merge AI extracted data
  async function handleProfileNext(stepData: any, extractedData?: any) {
    let updated = await saveStep('profile', stepData);
    if (extractedData) {
      updated = {
        ...updated,
        personal: { ...updated.personal, ...extractedData.personal },
        profile: { ...updated.profile, ...extractedData.profile }
      };
      setData(updated);
    }
    setStep(2);
    window.scrollTo(0, 0);
  }

  async function handleNext(stepKey: keyof OnboardingData, stepData: any) {
    await saveStep(stepKey, stepData);
    if (step < TOTAL_STEPS) {
      setStep(s => s + 1);
      window.scrollTo(0, 0);
    }
    else handleFinish(stepKey, stepData);
  }

  async function handleFinish(stepKey: keyof OnboardingData, stepData: any) {
    setSaving(true);
    await fetch('/api/onboarding/complete', { method: 'POST' });
    router.push('/applications');
  }

  const stepTitles = [t.onboarding.step2, t.onboarding.step1, t.onboarding.step3];

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', padding: '3rem 1rem' }}>
      {/* Header */}
      <div style={{ width: '100%', maxWidth: 760, marginBottom: '2.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
          <span style={{ fontFamily: 'var(--font-sans)', fontSize: '1.5rem', fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em' }}>
            Applica <span style={{ color: 'var(--petrol)', fontWeight: 600 }}>Setup</span>
          </span>
          <span style={{ fontSize: '0.875rem', color: 'var(--text-3)', fontWeight: 600 }}>
            {step} / {TOTAL_STEPS}
          </span>
        </div>

        {/* Progress Track */}
        <div style={{ width: '100%', height: '6px', background: 'var(--border)', borderRadius: '999px', overflow: 'hidden', marginBottom: '1.5rem' }}>
          <div style={{ width: `${progress}%`, height: '100%', background: 'var(--petrol)', borderRadius: '999px', transition: 'width 0.5s ease-in-out' }} />
        </div>

        {/* Step indicators */}
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          {stepTitles.map((title, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1 }}>
              <div style={{
                width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 600,
                background: i + 1 === step ? 'var(--petrol)' : i + 1 < step ? 'var(--success)' : 'var(--bg-2)',
                color: i + 1 <= step ? 'white' : 'var(--text-3)',
                border: i + 1 === step ? 'none' : i + 1 < step ? 'none' : '1px solid var(--border)'
              }}>
                {i + 1 < step ? '' : i + 1}
              </div>
              <span style={{ fontSize: '0.75rem', color: i + 1 === step ? 'var(--text)' : 'var(--text-3)', fontWeight: i + 1 === step ? 600 : 500, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
                {title}
              </span>
              {i < TOTAL_STEPS - 1 && <div style={{ flex: 1, height: 1, background: 'var(--border)', margin: '0 0.5rem' }} />}
            </div>
          ))}
        </div>
      </div>

      {/* Step Content */}
      <div style={{ width: '100%', maxWidth: 760 }} className="animate-fadein">
        <div className="bento-card" style={{ padding: '2.5rem' }}>
          {step === 1 && <Step2Profile data={data.profile} onNext={(d, extracted) => handleProfileNext(d, extracted)} onBack={() => {}} saving={saving} />}
          {step === 2 && <Step1Personal data={data.personal} onNext={d => handleNext('personal', d)} onBack={() => setStep(1)} saving={saving} />}
          {step === 3 && <Step3Preferences data={data.preferences} onNext={d => handleNext('preferences', d)} onBack={() => setStep(2)} saving={saving} />}
        </div>
      </div>
    </div>
  );
}
