import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type SmsPilotSuccess = {
  send?: Array<{
    server_id?: string;
    phone?: string;
    price?: string;
    status?: string;
    error?: string;
    error_ru?: string;
  }>;
  error?: { code?: string; description?: string; description_ru?: string };
};

/**
 * SMSPILOT.RU HTTP API-1 (https://smspilot.ru/api.php).
 * Sends OTP SMS; phone must be international digits without "+".
 */
@Injectable()
export class SmsPilotService {
  private readonly logger = new Logger(SmsPilotService.name);

  constructor(private config: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(this.config.get<string>('SMSPILOT_API_KEY')?.trim());
  }

  /**
   * Convert E.164-ish input into SMS Pilot digits (no "+").
   * Accepts any country; soft-normalizes RU/BY trunk prefixes.
   */
  toPilotPhone(phone: string): string {
    let digits = phone.replace(/\D/g, '');
    // BY legacy: 80XXXXXXXXX
    if (digits.startsWith('80') && digits.length === 11) {
      digits = `375${digits.slice(2)}`;
    } else if (digits.startsWith('8') && digits.length === 11) {
      // RU trunk: 8XXXXXXXXXX → 7XXXXXXXXXX
      digits = `7${digits.slice(1)}`;
    }
    if (!/^[1-9]\d{7,14}$/.test(digits)) {
      throw new BadRequestException(
        'Укажите номер в международном формате, например +375… или +7…',
      );
    }
    return digits;
  }

  async send(phone: string, text: string): Promise<void> {
    const apikey = this.config.get<string>('SMSPILOT_API_KEY')?.trim();
    if (!apikey) {
      throw new ServiceUnavailableException('SMS provider is not configured');
    }

    const to = this.toPilotPhone(phone);
    const from = this.config.get<string>('SMSPILOT_FROM')?.trim();

    const body = new URLSearchParams({
      send: text,
      to,
      apikey,
      format: 'json',
    });
    if (from) body.set('from', from);

    let res: Response;
    try {
      res = await fetch('https://smspilot.ru/api.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });
    } catch (err) {
      this.logger.error(`SMS Pilot network error for ${to}`, err);
      throw new ServiceUnavailableException(
        'Не удалось отправить SMS. Попробуйте позже.',
      );
    }

    const raw = await res.text();
    let data: SmsPilotSuccess;
    try {
      data = JSON.parse(raw) as SmsPilotSuccess;
    } catch {
      this.logger.error(`SMS Pilot non-JSON response: ${raw.slice(0, 200)}`);
      throw new ServiceUnavailableException(
        'Не удалось отправить SMS. Попробуйте позже.',
      );
    }

    if (data.error) {
      this.logger.warn(
        `SMS Pilot error ${data.error.code}: ${data.error.description_ru ?? data.error.description}`,
      );
      throw new ServiceUnavailableException(
        data.error.description_ru ||
          data.error.description ||
          'Не удалось отправить SMS',
      );
    }

    const first = data.send?.[0];
    if (first?.error) {
      this.logger.warn(
        `SMS Pilot send error ${first.error}: ${first.error_ru ?? ''}`,
      );
      throw new ServiceUnavailableException(
        first.error_ru || 'Не удалось отправить SMS',
      );
    }

    this.logger.log(
      `SMS sent to ${to} (server_id=${first?.server_id ?? '?'}, price=${first?.price ?? '?'})`,
    );
  }
}
