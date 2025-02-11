import { Controller, Post, Body, Patch, Delete, Req } from '@nestjs/common';
import { TicketsService } from './tickets.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import {
  findTicketDto,
  findTicketEndingDto,
  findTicketRandomDto,
} from './dto/find-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { selectWinnerDto } from './dto/select-winner.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateCompraDto } from './dto/update-compras.dto';
import { DeleteCompraDto } from './dto/update-compras.dto';
import { Request } from 'express';

@Controller('tickets')
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Post('/create')
  create(@Body() createTicketDto: CreateTicketDto, @Req() req: Request) {
    return this.ticketsService.create(createTicketDto, req);
  }

  @Post('/all-tickets')
  allTickets(@Body() findTicketDto: findTicketDto, @Req() req: Request) {
    return this.ticketsService.allTickets(findTicketDto, req);
  }

  @Post('/find')
  find(@Body() findTicketDto: findTicketDto, @Req() req: Request) {
    return this.ticketsService.find(findTicketDto, req);
  }

  @Post('/findAvailable')
  findAvailable(
    @Body() findTicketEndingDto: findTicketEndingDto[],
    @Req() req: Request,
  ) {
    return this.ticketsService.findAvailable(findTicketEndingDto, req);
  }

  @Post('/end-with')
  findOne(
    @Body() findTicketEndingDto: findTicketEndingDto,
    @Req() req: Request,
  ) {
    return this.ticketsService.findTicketEndingWith(findTicketEndingDto, req);
  }

  @Post('/random')
  update(
    @Body() findTicketRandomDto: findTicketRandomDto,
    @Req() req: Request,
  ) {
    return this.ticketsService.random(findTicketRandomDto, req);
  }

  @Patch('/update')
  remove(@Body() updateTicketDto: UpdateTicketDto[], @Req() req: Request) {
    return this.ticketsService.update(updateTicketDto, req);
  }

  @Post('/reset')
  reset(@Body() findTicketDto: findTicketDto, @Req() req: Request) {
    return this.ticketsService.reset(findTicketDto, req);
  }

  @Post('/delete')
  delete(@Body() findTicketDto: findTicketDto, @Req() req: Request) {
    return this.ticketsService.delete(findTicketDto, req);
  }

  @Post('/winner')
  winner(@Body() selectWinnerDto: selectWinnerDto, @Req() req: Request) {
    return this.ticketsService.selectWinner(selectWinnerDto, req);
  }

  @Post('/count')
  count(@Body() findTicketDto: findTicketDto, @Req() req: Request) {
    return this.ticketsService.count(findTicketDto, req);
  }

  @Post('/update-user')
  updateUser(@Body() UpdateUserDto: UpdateUserDto, @Req() req: Request) {
    return this.ticketsService.updateUser(UpdateUserDto, req);
  }

  @Post('/update-compra')
  updateCompra(@Body() UpdateCompraDto: UpdateCompraDto, @Req() req: Request) {
    return this.ticketsService.updateCompra(UpdateCompraDto, req);
  }

  @Post('/delete-compra')
  deleteCompra(@Body() DeleteCompraDto: DeleteCompraDto, @Req() req: Request) {
    return this.ticketsService.deleteCompra(DeleteCompraDto, req);
  }

  @Post('/create-compra')
  createCompra(@Body() UpdateCompraDto: UpdateCompraDto, @Req() req: Request) {
    return this.ticketsService.createCompra(UpdateCompraDto, req);
  }
}
