// Phase 1 scaffold — Text normaliser (number words -> digits, ordinals, book aliases)
export function normaliseTranscriptForDetection(text: string): string {
  return String(text || '').trim();
}
