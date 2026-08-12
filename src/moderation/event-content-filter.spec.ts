import { scanEventText } from './event-content-filter';

describe('scanEventText', () => {
  it('passes clean nightlife copy', () => {
    const r = scanEventText({
      title: 'Techno night',
      description: 'Open-air у Немиги, live DJ',
      tags: ['Техно', 'Клуб'],
    });
    expect(r.flagged).toBe(false);
  });

  it('flags escort / prostitution stems', () => {
    const r = scanEventText({
      title: 'Эскорт услуги',
      description: 'VIP досуг',
    });
    expect(r.flagged).toBe(true);
    expect(r.matched.length).toBeGreaterThan(0);
  });
});
