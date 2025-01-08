import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { DateTime } from 'luxon';
import {
  findTicketDto,
  findTicketEndingDto,
  findTicketRandomDto,
} from './dto/find-ticket.dto';
import { SupabaseService } from 'src/supabase/supabase.service';

@Injectable()
export class TicketsService {
  constructor(private supabaseService: SupabaseService) {}

  async create(createTicketDto: CreateTicketDto) {
    const {
      cantidad_boletos: numberTickets,
      sorteo_id: lotteryId,
      price,
    } = createTicketDto;

    const supabase = this.supabaseService.getClient();

    if (numberTickets > 100000) {
      throw new HttpException(
        'The maximum number of tickets that can be created is 100,000',
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      const tickets = Array.from({ length: numberTickets }, (_, i) => ({
        lottery_id: lotteryId,
        number: i,
        price,
      }));

      const batchSize = 1000;
      for (let i = 0; i < tickets.length; i += batchSize) {
        const batch = tickets.slice(i, i + batchSize);
        const { error } = await supabase.from('tickets').insert(batch);

        if (error) {
          console.error('Error inserting batch', error);
          throw new HttpException(
            'An error occurred while creating the tickets',
            HttpStatus.INTERNAL_SERVER_ERROR,
          );
        }
      }

      return { message: 'Tickets added successfully' };
    } catch (error) {
      console.error('Error creating tickets', error);
      throw new HttpException(
        'An error occurred while creating the tickets',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async find(findTicketDto: findTicketDto) {
    const { sorteo_id: lotteryId } = findTicketDto;
    const supabase = this.supabaseService.getClient();

    try {
      if (!lotteryId) {
        throw new HttpException(
          'The lottery id is required',
          HttpStatus.BAD_REQUEST,
        );
      }

      const pageSize = 1000; // Aún usando paginación
      const currentPageCount = 100; // Número de páginas que deseas cargar en paralelo
      let allData = [];
      const pageRequests = [];

      for (let i = 0; i < currentPageCount; i++) {
        pageRequests.push(
          supabase
            .from('tickets')
            .select('*')
            .eq('lottery_id', lotteryId)
            .eq('status', 'disponible')
            .range(i * pageSize, (i + 1) * pageSize - 1),
        );
      }

      const responses = await Promise.all(pageRequests);

      responses.forEach((response) => {
        if (response.error) {
          throw new HttpException(
            'An error occurred while fetching tickets',
            HttpStatus.INTERNAL_SERVER_ERROR,
          );
        }
        allData = [...allData, ...response.data];
      });

      return { message: 'Tickets found successfully', data: allData };
    } catch (error) {
      console.error('Error finding tickets', error);
      throw new HttpException(
        'An error occurred while finding the ticket',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async findTicketEndingWith(findTicketEndingDto: findTicketEndingDto) {
    const { sorteo_id: lotteryId, numero: number } = findTicketEndingDto;
    const supabase = this.supabaseService.getClient();

    if (!lotteryId) {
      throw new HttpException(
        'The lottery id is required',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (!number || isNaN(Number(number))) {
      throw new HttpException(
        'The number is required and should be a number',
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      let allTickets = [];
      let from = 0;
      let to = 999;

      while (true) {
        const { data, error, count } = await supabase
          .from('tickets')
          .select('*', { count: 'exact' })
          .eq('lottery_id', lotteryId)
          .eq('status', 'disponible')
          .range(from, to);

        if (error) {
          throw new HttpException(
            'An error occurred while finding the tickets',
            HttpStatus.INTERNAL_SERVER_ERROR,
          );
        }

        if (data.length === 0) {
          break;
        }

        allTickets = allTickets.concat(data);

        from = to + 1;
        to = to + 1000;

        if (allTickets.length >= count) {
          break;
        }
      }

      const filteredData = allTickets.filter((ticket) => {
        const numberString = ticket.number.toString();
        return numberString.endsWith(number.toString());
      });

      if (filteredData.length === 0) {
        throw new HttpException(
          'No tickets found for this lottery and number',
          HttpStatus.NOT_FOUND,
        );
      }

      return { message: 'Tickets found successfully', data: filteredData };
    } catch (error) {
      console.error('Error finding tickets', error);
      throw new HttpException(
        'An error occurred while finding the ticket',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async random(findTicketRandomDto: findTicketRandomDto) {
    const { sorteo_id: lotteryId, cantidad: quantity } = findTicketRandomDto;
    const supabase = this.supabaseService.getClient();
    if (!lotteryId) {
      throw new HttpException(
        'The lottery id is required',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (!quantity || isNaN(Number(quantity))) {
      throw new HttpException(
        'The quantity is required and should be number',
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      const { data, error } = await supabase
        .from('tickets')
        .select('*')
        .eq('lottery_id', lotteryId)
        .eq('status', 'disponible');

      const shuffledData = data
        .sort(() => Math.random() - 0.5)
        .slice(0, quantity);

      return { message: 'tickets found successfully', data: shuffledData };
    } catch (error) {
      console.error('Error finding tickets', error);
      throw new HttpException(
        'An error occurred while finding the ticket',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async update(updateTicketDto: UpdateTicketDto) {
    const {
      sorteo_id: lotteryId,
      numero: number,
      owner,
      minutos_expiracion: expiretionMinuts,
      status,
    } = updateTicketDto;

    const supabase = this.supabaseService.getClient();

    if (!lotteryId) {
      throw new HttpException(
        'The lottery id is required',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (!status || !['disponible', 'pagado', 'proceso'].includes(status)) {
      throw new HttpException(
        'The status is required and should be disponible, pagado or proceso',
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      const { data, error } = await supabase
        .from('tickets')
        .update({
          status,
          owner,
          expiration: DateTime.local()
            .plus({ minutes: expiretionMinuts })
            .toISO(),
        })
        .eq('lottery_id', lotteryId)
        .eq('number', number);

      return { message: 'Ticket updated successfully' };
    } catch (error) {
      console.error('Error updating tickets', error);
      throw new HttpException(
        'An error occurred while updating the ticket',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async reset(findTicketDto: findTicketDto) {
    const { sorteo_id: lotteryId } = findTicketDto;

    const supabase = this.supabaseService.getClient();

    if (!lotteryId) {
      throw new HttpException(
        'The lottery id is required',
        HttpStatus.BAD_REQUEST,
      );
    }

    const { data, error } = await supabase
      .from('tickets')
      .update({ status: 'disponible', owner: null, expiration: null })
      .eq('lottery_id', lotteryId);

    return { message: 'Tickets reset successfully' };
  }

  async delete(findTicketDto: findTicketDto) {
    const { sorteo_id: lotteryId } = findTicketDto;
    const supabase = this.supabaseService.getClient();

    if (!lotteryId) {
      throw new HttpException(
        'The lottery id is required',
        HttpStatus.BAD_REQUEST,
      );
    }

    const { data, error } = await supabase
      .from('tickets')
      .delete()
      .eq('lottery_id', lotteryId);

    return { message: 'Tickets deleted successfully' };
  }
}
