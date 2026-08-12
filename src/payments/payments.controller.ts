import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  AuthUser,
} from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { PaymentsService } from './payments.service';
import { CreatePaymentMethodDto } from './dto/create-payment-method.dto';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { SimulateTransactionDto } from './dto/simulate-transaction.dto';

@ApiTags('payments')
@ApiBearerAuth()
@Controller()
export class PaymentsController {
  constructor(private paymentsService: PaymentsService) {}

  @Get('users/me/payment-methods')
  @ApiOperation({
    summary: 'My saved payment methods (mask only, no real card data)',
  })
  findMine(@CurrentUser() user: AuthUser) {
    return this.paymentsService.findMyMethods(user.id);
  }

  @Post('users/me/payment-methods')
  @ApiOperation({ summary: 'Add a payment method' })
  add(@CurrentUser() user: AuthUser, @Body() dto: CreatePaymentMethodDto) {
    return this.paymentsService.addMethod(user.id, dto);
  }

  @Delete('payment-methods/:id')
  @ApiOperation({ summary: 'Remove a payment method (owner only)' })
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.paymentsService.removeMethod(user.id, id);
  }

  @Patch('payment-methods/:id/default')
  @ApiOperation({
    summary: 'Set a payment method as the default one (owner only)',
  })
  setDefault(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.paymentsService.setDefault(user.id, id);
  }

  @Post('events/:eventId/transactions')
  @ApiOperation({
    summary: 'Create a transaction for an event ticket (mock or YooKassa)',
  })
  createTransaction(
    @CurrentUser() user: AuthUser,
    @Param('eventId') eventId: string,
    @Body() dto: CreateTransactionDto,
  ) {
    return this.paymentsService.createTransaction(user.id, eventId, dto);
  }

  @Get('transactions/:id')
  @ApiOperation({ summary: 'Transaction status (for checkout polling)' })
  getOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.paymentsService.getTransaction(user.id, id);
  }

  @Patch('transactions/:id/simulate')
  @ApiOperation({
    summary: 'DEV-only: flip a mock transaction to SUCCESS or FAILED',
  })
  simulate(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: SimulateTransactionDto,
  ) {
    return this.paymentsService.simulate(user.id, id, dto.status);
  }

  @Public()
  @Post('payments/yookassa/webhook')
  @ApiOperation({ summary: 'YooKassa payment notifications' })
  yookassaWebhook(@Body() body: Record<string, unknown>) {
    return this.paymentsService.handleYooKassaWebhook(body);
  }
}
