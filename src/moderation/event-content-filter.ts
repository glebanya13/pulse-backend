/**
 * Lightweight keyword scan for nightlife-afisha moderation.
 * False positives are OK — admin reviews PENDING_REVIEW queue.
 */

export type EventTextScanInput = {
  title?: string | null;
  description?: string | null;
  tags?: string[] | null;
  address?: string | null;
};

export type EventTextScanResult = {
  flagged: boolean;
  matched: string[];
};

/** Normalize for matching: lower case, ё→е, collapse spaces. */
export function normalizeModerationText(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Phrases / stems (already lowercase, ё→е).
 * Prefer multi-word / distinctive stems to cut false positives.
 */
const BLOCK_PATTERNS: RegExp[] = [
  /проститут/,
  /путана?\b/,
  /эскорт/,
  /\bescort\b/,
  /интим\s*услуг/,
  /интимны(е|й|х)\s+услуг/,
  /секс\s*услуг/,
  /секс\s*за\s*деньг/,
  /индивидуалк/,
  /call\s*girl/,
  /досуг\s+для\s+мужчин/,
  /vip\s*досуг/,
  /снят[ьи]\s+(девушк|женщин|даму)/,
  /девушк\w*\s+на\s+час/,
  /на\s+час\s+девушк/,
  /массаж\s+с\s+выезд/,
  /эротическ/,
  /стриптиз\s+на\s+дому/,
  /\bonlyfans\b/,
  /продаж\w*\s+тела/,
  /интим\s*встреч/,
  /за\s+деньги\s+на\s+ночь/,
];

export function scanEventText(input: EventTextScanInput): EventTextScanResult {
  const blob = normalizeModerationText(
    [
      input.title ?? '',
      input.description ?? '',
      ...(input.tags ?? []),
      input.address ?? '',
    ].join(' '),
  );
  if (!blob) return { flagged: false, matched: [] };

  const matched: string[] = [];
  for (const re of BLOCK_PATTERNS) {
    const m = blob.match(re);
    if (m?.[0]) {
      const token = m[0].trim();
      if (!matched.includes(token)) matched.push(token);
    }
  }
  return { flagged: matched.length > 0, matched };
}
