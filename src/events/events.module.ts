import { Module } from '@nestjs/common';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { EventsThresholdCronService } from './events-threshold-cron.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { PlacesModule } from '../places/places.module';

@Module({
  imports: [NotificationsModule, PlacesModule],
  controllers: [EventsController],
  providers: [EventsService, EventsThresholdCronService],
  exports: [EventsService],
})
export class EventsModule {}
