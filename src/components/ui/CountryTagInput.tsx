'use client';
import { useMemo, useState } from 'react';
import { COUNTRIES } from '@/lib/countries';

interface CountryTagInputProps {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}

// Same visual/interaction model as TagInput, but only lets the user add a
// country that exists in COUNTRIES (autocomplete dropdown, click or Enter to
// confirm) - free text is never pushed into the tag list, so typos like
// "Colobmia" or "Estados Ulidos" can no longer end up stored and silently
// fail to match in eligibility.ts.
export default function CountryTagInput({ value, onChange, placeholder }: CountryTagInputProps) {
  const [input, setInput] = useState('');
  const [open, setOpen] = useState(false);
  const id = `cti-${placeholder?.replace(/\s/g, '-')}`;

  const suggestions = useMemo(() => {
    if (!input.trim()) return [];
    const q = input.trim().toLowerCase();
    return COUNTRIES.filter((c) => !value.includes(c) && c.toLowerCase().includes(q)).slice(0, 8);
  }, [input, value]);

  function addCountry(country: string) {
    if (!value.includes(country)) onChange([...value, country]);
    setInput('');
    setOpen(false);
  }

  return (
    <div style={{ position: 'relative' }}>
      <div className="tag-input-wrapper" onClick={() => document.getElementById(id)?.focus()}>
        {value.map((v) => (
          <span key={v} className="tag">
            {v}
            <button type="button" onClick={(e) => { e.stopPropagation(); onChange(value.filter((x) => x !== v)); }}></button>
          </span>
        ))}
        <input
          id={id}
          className="tag-input"
          value={input}
          placeholder={value.length === 0 ? placeholder : ''}
          onChange={(e) => { setInput(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (suggestions.length === 1) addCountry(suggestions[0]);
              else if (suggestions.some((s) => s.toLowerCase() === input.trim().toLowerCase())) {
                addCountry(suggestions.find((s) => s.toLowerCase() === input.trim().toLowerCase())!);
              }
            }
            if (e.key === 'Escape') setOpen(false);
          }}
          onBlur={() => { setInput(''); setOpen(false); }}
        />
      </div>
      {open && suggestions.length > 0 && (
        <div
          style={{
            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, marginTop: 4,
            background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-md)', maxHeight: 220, overflowY: 'auto',
          }}
        >
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); addCountry(s); }}
              style={{
                display: 'block', width: '100%', textAlign: 'left', padding: '0.5rem 0.75rem',
                background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '0.875rem', color: 'var(--text)',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-2)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
