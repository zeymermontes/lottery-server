import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DateTime } from 'luxon';
import { Ticket } from './entities/ticket.entity';
import {
  findTicketDto,
  findTicketEndingDto,
  findTicketRandomDto,
} from './dto/find-ticket.dto';

@Injectable()
export class TicketsService {
  constructor(
    @InjectRepository(Ticket)
    private ticketRepository: Repository<Ticket>,
  ) {}

  async create(createTicketDto: CreateTicketDto) {
    const {
      cantidad_boletos: numberTickets,
      sorteo_id: lotteryId,
      price,
    } = createTicketDto;

    if (numberTickets > 100000) {
      throw new HttpException(
        'The maximum number of tickets that can be created is 100,000',
        HttpStatus.BAD_REQUEST,
      );
    }

    const BATCH_SIZE = 1000;
    let ticketsBatch: any[] = [];

    try {
      for (let i = 0; i < numberTickets; i++) {
        ticketsBatch.push({
          number: i + 1,
          price,
          lottery_id: lotteryId,
        });
        if (ticketsBatch.length === BATCH_SIZE || i === numberTickets - 1) {
          await this.ticketRepository.save(ticketsBatch);
          ticketsBatch = [];
        }
      }
      return { message: 'tickets added successfully' };
    } catch (error) {
      console.error('Error creating tickets', error);
      throw new HttpException(
        'An error occurred while creating the ticket',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async find(findTicketDto: findTicketDto) {
    const { sorteo_id: lotteryId } = findTicketDto;
    try {
      if (!lotteryId) {
        throw new HttpException(
          'The lottery id is required',
          HttpStatus.BAD_REQUEST,
        );
      }

      const ticktes = await this.ticketRepository.find({
        where: { lottery_id: lotteryId },
      });

      if (!ticktes) {
        throw new HttpException(
          'No tickets found for this lottery',
          HttpStatus.NOT_FOUND,
        );
      }

      return { message: 'tickets found successfully', data: ticktes };
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

    if (!lotteryId) {
      throw new HttpException(
        'The lottery id is required',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (!number || isNaN(Number(number))) {
      throw new HttpException(
        'The number is required and should be number',
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      const tickets = await this.ticketRepository
        .createQueryBuilder('ticket')
        .where('ticket.lottery_id = :lotteryId', { lotteryId })
        .andWhere('ticket.number LIKE :number', { number: `%${number}` })
        .orderBy('ticket.number', 'ASC')
        .execute();

      if (!tickets) {
        throw new HttpException(
          'No tickets found for this lottery and number',
          HttpStatus.NOT_FOUND,
        );
      }

      return { message: 'tickets found successfully', data: tickets };
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
    const disponible = 'disponible';
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
      const tickes = await this.ticketRepository
        .createQueryBuilder('ticket')
        .where('ticket.lottery_id = :lotteryId', { lotteryId })
        .andWhere('ticket.status = :disponible', { disponible })
        .orderBy('RAND()', 'ASC')
        .limit(quantity)
        .getMany();

      if (!tickes) {
        throw new HttpException(
          'No tickets found for this lottery',
          HttpStatus.NOT_FOUND,
        );
      }

      return { message: 'tickets found successfully', data: tickes };
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
      const ticket = await this.ticketRepository.findOneBy({
        lottery_id: lotteryId,
        number,
      });

      if (!ticket) {
        throw new HttpException(
          'No tickets found for this lottery and number',
          HttpStatus.NOT_FOUND,
        );
      }

      ticket.status = status;
      ticket.owner = owner;
      ticket.expiration = new Date(
        DateTime.local().plus({ minutes: expiretionMinuts }).toISO(),
      );

      await this.ticketRepository.save(ticket);

      return { message: 'Ticket updated successfully', ticket: ticket };
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

    if (!lotteryId) {
      throw new HttpException(
        'The lottery id is required',
        HttpStatus.BAD_REQUEST,
      );
    }

    const updatedTickets = await this.ticketRepository
      .createQueryBuilder('ticket')
      .update(Ticket)
      .set({ status: 'disponible' })
      .where('ticket.lottery_id = :lotteryId', { lotteryId })
      .execute();

    return { message: 'Tickets reset successfully', data: updatedTickets };
  }

  async delete(findTicketDto: findTicketDto) {
    const { sorteo_id: lotteryId } = findTicketDto;

    if (!lotteryId) {
      throw new HttpException(
        'The lottery id is required',
        HttpStatus.BAD_REQUEST,
      );
    }

    const deletedTickets = await this.ticketRepository
      .createQueryBuilder('ticket')
      .delete()
      .where('ticket.lottery_id = :lotteryId', { lotteryId })
      .execute();

    return { message: 'Tickets deleted successfully', data: deletedTickets };
  }
}
