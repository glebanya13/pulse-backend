import { Injectable, Logger } from '@nestjs/common';
import { PaymentProvider, Transaction } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { YooKassaClient } from './yookassa.client';

@Injectable()
export class CheckoutService {
  private readonly logger = new Logger(CheckoutService.name);

  constructor(
    private prisma: PrismaService,
    private yookassa: YooKassaClient,
  ) {}

  /**
   * Attach provider payment to a PENDING transaction.
   * Without YOOKASSA_* keys stays MOCK (client may simulate SUCCESS).
   */
  async attachCheckout(tx: Transaction): Promise<Transaction> {
    if (!this.yookassa.isConfigured) {
      return this.prisma.transaction.update({
        where: { id: tx.id },
        data: {
          provider: PaymentProvider.MOCK,
          isTestMode: true,
        },
      });
    }

    // YooKassa settles RUB. Always charge the RUB catalog amount.
    const meta = (tx.meta as { amountRub?: number } | null) ?? {};
    const amount = meta.amountRub ?? tx.amount;
    const currency = 'RUB';

    try {
      const payment = await this.yookassa.createPayment({
        amount,
        currency,
        description: `Pulse ${tx.kind} ${tx.id.slice(0, 8)}`,
        transactionId: tx.id,
        kind: tx.kind,
      });

      return this.prisma.transaction.update({
        where: { id: tx.id },
        data: {
          provider: PaymentProvider.YOOKASSA,
          isTestMode: false,
          externalId: payment.id,
          confirmationUrl: payment.confirmationUrl,
          meta: {
            ...((tx.meta as object) ?? {}),
            yookassaStatus: payment.status,
          },
        },
      });
    } catch (err) {
      this.logger.warn(
        `YooKassa checkout failed, falling back to MOCK: ${String(err)}`,
      );
      return this.prisma.transaction.update({
        where: { id: tx.id },
        data: {
          provider: PaymentProvider.MOCK,
          isTestMode: true,
          meta: {
            ...((tx.meta as object) ?? {}),
            checkoutError: String(err),
          },
        },
      });
    }
  }
}
