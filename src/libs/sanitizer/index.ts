import * as cheerio from 'cheerio';
import { stripHiddenElements } from './invisibility.ts';
import { flattenInlineElements, normalizeTtsText } from './flattener.ts';
import { deduplicateAdjacentParagraphs } from './deduplication.ts';
import { evaluateAnomalyGate } from './anomalyGate.ts';
import { applyNovelProfile } from './profileApplier.ts';
import type { NovelProfile, SanitizeOptions, SanitizeResult } from './types.ts';

export * from './types.ts';
export * from './invisibility.ts';
export * from './flattener.ts';
export * from './deduplication.ts';
export * from './anomalyGate.ts';
export * from './profileApplier.ts';

/**
 * Main deterministic chapter sanitization pipeline.
 *
 * Runs:
 * 1. Novel profile rules (if provided)
 * 2. Invisibility stripping (display:none, font-size:0, visibility:hidden, offscreen)
 * 3. TTS inline text coalescing (unwrapping fragmented spans, cleaning zero-width chars)
 * 4. Sliding-window paragraph deduplication (anti-double-reading honeypots)
 * 5. Anomaly Detection Gate (duplication check, lorem ipsum check, word collapse)
 *
 * @param rawHtml The scraped HTML payload of the chapter
 * @param options Sanitization options and optional NovelProfile
 * @returns Clean HTML, clean TTS text, and the AnomalyReport
 */
export function sanitizeChapter(
  rawHtml: string,
  options?: SanitizeOptions,
): SanitizeResult {
  if (!rawHtml || typeof rawHtml !== 'string') {
    return {
      cleanHtml: '',
      cleanText: '',
      isClean: false,
      anomalyReport: {
        isAnomaly: true,
        reasons: ['Empty or non-string chapter payload received'],
        metrics: {
          duplicateSentenceRatio: 0,
          duplicateParagraphRatio: 0,
          loremIpsumHits: 0,
          wordCount: 0,
          rawPayloadSize: 0,
          wordToLengthRatio: 0,
          ttsHazardCount: 0,
          entropyAnomaly: false,
        },
        sampleSuspects: [],
        timestamp: Date.now(),
      },
    };
  }

  // Load DOM into Cheerio
  const $ = cheerio.load(rawHtml, {
    decodeEntities: true,
  });

  // 1. Apply novel-specific profile rules first if available
  if (options?.profile) {
    applyNovelProfile($, options.profile);
  }

  // 2. Strip CSS / attribute hidden traps
  if (options?.stripHiddenElements !== false) {
    stripHiddenElements($);
  }

  // 3. Coalesce fragmented inline spans for TTS continuity
  if (options?.flattenInlineSpans !== false) {
    flattenInlineElements($);
  }

  // 4. Run sliding-window deduplication for adjacent duplicate paragraphs
  if (options?.deduplicateAdjacent !== false) {
    const windowSize = options?.dedupWindowSize ?? 2;
    const threshold = options?.dedupSimilarityThreshold ?? 0.85;
    deduplicateAdjacentParagraphs($, windowSize, threshold);
  }

  // Extract body contents or root HTML
  let cleanHtml =
    $('body').length > 0 ? $('body').html() || '' : $.html() || '';

  // Extract readable normalized text for TTS and metrics
  // Prefer paragraph text if paragraphs exist, otherwise root text
  let rawText = '';
  const paragraphs = $('p');
  if (paragraphs.length > 0) {
    const pTexts: string[] = [];
    paragraphs.each((_, p) => {
      const text = $(p).text();
      if (text && text.trim()) {
        pTexts.push(text.trim());
      }
    });
    rawText = pTexts.join('\n\n');
  } else {
    rawText = $('body').length > 0 ? $('body').text() : $.text();
  }

  const cleanText = normalizeTtsText(rawText);

  // 5. Evaluate Anomaly Detection Gate
  const anomalyReport = evaluateAnomalyGate(rawHtml, cleanText, options);

  return {
    cleanHtml,
    cleanText,
    anomalyReport,
    isClean: !anomalyReport.isAnomaly,
  };
}
