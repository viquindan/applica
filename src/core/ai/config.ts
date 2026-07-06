export type InternalAiConfig = {
  provider: 'google';
  apiKey: string;
  model: string;
};

export function getInternalAiConfig(): InternalAiConfig | null {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) return null;

  return {
    provider: 'google',
    apiKey,
    model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  };
}
