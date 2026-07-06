'use client';
import React, { createContext, useContext, useState, useEffect } from 'react';
import { translations, Locale } from './translations';

type I18nContextType = {
  locale: Locale;
  t: (typeof translations)[Locale];
  setLocale: (l: Locale) => void;
};

const I18nContext = createContext<I18nContextType>({
  locale: 'es',
  t: translations.es as any,
  setLocale: () => {},
});

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('es');

  useEffect(() => {
    const stored = localStorage.getItem('applica_locale') as Locale | null;
    if (stored && (stored === 'en' || stored === 'es')) setLocaleState(stored);
  }, []);

  const setLocale = (l: Locale) => {
    setLocaleState(l);
    localStorage.setItem('applica_locale', l);
  };

  return (
    <I18nContext.Provider value={{ locale, t: translations[locale], setLocale }}>
      {children}
    </I18nContext.Provider>
  );
}

export const useI18n = () => useContext(I18nContext);
