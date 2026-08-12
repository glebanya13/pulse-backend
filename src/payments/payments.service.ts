import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PaymentProvider, Prisma, TransactionKind } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePaymentMethodDto } from './dto/create-payment-method.dto';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { MONETIZATION } from '../monetization/monetization.constants';
import { CheckoutService } from './checkout.service';

@Injectable()
export class PaymentsService {
  constructor(
    private prisma: PrismaService,
    private checkout: CheckoutService,
  ) {}

  findMyMethods(userId: string) {
    return this.prisma.paymentMethod.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async addMethod(userId: string, dto: CreatePaymentMethodDto) {
    if (dto.isDefault) {
      await this.prisma.paymentMethod.updateMany({
        where: { userId },
        data: { isDefault: false },
      });
    }
    return this.prisma.paymentMethod.create({
      data: {
        userId,
        type: dto.type,
        cardMask: dto.cardMask,
        isDefault: dto.isDefault ?? false,
      },
    });
  }

  async removeMethod(userId: string, id: string) {
    const method = await this.prisma.paymentMethod.findUnique({
      where: { id },
    });
    if (!method) throw new NotFoundException('Payment method not found');
    if (method.userId !== userId)
      throw new ForbiddenException('Not your payment method');
    await this.prisma.paymentMethod.delete({ where: { id } });
    return { success: true };
  }

  async setDefault(userId: string, id: string) {
    const method = await this.prisma.paymentMethod.findUnique({
      where: { id },
    });
    if (!method) throw new NotFoundException('Payment method not found');
    if (method.userId !== userId)
      throw new ForbiddenException('Not your payment method');
    await this.prisma.paymentMethod.updateMany({
      where: { userId },
      data: { isDefault: false },
    });
    return this.prisma.paymentMethod.update({
      where: { id },
      data: { isDefault: true },
    });
  }

  async createTransaction(
    userId: string,
    eventId: string,
    dto: CreateTransactionDto,
  ) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
    });
    if (!event) throw new NotFoundException('Event not found');

    if (dto.paymentMethodId) {
      const method = await this.prisma.paymentMethod.findUnique({
        where: { id: dto.paymentMethodId },
      });
      if (!method || method.userId !== userId) {
        throw new BadRequestException('Payment method not found');
      }
    }

    const tx = await this.prisma.transaction.create({
      data: {
        userId,
        eventId,
        amount: event.priceAmount ?? 0,
        currency: 'BYN',
        kind: TransactionKind.EVENT_TICKET,
        status: 'PENDING',
        provider: PaymentProvider.MOCK,
        isTestMode: true,
      },
    });
    return this.checkout.attachCheckout(tx);
  }

  async getTransaction(userId: string, id: string) {
    const tx = await this.prisma.transaction.findUnique({ where: { id } });
    if (!tx) throw new NotFoundException('Transaction not found');
    if (tx.userId !== userId)
      throw new ForbiddenException('Not your transaction');
    return tx;
  }

  async simulate(_userId: string, _id: string, _status: 'SUCCESS' | 'FAILED') {
    throw new BadRequestException(
      'In-app mock payments are disabled. Boost and Pro are granted by admin.',
    );
  }

  /** Mark SUCCESS and apply boost / Organizer Pro entitlements (idempotent). */
  async applySuccess(transactionId: string) {
    const tx = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
    });
    if (!tx) throw new NotFoundException('Transaction not found');
    if (tx.status === 'SUCCESS') return tx;
    if (tx.status !== 'PENDING') {
      throw new BadRequestException('Transaction already finalized');
    }

    const now = new Date();
    return this.prisma.$transaction(async (db) => {
      const updated = await db.transaction.update({
        where: { id: transactionId },
        data: { status: 'SUCCESS' },
      });

      if (tx.kind === TransactionKind.EVENT_BOOST && tx.eventId) {
        const event = await db.event.findUnique({ where: { id: tx.eventId } });
        const base =
          event?.boostedUntil && event.boostedUntil > now
            ? event.boostedUntil
            : now;
        const extended = new Date(base);
        extended.setDate(
          extended.getDate() + MONETIZATION.eventBoost.durationDays,
        );
        await db.event.update({
          where: { id: tx.eventId },
          data: { boostedUntil: extended, boostedAt: now },
        });
      }

      if (tx.kind === TransactionKind.ORGANIZER_PRO) {
        const user = await db.user.findUnique({ where: { id: tx.userId } });
        const base =
          user?.organizerProUntil && user.organizerProUntil > now
            ? user.organizerProUntil
            : now;
        const until = new Date(base);
        until.setDate(
          until.getDate() + MONETIZATION.organizerPro.durationDays,
        );
        await db.user.update({
          where: { id: tx.userId },
          data: { organizerProUntil: until },
        });
      }

      return updated;
    });
  }

  /**
   * YooKassa HTTP notification.
   * @see https://yookassa.ru/developers/using-api/webhooks
   */
  async handleYooKassaWebhook(payload: Record<string, unknown>) {
    const event = payload['event'] as string | undefined;
    const object = payload['object'] as
      | {
          id?: string;
          status?: string;
          metadata?: { transactionId?: string };
        }
      | undefined;
    if (!object?.id) return { ok: true, ignored: true };

    const tx =
      (object.metadata?.transactionId
        ? await this.prisma.transaction.findUnique({
            where: { id: object.metadata.transactionId },
          })
        : null) ??
      (await this.prisma.transaction.findFirst({
        where: { externalId: object.id },
      }));

    if (!tx) return { ok: true, ignored: true };

    await this.prisma.transaction.update({
      where: { id: tx.id },
      data: {
        meta: {
          ...((tx.meta as object) ?? {}),
          yookassaEvent: event,
          yookassaStatus: object.status,
        } as Prisma.InputJsonValue,
      },
    });

    if (event === 'payment.succeeded' || object.status === 'succeeded') {
      await this.applySuccess(tx.id);
    } else if (
      event === 'payment.canceled' ||
      object.status === 'canceled'
    ) {
      if (tx.status === 'PENDING') {
        await this.prisma.transaction.update({
          where: { id: tx.id },
          data: { status: 'FAILED' },
        });
      }
    }

    return { ok: true };
  }
}
