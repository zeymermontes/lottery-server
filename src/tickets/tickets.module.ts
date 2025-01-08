import { Module } from '@nestjs/common';
import { TicketsService } from './tickets.service';
import { TicketsController } from './tickets.controller';
import { SupabaseService } from 'src/supabase/supabase.service';


@Module({
  controllers: [TicketsController],
  providers: [TicketsService, SupabaseService],
})
export class TicketsModule {}
