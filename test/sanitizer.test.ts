import assert from 'node:assert';
import test, { describe, it } from 'node:test';
import {
  sanitizeChapter,
  isElementInvisible,
  computeTokenSimilarity,
  scanLoremIpsum,
  calculateSentenceDuplication,
  type NovelProfile,
} from '../src/libs/sanitizer/index.ts';

describe('Part 1: Deterministic Novel DOM Sanitizer & Anomaly Gate', () => {
  describe('1. CSS Invisibility & Honeypot Pruning', () => {
    it('strips elements with display:none, font-size:0, visibility:hidden, and aria-hidden', () => {
      const rawHtml = `
        <div class="chapter-content">
          <p>Arthur drew his legendary sword from the ancient scabbard.</p>
          <p style="display: none;">[HONEYPOT: This paragraph is hidden via display:none]</p>
          <p>The blade glowed with a faint azure luminescence in the crypt.</p>
          <span style="font-size: 0px;">[HONEYPOT: zero-size font anti-scraper trap]</span>
          <div style="visibility: hidden;">[HONEYPOT: visibility hidden]</div>
          <p aria-hidden="true">[HONEYPOT: aria-hidden trap]</p>
          <p class="d-none">[HONEYPOT: d-none class trap]</p>
          <p>Outside the crypt, the thunderous rain continued to pound against the stony cliffside.</p>
        </div>
      `;

      const result = sanitizeChapter(rawHtml);

      assert.strictEqual(
        result.cleanHtml.includes('HONEYPOT'),
        false,
        'All honeypot texts should be removed',
      );
      assert.strictEqual(
        result.cleanHtml.includes('Arthur drew his legendary sword'),
        true,
      );
      assert.strictEqual(
        result.cleanHtml.includes(
          'The blade glowed with a faint azure luminescence',
        ),
        true,
      );
      assert.strictEqual(
        result.cleanHtml.includes('Outside the crypt, the thunderous rain'),
        true,
      );
    });
  });

  describe('2. TTS Fragmented Text Coalescing & Zero-Width Scrubbing', () => {
    it('unwraps fragmented spans and removes zero-width unicode characters', () => {
      // Aggregators chop single sentences across multiple spans to break scrapers and TTS
      const rawHtml = `
        <div class="chapter-body">
          <p>
            <span>"I </span>\u200B<span>will </span>\u200C<span>never </span><span>give </span>\uFEFF<span>up," </span>
            <span>he whispered softly into the midnight wind.</span>
          </p>
        </div>
      `;

      const result = sanitizeChapter(rawHtml);

      // Verify zero-width characters are gone
      assert.strictEqual(
        /[\u200B\u200C\u200D\uFEFF]/.test(result.cleanText),
        false,
      );
      // Verify sentence is cohesive
      assert.strictEqual(
        result.cleanText,
        '"I will never give up," he whispered softly into the midnight wind.',
      );
    });
  });

  describe('3. Sliding-Window Deduplication (Fixes Double-TTS Trap)', () => {
    it('removes adjacent cloned paragraphs caused by scraper injection', () => {
      const rawHtml = `
        <div class="content">
          <p>The Dragon Monarch soared into the heavens, creating a vortex of crimson flames.</p>
          <p>The Dragon Monarch soared into the heavens, creating a vortex of crimson flames.</p>
          <p>Below the peaks, the disciples of the Golden Lotus Sect watched with bated breath.</p>
          <p>Below the peaks, the disciples of the Golden Lotus Sect watched with bated breath.</p>
          <p>A single mistake would cost them the entire mountain sanctuary.</p>
        </div>
      `;

      const result = sanitizeChapter(rawHtml, { deduplicateAdjacent: true });

      // Count occurrences of Dragon Monarch paragraph
      const matchesDragon = result.cleanHtml.match(/Dragon Monarch soared/g);
      assert.strictEqual(
        matchesDragon?.length,
        1,
        'Duplicate paragraph should be pruned to 1',
      );

      const matchesLotus = result.cleanHtml.match(/Golden Lotus Sect/g);
      assert.strictEqual(
        matchesLotus?.length,
        1,
        'Duplicate paragraph should be pruned to 1',
      );

      assert.strictEqual(
        result.cleanHtml.includes('A single mistake would cost them'),
        true,
      );
    });
  });

  describe('4. Anomaly Detection Gate - Lorem Ipsum & Honey-pots', () => {
    it('flags chapters containing decoy Latin filler text', () => {
      const rawHtml = `
        <div class="text-left">
          <p>Chapter 142: The Mysterious Island</p>
          <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.</p>
          <p>Arthur stared at the distant shore through his brass telescope.</p>
        </div>
      `;

      const result = sanitizeChapter(rawHtml);

      assert.strictEqual(result.isClean, false);
      assert.strictEqual(result.anomalyReport.isAnomaly, true);
      assert.strictEqual(
        result.anomalyReport.reasons.some(r => r.includes('Lorem ipsum')),
        true,
        'Should flag lorem ipsum detection reason',
      );
      assert.ok(result.anomalyReport.metrics.loremIpsumHits >= 1);
    });
  });

  describe('5. Anomaly Detection Gate - Double-TTS Duplication Ratio', () => {
    it('flags an anomaly when repeated sentences exceed the threshold', () => {
      // 10 sentences where 5 are duplicates (50% duplication ratio)
      const sentences = [
        'The quick brown fox jumped over the sleeping hound in the sunny meadow.',
        'The quick brown fox jumped over the sleeping hound in the sunny meadow.',
        'The gentle breeze whispered through the tall pine trees on the mountain.',
        'The gentle breeze whispered through the tall pine trees on the mountain.',
        'Deep beneath the earth, ancient crystals pulsed with magical energies.',
        'Deep beneath the earth, ancient crystals pulsed with magical energies.',
        'The weary traveler rested beside the bubbling crystal fountain.',
        'The weary traveler rested beside the bubbling crystal fountain.',
        'Stars emerged one by one across the twilight sky over the tranquil sea.',
        'A solitary bird took flight towards the crimson sunset in silence.',
      ];

      const rawHtml = `<div>${sentences.map(s => `<p>${s}</p>`).join('\n')}</div>`;

      // Disable automatic dedup to simulate a site where deduplication was bypassable
      const result = sanitizeChapter(rawHtml, { deduplicateAdjacent: false });

      assert.strictEqual(result.anomalyReport.isAnomaly, true);
      assert.strictEqual(
        result.anomalyReport.reasons.some(r =>
          r.includes('duplicate sentence ratio'),
        ),
        true,
      );
      assert.ok(result.anomalyReport.metrics.duplicateSentenceRatio >= 0.2);
    });
  });

  describe('6. Novel Profile Application', () => {
    it('strips novel-specific exclude selectors and regex watermarks', () => {
      const rawHtml = `
        <div class="chapter-content">
          <p class="site-watermark">Read novels exclusively at NovelSearch.net for free!</p>
          <p>The grand gates of the royal academy swung open with a resounding thud.</p>
          <div class="novelsearch-trap-box">
            <p>Fake decoy sentence inserted only for this specific novel title.</p>
          </div>
          <p>Hundreds of aspiring cultivators surged forward eagerly.</p>
        </div>
      `;

      const novelProfile: NovelProfile = {
        novelId: 'novelsearch-cultivation-academy',
        domain: 'novelsearch.net',
        excludeSelectors: ['.novelsearch-trap-box'],
        stripRegexes: [
          '(?i)Read novels exclusively at NovelSearch\\.net for free!',
        ],
      };

      const result = sanitizeChapter(rawHtml, { profile: novelProfile });

      assert.strictEqual(
        result.cleanHtml.includes('novelsearch-trap-box'),
        false,
      );
      assert.strictEqual(
        result.cleanHtml.includes('Fake decoy sentence'),
        false,
      );
      assert.strictEqual(
        result.cleanHtml.includes('NovelSearch.net for free'),
        false,
      );
      assert.strictEqual(
        result.cleanHtml.includes('The grand gates of the royal academy'),
        true,
      );
      assert.strictEqual(
        result.cleanHtml.includes('Hundreds of aspiring cultivators'),
        true,
      );
    });
  });

  describe('7. Normal Clean Chapter Passing Gate', () => {
    it('passes standard high-quality novel chapter without any anomaly flags', () => {
      const paragraphs = [
        'The rain had ceased by the time dawn arrived over the northern highlands.',
        'Captain Vane surveyed the tranquil harbor through the morning mist, noting the quiet movement of fishing vessels.',
        'The voyage had been arduous, spanning over three weeks across treacherous eastern waters.',
        'Yet every member of the seasoned crew had survived with morale intact and provisions plentiful.',
        'With a crisp nod to his first mate, the captain gave the signal to drop anchor near the main pier.',
      ];

      const rawHtml = `<div class="reader-content">${paragraphs.map(p => `<p>${p}</p>`).join('')}</div>`;

      const result = sanitizeChapter(rawHtml);

      assert.strictEqual(result.isClean, true);
      assert.strictEqual(result.anomalyReport.isAnomaly, false);
      assert.strictEqual(result.anomalyReport.reasons.length, 0);
    });
  });
});
