/** Catalog prices (integer major units, same as Event.priceAmount). */
export const MONETIZATION = {
  eventBoost: {
    id: 'event_boost',
    title: 'Продвижение события',
    description: '7 дней в топе афиши «Сегодня» и ленты',
    amountByn: 15,
    amountRub: 450,
    durationDays: 7,
  },
  organizerPro: {
    id: 'organizer_pro',
    title: 'Organizer Pro',
    description: 'Бейдж Pro и приоритет событий в выдаче на 30 дней',
    amountByn: 29,
    amountRub: 890,
    durationDays: 30,
  },
} as const;

export type MonetizationCurrency = 'BYN' | 'RUB';

export function priceFor(
  product: { amountByn: number; amountRub: number },
  currency: MonetizationCurrency,
): number {
  return currency === 'RUB' ? product.amountRub : product.amountByn;
}
