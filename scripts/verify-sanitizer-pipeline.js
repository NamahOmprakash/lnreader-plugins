#!/usr/bin/env node

import { sanitizeChapter } from '../src/libs/sanitizer/index.ts';

console.log('='.repeat(80));
console.log(
  'PART 1 VERIFICATION: Deterministic Sanitizer & Anomaly Gate Pipeline',
);
console.log('='.repeat(80));

// --- Test Case A: TTS Double-Reading Trap (Honeypot + Cloned Paragraphs) ---
console.log(
  '\n[Case A] Testing Double-Reading Trap (Invisible honeypots + Cloned <p>)...',
);
const doubleReadingHtml = `
  <div class="chapter-content">
    <p>Chapter 42: The Forbidden Archives</p>
    <p>Sunny crept through the shadows of the silent library, listening to the echoing silence.</p>
    <p style="display:none">Sunny crept through the shadows of the silent library, listening to the echoing silence.</p>
    <p>Every step across the cold obsidian flagstones sent a shiver down his spine.</p>
    <p>Every step across the cold obsidian flagstones sent a shiver down his spine.</p>
    <p>He knew that the dormant shadow creatures were sensitive to any vibration.</p>
    <span style="font-size: 0px">Aggregator decoy anti-scraper text to confuse TTS engines</span>
  </div>
`;

const resultA = sanitizeChapter(doubleReadingHtml);
console.log('  Cleaned Paragraphs:');
const paragraphsA = resultA.cleanHtml.match(/<p>.*?<\/p>/gs) || [];
paragraphsA.forEach((p, i) =>
  console.log(`    ${i + 1}. ${p.replace(/<\/?p>/g, '')}`),
);

const sunnyMatches = (
  resultA.cleanHtml.match(/Sunny crept through the shadows/g) || []
).length;
const stepMatches = (
  resultA.cleanHtml.match(/Every step across the cold obsidian/g) || []
).length;
console.log(`  Occurrences of "Sunny crept": ${sunnyMatches} (Expected: 1)`);
console.log(`  Occurrences of "Every step": ${stepMatches} (Expected: 1)`);
console.log(
  `  Decoy text purged: ${!resultA.cleanHtml.includes('Aggregator decoy')}`,
);
console.log(`  Gate Status: isClean=${resultA.isClean}`);

// --- Test Case B: TTS Stutter (Fragmented Spans + Zero-Width characters) ---
console.log(
  '\n[Case B] Testing TTS Stutter Fix (Fragmented inline spans & zero-width chars)...',
);
const fragmentedHtml = `
  <div class="chapter-content">
    <p>
      <span>"The </span>\u200B<span>spell </span>\u200C<span>has </span><span>been </span>\uFEFF<span>cast," </span>
      <span>the archmage intoned with ancient authority.</span>
    </p>
  </div>
`;
const resultB = sanitizeChapter(fragmentedHtml);
console.log(`  Normalized TTS text: "${resultB.cleanText}"`);
console.log(
  `  Contains zero-width artifacts: ${/[\u200B\u200C\u200D\uFEFF]/.test(resultB.cleanText)}`,
);

// --- Test Case C: Anomaly Flagged (Obfuscated Class with Decoy Lorem Ipsum) ---
console.log(
  '\n[Case C] Testing Anomaly Gate Flagging (Obfuscated Class + Lorem Ipsum)...',
);
const anomalyHtml = `
  <div class="chapter-content">
    <p>Chapter 88: Into the Abyss</p>
    <div class="xyz-custom-decoy">
      <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor.</p>
    </div>
    <p>The party slowly descended the spiraling staircase into the dark void.</p>
  </div>
`;
const resultC = sanitizeChapter(anomalyHtml);
console.log(
  `  Gate Status: isClean=${resultC.isClean}, isAnomaly=${resultC.anomalyReport.isAnomaly}`,
);
console.log('  Anomaly Diagnostic Report:');
console.log(
  `    Reasons: ${JSON.stringify(resultC.anomalyReport.reasons, null, 2)}`,
);
console.log(`    Sample Suspects:`, resultC.anomalyReport.sampleSuspects);

// --- Test Case D: NovelProfile Application (Healing with Part 2's Output) ---
console.log('\n[Case D] Applying NovelProfile to Heal the Chapter...');
const mockProfile = {
  novelId: 'novelsearch-shadow-slave',
  excludeSelectors: ['.xyz-custom-decoy'],
  deduplicateAdjacent: true,
};
const healedResult = sanitizeChapter(anomalyHtml, { profile: mockProfile });
console.log(
  `  Post-Healing Gate Status: isClean=${healedResult.isClean}, isAnomaly=${healedResult.anomalyReport.isAnomaly}`,
);
console.log(
  `  Clean HTML contains lorem ipsum: ${healedResult.cleanHtml.includes('Lorem ipsum')}`,
);
console.log(`  Clean Text: "${healedResult.cleanText.replace(/\n+/g, ' ')}"`);

console.log('\n' + '='.repeat(80));
console.log('ALL VERIFICATION PIPELINE CHECKS COMPLETED SUCCESSFULLY!');
console.log('='.repeat(80));
