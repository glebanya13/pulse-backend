import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';

export interface YooKassaPaymentResult {
  id: string;
  status: string;
  confirmationUrl: string | null;
}

@Injectable()
export class YooKassaClient {
  private readonly logger = new Logger(YooKassaClient.name);

  constructor(private config: ConfigService) {}

  get isConfigured(): boolean {
    return !!(this.shopId && this.secretKey);
  }

  private get shopId() {
    return this.config.get<string>('YOOKASSA_SHOP_ID')?.trim() || '';
  }

  private get secretKey() {
    return this.config.get<string>('YOOKASSA_SECRET_KEY')?.trim() || '';
  }

  private get returnUrl() {
    return (
      this.config.get<string>('YOOKASSA_RETURN_URL')?.trim() ||
      'https://pulse-app.by/payments/return'
    );
  }

  async createPayment(input: {
    amount: number;
    currency: string;
    description: string;
    transactionId: string;
    kind: string;
  }): Promise<YooKassaPaymentResult> {
    const auth = Buffer.from(`${this.shopId}:${this.secretKey}`).toString(
      'base64',
    );
    const idempotenceKey = randomUUID();
    const body = {
      amount: {
        value: input.amount.toFixed(2),
        currency: input.currency,
      },
      capture: true,
      confirmation: {
        type: 'redirect',
        return_url: this.returnUrl,
      },
      description: input.description.slice(0, 128),
      metadata: {
        transactionId: input.transactionId,
        kind: input.kind,
      },
    };

    const res = await fetch('https://api.yookassa.ru/v3/payments', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
        'Idempotence-Key': idempotenceKey,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      this.logger.error(`YooKassa create payment failed: ${res.status} ${text}`);
      throw new Error(`YooKassa error ${res.status}`);
    }

    const data = (await res.json()) as {
      id: string;
      status: string;
      confirmation?: { confirmation_url?: string };
    };

    return {
      id: data.id,
      status: data.status,
      confirmationUrl: data.confirmation?.confirmation_url ?? null,
    };
  }
}
