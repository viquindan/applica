'use client';
import { useState } from 'react';
import { useI18n } from '@/i18n/context';
import TagInput from '@/components/ui/TagInput'; // Wait, does this exist? 
// Actually, TagInput was defined inside Step2Profile.tsx, it's not a generic component in the path '@/components/ui/TagInput'
// Let's redefine TagInput inside Step1Personal.tsx or import it if it exists. 
// Let's just define it inline.
