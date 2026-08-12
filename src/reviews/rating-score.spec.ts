import { computeOverallScore } from './rating-score';

describe('computeOverallScore', () => {
  it('weights host categories and renormalizes when some are missing', () => {
    // taste 0.25 + atmosphere 0.15 → 80*0.25 + 100*0.15 = 35 / 0.4 = 87.5 → 88
    expect(computeOverallScore({ taste: 80, atmosphere: 100 }, 'HOST')).toBe(
      88,
    );
  });

  it('uses all host weights when full set is provided', () => {
    const scores = {
      taste: 100,
      atmosphere: 100,
      hospitality: 100,
      sociability: 100,
      organization: 100,
      cleanliness: 100,
      matchesDescription: 100,
      vibe: 100,
    };
    expect(computeOverallScore(scores, 'HOST')).toBe(100);
  });

  it('averages guest categories equally', () => {
    expect(
      computeOverallScore({ punctuality: 80, politeness: 100 }, 'GUEST'),
    ).toBe(90);
  });
});
