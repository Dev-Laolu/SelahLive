import { parseSingleNumberToken } from './numberDictionaries';
import { convertNumberWordsInTokens } from './numberWords';

export { convertNumberWordsInTokens, parseSingleNumberToken };

export function normaliseSpokenText(rawText: string): string {
  if (!rawText) return '';

  const cleaned = String(rawText)
    .toLowerCase()
    .replace(/(\d)\s*:\s*(\d)/g, '$1 : $2')
    .replace(/(\d)\s*[–—-]\s*(\d)/g, '$1 - $2')
    .replace(/[,.;!?()"“”‘’']/g, ' ')
    .replace(/\bsong\s+of\s+(?:songs|solomon)\b/g, 'songofsolomon')
    .replace(/\bcanticles\b/g, 'songofsolomon')
    .replace(/\brevelations\b/g, 'revelation')
    .replace(/\bpsalms\b/g, 'psalm')
    .replace(/\b(?:shapter|capta|chapt)\b/g, 'chapter')
    .replace(/\b(?:vass|vase|vars)\b/g, 'verse')
    .replace(/\b(\d+)\s+(?:first|fast|bus|pass)\s+(\d+)\b/g, '$1 verse $2')
    .replace(/\b1st\b/g, 'first')
    .replace(/\b2nd\b/g, 'second')
    .replace(/\b3rd\b/g, 'third')
    .replace(/\bbook\s+of\s+/g, '')
    .replace(/\bgospel\s+(?:according\s+to\s+|of\s+)/g, '')
    .replace(/\bepistle\s+(?:of\s+|to\s+(?:the\s+)?)/g, '')
    .replace(/\bletter\s+to\s+(?:the\s+)?/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return '';
  return convertNumberWordsInTokens(cleaned.split(' ')).join(' ');
}

export function normaliseTranscriptForDetection(text: string): string {
  return normaliseSpokenText(text);
}
