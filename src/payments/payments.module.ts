import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { CheckoutService } from './checkout.service';
import { YooKassaClient } from './yookassa.client';

@Module({
  controllers: [PaymentsController],
  providers: [PaymentsService, CheckoutService, YooKassaClient],
  exports: [PaymentsService, CheckoutService],
})
export class PaymentsModule {}
