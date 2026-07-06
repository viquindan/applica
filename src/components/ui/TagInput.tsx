'use client';
import { useState } from 'react';

interface TagInputProps {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}

export default function TagInput({ value, onChange, placeholder }: TagInputProps) {
  const [input, setInput] = useState('');
  const id = `ti-${placeholder?.replace(/\s/g, '-')}`;

  function add() {
    const trimmed = input.trim();
    if (trimmed && !value.includes(trimmed)) onChange([...value, trimmed]);
    setInput('');
  }

  return (
    <div className="tag-input-wrapper" onClick={() => document.getElementById(id)?.focus()}>
      {value.map(v => (
        <span key={v} className="tag">
          {v}
          <button type="button" onClick={e => { e.stopPropagation(); onChange(value.filter(x => x !== v)); }}></button>
        </span>
      ))}
      <input id={id} className="tag-input" value={input} placeholder={value.length === 0 ? placeholder : ''}
        onChange={e => setInput(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); } }}
        onBlur={add}
      />
    </div>
  );
}
