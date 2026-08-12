import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PaymentProvider, Role, TransactionKind } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  MONETIZATION,
  MonetizationCurrency,
  priceFor,
} from './monetization.constants';
import { CheckoutService } from '../payments/checkout.service';

@Injectable()
export class MonetizationService {
  constructor(
    private prisma: PrismaService,
    private checkout: CheckoutService,
  ) {}

  catalog() {
    return {
      products: [
        {
          id: MONETIZATION.eventBoost.id,
          title: MONETIZATION.eventBoost.title,
          description: MONETIZATION.eventBoost.description,
          amountByn: MONETIZATION.eventBoost.amountByn,
          amountRub: MONETIZATION.eventBoost.amountRub,
          durationDays: MONETIZATION.eventBoost.durationDays,
        },
        {
          id: MONETIZATION.organizerPro.id,
          title: MONETIZATION.organizerPro.title,
          description: MONETIZATION.organizerPro.description,
          amountByn: MONETIZATION.organizerPro.amountByn,
          amountRub: MONETIZATION.organizerPro.amountRub,
          durationDays: MONETIZATION.organizerPro.durationDays,
        },
      ],
    };
  }

  private parseCurrency(raw?: string): MonetizationCurrency {
    const c = (raw ?? 'BYN').toUpperCase();
    if (c === 'RUB' || c === 'BYN') return c;
    throw new BadRequestException('currency must be BYN or RUB');
  }

  async createEventBoost(
    userId: string,
    eventId: string,
    currencyRaw?: string,
  ) {
    const currency = this.parseCurrency(currencyRaw);
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundException('Event not found');
    if (event.hostId !== userId) {
      throw new ForbiddenException('Only the event host can promote it');
    }
    const amount = priceFor(MONETIZATION.eventBoost, currency);
    const tx = await this.prisma.transaction.create({
      data: {
        userId,
        eventId,
        amount,
        currency,
        kind: TransactionKind.EVENT_BOOST,
        status: 'PENDING',
        provider: PaymentProvider.MOCK,
        isTestMode: true,
        meta: {
          amountByn: MONETIZATION.eventBoost.amountByn,
          amountRub: MONETIZATION.eventBoost.amountRub,
        },
      },
    });
    return this.checkout.attachCheckout(tx);
  }

  async createOrganizerPro(userId: string, currencyRaw?: string) {
    const currency = this.parseCurrency(currencyRaw);
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (user.role !== Role.PERFORMER && user.role !== Role.ADMIN) {
      throw new BadRequestException('Become an organizer first');
    }
    const amount = priceFor(MONETIZATION.organizerPro, currency);
    const tx = await this.prisma.transaction.create({
      data: {
        userId,
        amount,
        currency,
        kind: TransactionKind.ORGANIZER_PRO,
        status: 'PENDING',
        provider: PaymentProvider.MOCK,
        isTestMode: true,
        meta: {
          amountByn: MONETIZATION.organizerPro.amountByn,
          amountRub: MONETIZATION.organizerPro.amountRub,
        },
      },
    });
    return this.checkout.attachCheckout(tx);
  }
}
