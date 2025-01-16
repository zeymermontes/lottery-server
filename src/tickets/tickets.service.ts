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
import * as crypto from 'crypto';

@Injectable()
export class TicketsService {
  constructor(private supabaseService: SupabaseService) {}

  async create(createTicketDto: CreateTicketDto) {
    const {
      cantidad_boletos: numberTickets,
      sorteo_id: lotteryId,
      price,
      hash,
    } = createTicketDto;
    const supabase = this.supabaseService.getClient();

    // Generar el hash esperado
    const hashNonce = process.env.HASH_NONCE || '';
    console.log(
      `cantidad_boletos=${numberTickets}+sorteo_id=${lotteryId}+price=${price}+nonce=${hashNonce}`,
    );
    const expectedHash = crypto
      .createHash('md5')
      .update(
        `cantidad_boletos=${numberTickets}+sorteo_id=${lotteryId}+price=${price}+nonce=${hashNonce}`,
      )
      .digest('hex');
    console.log(expectedHash);

    // Validar el hash recibido
    if (hash !== expectedHash) {
      throw new HttpException(
        'Hash validation failed. The hash is invalid.',
        HttpStatus.FORBIDDEN,
      );
    }

    if (numberTickets > 100000) {
      throw new HttpException(
        'The maximum number of tickets that can be created is 100,000',
        HttpStatus.BAD_REQUEST,
      );
    }

    //
    try {
      // Verificar si ya existe el sorteo
      const { data: existingTickets, error: fetchError } = await supabase
        .from('tickets')
        .select('id')
        .eq('lottery_id', lotteryId)
        .limit(1); // Solo necesitamos saber si hay uno

      if (fetchError) {
        console.error('Error checking existing tickets', fetchError);
        return { message: 'An error occurred while validating the lottery' };
      }

      if (existingTickets && existingTickets.length > 0) {
        return { message: 'El sorteo ya existe' }; // Respuesta personalizada
      }

      //

      // Lote de boletos a insertar
      const tickets = Array.from({ length: numberTickets }, (_, i) => ({
        lottery_id: lotteryId,
        number: i,
        price,
      }));
      const batchSize = 1000; // Lotes de 1000
      const batchPromises = [];
      // Inserción paralela de lotes
      for (let i = 0; i < tickets.length; i += batchSize) {
        const batch = tickets.slice(i, i + batchSize);
        // Creación de promesas de inserción en paralelo
        batchPromises.push(
          supabase
            .from('tickets')
            .insert(batch)
            .then(({ error }) => {
              if (error) {
                throw new Error(`Error inserting batch: ${error.message}`);
              }
            }),
        );
      }

      // Esperar a que todas las inserciones se completen en paralelo
      await Promise.all(batchPromises);

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
    const { sorteo_id: lotteryId, hash } = findTicketDto;
    const supabase = this.supabaseService.getClient();

    try {
      if (!lotteryId) {
        throw new HttpException(
          'The lottery id is required',
          HttpStatus.BAD_REQUEST,
        );
      }

      // Generar el hash esperado
      const hashNonce = process.env.HASH_NONCE || '';
      console.log(`sorteo_id=${lotteryId}+nonce=${hashNonce}`);
      const expectedHash = crypto
        .createHash('md5')
        .update(`sorteo_id=${lotteryId}+nonce=${hashNonce}`)
        .digest('hex');
      console.log(expectedHash);

      // Validar el hash recibido
      if (hash !== expectedHash) {
        throw new HttpException(
          'Hash validation failed. The hash is invalid.',
          HttpStatus.FORBIDDEN,
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
            .eq('status', 'Disponible')
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

  async findAvailable(tickets: findTicketEndingDto[]) {
    const supabase = this.supabaseService.getClient();

    if (!Array.isArray(tickets) || tickets.length === 0) {
      throw new HttpException(
        'A non-empty list of tickets is required',
        HttpStatus.BAD_REQUEST,
      );
    }

    // Extraer el primer elemento y validar el hash
    const [firstItem, ...rest] = tickets;
    const { sorteo_id: lotteryId, numero: number, hash } = firstItem as any;

    if (!hash) {
      throw new HttpException(
        'Hash validation failed. The hash is invalid.',
        HttpStatus.FORBIDDEN,
      );
    }

    const hashNonce = process.env.HASH_NONCE || '';
    const expectedHash = crypto
      .createHash('md5')
      .update(`numero=${number}+sorteo_id=${lotteryId}+nonce=${hashNonce}`)
      .digest('hex');
    console.log(expectedHash);
    if (hash !== expectedHash) {
      throw new HttpException(
        'Hash validation failed. The hash is invalid.',
        HttpStatus.FORBIDDEN,
      );
    }

    const available: findTicketEndingDto[] = [];
    const notAvailable: findTicketEndingDto[] = [];

    for (const ticket of tickets) {
      const { sorteo_id: lotteryId, numero: number } = ticket;

      if (!lotteryId || number === undefined) {
        throw new HttpException(
          'Each ticket must have a sorteo_id and a numero',
          HttpStatus.BAD_REQUEST,
        );
      }

      try {
        // Consulta el estado del ticket
        const { data, error } = await supabase
          .from('tickets')
          .select('status')
          .eq('lottery_id', lotteryId)
          .eq('number', number)
          .single();

        if (error) {
          console.error(`Error fetching ticket ${number}`, error);
          notAvailable.push(ticket); // Considerar no Disponible en caso de error
          continue;
        }

        // Clasificar según el estado
        if (data?.status === 'Disponible') {
          available.push(ticket);
        } else {
          notAvailable.push(ticket);
        }
      } catch (error) {
        console.error(`Error processing ticket ${number}`, error);
        notAvailable.push(ticket); // Considerar no Disponible en caso de error
      }
    }

    return {
      available,
      notAvailable,
    };
  }

  async findTicketEndingWith(findTicketEndingDto: findTicketEndingDto) {
    const { sorteo_id: lotteryId, numero: number, hash } = findTicketEndingDto;
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

    // Generar el hash esperado
    const hashNonce = process.env.HASH_NONCE || '';
    console.log(`sorteo_id=${lotteryId}+numero=${number}+nonce=${hashNonce}`);
    const expectedHash = crypto
      .createHash('md5')
      .update(`sorteo_id=${lotteryId}+numero=${number}+nonce=${hashNonce}`)
      .digest('hex');
    console.log(expectedHash);

    // Validar el hash recibido
    if (hash !== expectedHash) {
      throw new HttpException(
        'Hash validation failed. The hash is invalid.',
        HttpStatus.FORBIDDEN,
      );
    }

    try {
      const pageSize = 1000;
      let from = 0;
      let to = pageSize - 1;
      let promises = [];
      let allTickets = [];

      // Realizar consultas en paralelo
      while (true) {
        promises.push(
          supabase
            .from('tickets')
            .select('*')
            .eq('lottery_id', lotteryId)
            .eq('status', 'Disponible')
            .range(from, to),
        );

        from = to + 1;
        to = from + pageSize - 1;

        // Si ya tenemos 1000 resultados, esperar que se completen todas las promesas
        if (promises.length >= 10) {
          // Límite a la cantidad de peticiones en paralelo
          const responses = await Promise.all(promises);
          responses.forEach(({ data, error }) => {
            if (error) {
              throw new HttpException(
                'An error occurred while finding the tickets',
                HttpStatus.INTERNAL_SERVER_ERROR,
              );
            }
            if (data) {
              allTickets = allTickets.concat(data);
            }
          });

          promises = [];
        }

        if (allTickets.length >= 100000) {
          // Si ya hemos cargado los tickets que necesitamos
          break;
        }
      }

      // Filtrar los tickets que terminan con el número
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
    const {
      sorteo_id: lotteryId,
      cantidad: quantity,
      hash,
    } = findTicketRandomDto;
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

    // Generar el hash esperado
    const hashNonce = process.env.HASH_NONCE || '';
    console.log(
      `sorteo_id=${lotteryId}+cantidad=${quantity}+nonce=${hashNonce}`,
    );
    const expectedHash = crypto
      .createHash('md5')
      .update(`sorteo_id=${lotteryId}+cantidad=${quantity}+nonce=${hashNonce}`)
      .digest('hex');
    console.log(expectedHash);

    // Validar el hash recibido
    if (hash !== expectedHash) {
      throw new HttpException(
        'Hash validation failed. The hash is invalid.',
        HttpStatus.FORBIDDEN,
      );
    }

    try {
      const { data, error } = await supabase
        .from('tickets')
        .select('*')
        .eq('lottery_id', lotteryId)
        .eq('status', 'Disponible');

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

  async update(updateTicketDtos: UpdateTicketDto[]) {
    const supabase = this.supabaseService.getClient();

    if (!Array.isArray(updateTicketDtos) || updateTicketDtos.length === 0) {
      throw new HttpException(
        'A non-empty list of tickets is required',
        HttpStatus.BAD_REQUEST,
      );
    }

    const failedNumbers: number[] = [];
    const successUpdates: number[] = [];

    for (const updateTicketDto of updateTicketDtos) {
      const {
        sorteo_id: lotteryId,
        numero: number,
        owner,
        minutos_expiracion: expiretionMinuts,
        status,
        hash,
      } = updateTicketDto;

      ///
      if (!hash) {
        throw new HttpException(
          `Hash is required in element numero ${number}`,
          HttpStatus.FORBIDDEN,
        );
      }
      const hashNonce = process.env.HASH_NONCE || '';
      console.log(
        `sorteo_id=${lotteryId}+numero=${number}+owner=${owner}+minutos_expiracion=${expiretionMinuts}+status=${status}+nonce=${hashNonce}`,
      );

      const expectedHash = crypto
        .createHash('md5')
        .update(
          `sorteo_id=${lotteryId}+numero=${number}+owner=${owner}+minutos_expiracion=${expiretionMinuts}+status=${status}+nonce=${hashNonce}`,
        )
        .digest('hex');
      console.log(expectedHash);
      if (hash !== expectedHash) {
        throw new HttpException(
          `Hash validation failed. The hash is invalid in numero ${number}.`,
          HttpStatus.FORBIDDEN,
        );
      }
    }

    for (const updateTicketDto of updateTicketDtos) {
      const {
        sorteo_id: lotteryId,
        numero: number,
        owner,
        minutos_expiracion: expiretionMinuts,
        status,
      } = updateTicketDto;

      if (!lotteryId) {
        throw new HttpException(
          `The lottery id is required for ticket number ${number}`,
          HttpStatus.BAD_REQUEST,
        );
      }

      if (!status || !['Disponible', 'Pagado', 'Proceso'].includes(status)) {
        throw new HttpException(
          `The status is required and should be Disponible, Pagado, or Proceso for ticket number ${number}`,
          HttpStatus.BAD_REQUEST,
        );
      }

      try {
        // Verificar el estado actual del ticket
        const { data: currentData, error: fetchError } = await supabase
          .from('tickets')
          .select('status')
          .eq('lottery_id', lotteryId)
          .eq('number', number)
          .single();

        if (fetchError) {
          console.error(`Error fetching ticket number ${number}`, fetchError);
          failedNumbers.push(number);
          continue;
        }

        if (currentData?.status === 'Pagado') {
          // Si el ticket ya está pagado, agregar a la lista de fallidos
          failedNumbers.push(number);
          continue;
        }

        // Actualizar el ticket
        const { error: updateError } = await supabase
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

        if (updateError) {
          console.error(`Error updating ticket number ${number}`, updateError);
          failedNumbers.push(number);
          continue;
        }

        successUpdates.push(number);
      } catch (error) {
        console.error(`Error processing ticket number ${number}`, error);
        failedNumbers.push(number);
      }
    }

    // Crear el mensaje de respuesta
    let responseMessage = 'Tickets updated successfully';
    if (failedNumbers.length > 0) {
      responseMessage += `, but these tickets were not updated: ${failedNumbers.join(', ')}`;
    }

    return {
      message: responseMessage,
      success: successUpdates,
      failed: failedNumbers,
    };
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
      .update({ status: 'Disponible', owner: null, expiration: null })
      .eq('lottery_id', lotteryId);

    return { message: 'Tickets reset successfully' };
  }

  async delete(findTicketDto: findTicketDto) {
    const { sorteo_id: lotteryId, hash: hash } = findTicketDto;
    const supabase = this.supabaseService.getClient();

    // Generar el hash esperado
    const hashNonce = process.env.HASH_NONCE || '';
    console.log(`sorteo_id=${lotteryId}+nonce=${hashNonce}`);
    const expectedHash = crypto
      .createHash('md5')
      .update(`sorteo_id=${lotteryId}+nonce=${hashNonce}`)
      .digest('hex');
    console.log(expectedHash);

    // Validar el hash recibido
    if (hash !== expectedHash) {
      throw new HttpException(
        'Hash validation failed. The hash is invalid.',
        HttpStatus.FORBIDDEN,
      );
    }

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

    return {
      statusCode: HttpStatus.OK,
      message: 'Tickets deleted successfully',
    };
  }
}
