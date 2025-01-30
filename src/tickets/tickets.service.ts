import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { DateTime } from 'luxon';
import {
  findTicketDto,
  findTicketEndingDto,
  findTicketRandomDto,
} from './dto/find-ticket.dto';
import { SupabaseService } from 'src/supabase/supabase.service';
import { selectWinnerDto } from './dto/select-winner.dto';
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
        .eq('sorteo_id', lotteryId)
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
        sorteo_id: lotteryId,
        numero: i,
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
            .eq('sorteo_id', lotteryId)
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
    //const { sorteo_id: lotteryId, numero: number, hash } = firstItem as any;

    const available: findTicketEndingDto[] = [];
    const notAvailable: findTicketEndingDto[] = [];

    for (const ticket of tickets) {
      const { sorteo_id: sorteo_id, numero: numero } = ticket;

      /*if (!hash) {
        throw new HttpException(
          `Hash validation failed. The hash is invalidf or number ${ticket.numero}`,
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
          `Hash validation failed. The hash is invalidf or number ${ticket.numero}`,
          HttpStatus.FORBIDDEN,
        );
      }*/

      if (!sorteo_id || numero === undefined) {
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
          .eq('sorteo_id', sorteo_id)
          .eq('numero', numero)
          .single();

        if (error) {
          console.error(`Error fetching ticket ${numero}`, error);
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
        console.error(`Error processing ticket ${numero}`, error);
        notAvailable.push(ticket); // Considerar no Disponible en caso de error
      }
    }

    return {
      available,
      notAvailable,
    };
  }

  async findTicketEndingWith(findTicketEndingDto: findTicketEndingDto) {
    const {
      sorteo_id: lotteryId,
      numero: number,
      hash: hash,
      cantidad_boletos: cantidad_boletos,
    } = findTicketEndingDto;
    const supabase = this.supabaseService.getClient();

    if (!lotteryId) {
      throw new HttpException(
        'The lottery id is required',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (number === null || number === undefined || isNaN(Number(number))) {
      throw new HttpException(
        'The number is required and should be a number',
        HttpStatus.BAD_REQUEST,
      );
    }

    // Generar el hash esperado
    const hashNonce = process.env.HASH_NONCE || '';
    console.log(
      `sorteo_id=${lotteryId}+numero=${number}+cantidad_boletos=${cantidad_boletos}+nonce=${hashNonce}`,
    );
    const expectedHash = crypto
      .createHash('md5')
      .update(
        `sorteo_id=${lotteryId}+numero=${number}+cantidad_boletos=${cantidad_boletos}+nonce=${hashNonce}`,
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

    try {
      const { count, error } = await supabase
        .from('tickets')
        .select('id', { count: 'exact' }) // Solicita solo el conteo
        .eq('sorteo_id', lotteryId)
        .neq('status', 'Pagado'); // Aplica los filtros

      if (error) {
        console.error('Error fetching ticket count:', error);
      } else {
        console.log('Total tickets:', count); // Imprime el total de tickets
      }
      let pageSize = 1000;
      if (count < pageSize) {
        pageSize = count;
      }
      const pagesNumber = Math.ceil(count / pageSize);
      // console.log(cantidad_boletos); /////////////////////////////////////////////

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
            .eq('sorteo_id', lotteryId)
            .neq('status', 'Pagado')
            .range(from, to),
        );

        from = to + 1;
        to = from + pageSize - 1;

        //console.log(promises.length);  /////////////////////////////////////////////
        // Si ya tenemos 1000 resultados, esperar que se completen todas las promesas
        if (promises.length >= pagesNumber) {
          // Límite a la cantidad de peticiones en paralelo
          const responses = await Promise.all(promises);
          responses.forEach(({ data, error }) => {
            //console.log(data); /////////////////////////////////////////////
            if (error) {
              throw new HttpException(
                'An error occurred while finding the tickets',
                HttpStatus.INTERNAL_SERVER_ERROR,
              );
            }
            if (data) {
              //console.log(data);
              allTickets = allTickets.concat(data);
            }
          });
          console.log(allTickets.length); /////////////////////////////////////////////
          promises = [];
        }

        if (allTickets.length >= count) {
          // Si ya hemos cargado los tickets que necesitamos

          break;
        }
      }

      // Actualizar el status de los tickets expirados
      const currentDate = new Date();
      //console.log(allTickets[9]);
      //console.log(allTickets[9].expiration);
      //console.log(currentDate);
      const expiredTickets = allTickets.filter(
        (ticket) =>
          ticket.status !== 'Pagado' &&
          ticket.expiration &&
          new Date(ticket.expiration) < currentDate,
      );

      /*for (const ticket of expiredTickets) {
        const { data, error } = await supabase
          .from('tickets')
          .update({ status: 'Disponible', expiration: null })
          .eq('id', ticket.id);

        if (error) {
          console.error(`Error updating ticket ${ticket.id}`, error);
        }
      }*/

      // Filtrar los tickets que terminan con el número
      /*const filteredData = allTickets.filter((ticket) => {
        const numberString = ticket.numero.toString();
        return numberString.endsWith(number.toString());
      });*/
      const filteredData = allTickets
        .filter((ticket) => {
          const numberString = ticket.numero.toString();
          //console.log(numberString);
          //console.log(number);
          return (
            numberString.endsWith(number.toString()) && ticket.numero !== number
          );
        })
        .sort((a, b) => a.numero - b.numero);

      /*if (filteredData.length === 0) {
        throw new HttpException(
          'No tickets found for this lottery and number',
          HttpStatus.NOT_FOUND,
        );
       // return filteredData;
      }*/

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
        'The quantity is required and should be a number',
        HttpStatus.BAD_REQUEST,
      );
    }

    // Generar el hash esperado
    const hashNonce = process.env.HASH_NONCE || '';
    const expectedHash = crypto
      .createHash('md5')
      .update(`sorteo_id=${lotteryId}+cantidad=${quantity}+nonce=${hashNonce}`)
      .digest('hex');
    console.log(
      `sorteo_id=${lotteryId}+cantidad=${quantity}+nonce=${hashNonce}`,
    );
    console.log(expectedHash);
    if (hash !== expectedHash) {
      throw new HttpException(
        'Hash validation failed. The hash is invalid.',
        HttpStatus.FORBIDDEN,
      );
    }

    try {
      const { count, error } = await supabase
        .from('tickets')
        .select('id', { count: 'exact' }) // Solicita solo el conteo
        .eq('sorteo_id', lotteryId)
        .eq('status', 'Disponible'); // Aplica los filtros

      if (error) {
        console.error('Error fetching ticket count:', error);
      } else {
        console.log('Total tickets:', count); // Imprime el total de tickets
      }
      let pageSize = 1000;
      if (count < pageSize) {
        pageSize = count;
      }
      const pagesNumber = Math.ceil(count / pageSize);

      //const pageSize = 1000;
      let from = 0;
      let to = pageSize - 1;
      let promises = [];
      let allTickets = [];

      // Obtener tickets en paralelo
      while (true) {
        promises.push(
          supabase
            .from('tickets')
            .select('*')
            .eq('sorteo_id', lotteryId)
            .range(from, to),
        );

        from = to + 1;
        to = from + pageSize - 1;
        console.log(promises.length); /////////////////////////////////////////////
        if (promises.length >= pagesNumber) {
          // Procesar un lote de promesas
          const responses = await Promise.all(promises);
          responses.forEach(({ data, error }) => {
            if (error) {
              throw new HttpException(
                'An error occurred while fetching tickets',
                HttpStatus.INTERNAL_SERVER_ERROR,
              );
            }
            if (data) {
              allTickets = allTickets.concat(data);
            }
          });

          promises = [];
        }

        // Si no hay más tickets en la última consulta, salir del bucle
        if (from > allTickets.length && promises.length === 0) {
          break;
        }
      }

      // Actualizar tickets expirados en paralelo
      (async () => {
        const currentDate = new Date();
        const expiredTickets = allTickets.filter(
          (ticket) =>
            ticket.status !== 'Pagado' &&
            ticket.expiration &&
            new Date(ticket.expiration) < currentDate,
        );

        for (const ticket of expiredTickets) {
          const { error: updateError } = await supabase
            .from('tickets')
            .update({
              status: 'Disponible',
              expiration: null,
              owner: null,
              owner_name: null,
              owner_phone: null,
            })
            .eq('id', ticket.id);

          if (updateError) {
            console.error(`Error updating ticket ${ticket.id}`, updateError);
          }
        }
      })();

      // Filtrar los tickets disponibles
      const availableTickets = allTickets.filter(
        (ticket) => ticket.status === 'Disponible',
      );

      if (availableTickets.length === 0) {
        throw new HttpException(
          'No available tickets found',
          HttpStatus.NOT_FOUND,
        );
      }

      // Mezclar los tickets disponibles y seleccionar aleatoriamente
      const shuffledData = availableTickets
        .sort(() => Math.random() - 0.5)
        .slice(0, quantity);

      // Ordenar los tickets seleccionados por el campo numero de forma ascendente
      const sortedData = shuffledData.sort((a, b) => a.numero - b.numero);

      return { message: 'Tickets found successfully', data: sortedData };
    } catch (error) {
      console.error('Error finding tickets', error);
      throw new HttpException(
        'An error occurred while finding the tickets',
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
        expiration: expiration,
        status,
        owner_phone,
        owner_name,
        hash,
        request_user,
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
        `sorteo_id=${lotteryId}+numero=${number}+owner=${owner}+minutos_expiracion=${expiration}+status=${status}+owner_phone=${owner_phone}+owner_name=${owner_name}+request_user=${request_user}+nonce=${hashNonce}`,
      );

      const expectedHash = crypto
        .createHash('md5')
        .update(
          `sorteo_id=${lotteryId}+numero=${number}+owner=${owner}+minutos_expiracion=${expiration}+status=${status}+owner_phone=${owner_phone}+owner_name=${owner_name}+request_user=${request_user}+nonce=${hashNonce}`,
        )
        .digest('hex');
      console.log(expectedHash);
      if (hash !== expectedHash) {
        throw new HttpException(
          //`Hash validation failed. The hash is invalid in numero ${number}. ####sorteo_id=${lotteryId}+numero=${number}+owner=${owner}+minutos_expiracion=${expiration}+status=${status}+owner_phone=${owner_phone}+owner_name=${owner_name}+nonce=${hashNonce} #####hash ${hash}   ###expected hash ${expectedHash}  `,
          `Hash validation failed. The hash is invalid in numero ${number}. ####sorteo_id=${lotteryId}+numero=${number}+owner=${owner}+minutos_expiracion=${expiration}+status=${status}+owner_phone=${owner_phone}+owner_name=${owner_name}+request_user=${request_user}+nonce=${hashNonce} #####hash ${hash}   ###expected hash ${expectedHash}  `,
          HttpStatus.FORBIDDEN,
        );
      }
    }

    for (const updateTicketDto of updateTicketDtos) {
      const {
        sorteo_id: lotteryId,
        numero: number,
        owner,
        expiration: expiration,
        status,
        owner_name,
        owner_phone,
        request_user,
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

      /* try {
        // Verificar el estado actual del ticket
        const { data: currentData, error: fetchError } = await supabase
          .from('tickets')
          .select('status')
          .eq('sorteo_id', lotteryId)
          .eq('numero', number)
          .single();

        console.log(lotteryId);
        console.log(number);
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
        //  console.log(status);
        // Actualizar el ticket
        const { error: updateError } = await supabase
          .from('tickets')
          .update({
            owner_name,
            owner_phone,
            status,
            owner,
            //expiration: DateTime.local().plus({ minutes: expiration }).toISO(),
            expiration: expiration
              ? DateTime.local()
                  .setZone('local') // Asegura que tenga la zona horaria
                  .plus({ minutes: expiration }) // Suma los minutos
                  .toJSDate() // Devuelve un objeto Date compatible con PostgreSQL
              : null,
          })
          .eq('sorteo_id', lotteryId)
          .eq('numero', number);

        if (updateError) {
          console.error(`Error updating ticket number ${number}`, updateError);
          failedNumbers.push(number);
          continue;
        }

        successUpdates.push(number);
      } catch (error) {
        console.error(`Error processing ticket number ${number}`, error);
        failedNumbers.push(number);
      }*/

      ///////////

      try {
        // Verificar el estado actual del ticket
        const { data: currentData, error: fetchError } = await supabase
          .from('tickets')
          .select('status, expiration, owner, owner_phone')
          .eq('sorteo_id', lotteryId)
          .eq('numero', number)
          .single();

        console.log(lotteryId);
        console.log(number);
        if (fetchError) {
          console.error(`Error fetching ticket number ${number}`, fetchError);
          failedNumbers.push(number);
          continue;
        }

        const ticketStatus = currentData?.status;
        const ticketExpiration = currentData?.expiration
          ? new Date(currentData.expiration)
          : null;
        const ticketOwner = currentData?.owner;
        const ticketOwnerPhone = currentData?.owner_phone;

        // Verificar si el ticket ya está pagado
        if (ticketStatus === 'Pagado') {
          failedNumbers.push(number);
          continue;
        }

        // Nueva validación
        const currentDate = new Date();
        if (
          //status != 'Disponible' &&
          ticketStatus !== 'Disponible' && // Status no es Disponible
          ticketExpiration &&
          ticketExpiration > currentDate && // Expiration no ha pasado
          ((ticketOwner && ticketOwner !== request_user) || // Owner no coincide
            (!ticketOwner && ticketOwnerPhone !== request_user)) // Owner no existe y OwnerPhone no coincide
        ) {
          console.log(ticketOwner && ticketOwner !== owner);
          console.log(!ticketOwner && ticketOwnerPhone !== owner_phone);
          console.log(ticketOwnerPhone);
          console.log(owner_phone);
          console.error(
            `Validation failed for ticket number ${number}: Status not Disponible and expiration valid.`,
          );
          failedNumbers.push(number);
          continue;
        }

        // Actualizar el ticket
        console.log('owner_phone');
        console.log(owner_phone);
        console.log('owner_name');
        console.log(owner_name);
        const { error: updateError } = await supabase
          .from('tickets')
          .update({
            owner_name,
            owner_phone,
            status,
            owner,
            expiration: expiration
              ? DateTime.local()
                  .setZone('local') // Asegura que tenga la zona horaria
                  .plus({ minutes: expiration }) // Suma los minutos
                  .toJSDate() // Devuelve un objeto Date compatible con PostgreSQL
              : null,
          })
          .eq('sorteo_id', lotteryId)
          .eq('numero', number);

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
      ///////////
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
    const { sorteo_id: lotteryId, hash } = findTicketDto;

    const supabase = this.supabaseService.getClient();

    ///
    if (!hash) {
      throw new HttpException(`Hash is required `, HttpStatus.FORBIDDEN);
    }
    const hashNonce = process.env.HASH_NONCE || '';
    console.log(`sorteo_id=${lotteryId}+nonce=${hashNonce}`);

    const expectedHash = crypto
      .createHash('md5')
      .update(`sorteo_id=${lotteryId}+nonce=${hashNonce}`)
      .digest('hex');
    console.log(expectedHash);
    if (hash !== expectedHash) {
      throw new HttpException(`Hash validation failed.`, HttpStatus.FORBIDDEN);
    }

    if (!lotteryId) {
      throw new HttpException(
        'The lottery id is required',
        HttpStatus.BAD_REQUEST,
      );
    }

    const { data, error } = await supabase
      .from('tickets')
      .update({ status: 'Disponible', owner: null, expiration: null })
      .eq('sorteo_id', lotteryId);

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
      .eq('sorteo_id', lotteryId);

    return {
      statusCode: HttpStatus.OK,
      message: 'Tickets deleted successfully',
    };
  }

  async selectWinner(selectWinnerDto: selectWinnerDto) {
    const { sorteo_id: lotteryId, numero, hash } = selectWinnerDto;

    const supabase = this.supabaseService.getClient();

    // Validar el hash
    const hashNonce = process.env.HASH_NONCE || '';
    const expectedHash = crypto
      .createHash('md5')
      .update(`sorteo_id=${lotteryId}+numero=${numero}+nonce=${hashNonce}`)
      .digest('hex');
    console.log(expectedHash);
    if (hash !== expectedHash) {
      throw new HttpException(
        'Hash validation failed. The hash is invalid.',
        HttpStatus.FORBIDDEN,
      );
    }

    // Obtener el ticket con el sorteo_id
    const { data: ticket, error: ticketError } = await supabase
      .from('tickets')
      .select('*')
      .eq('sorteo_id', lotteryId)
      .eq('numero', numero)
      .eq('status', 'Pagado')
      .single();

    if (ticketError || !ticket) {
      throw new HttpException(
        'Ticket not found or not paid.',
        HttpStatus.NOT_FOUND,
      );
    }

    // Obtener datos del sorteo para nombreSorteo y fechaSorteo
    const { data: sorteo, error: sorteoError } = await supabase
      .from('sorteos')
      .select('name, endDate')
      .eq('id', lotteryId)
      .single();

    if (sorteoError || !sorteo) {
      throw new HttpException('Sorteo not found.', HttpStatus.NOT_FOUND);
    }

    let ganadorData: Record<string, any> = {
      ganador: numero,
      NameGanador: null,
      phoneGanador: null,
      userId: null,
      PhotoGanador: null,
    };

    // Validar si el owner está seteado
    if (ticket.owner) {
      // Obtener la información del usuario
      const { data: user } = await supabase
        .from('users')
        .select('*')
        .eq('id', ticket.owner)
        .single();

      // Actualizar datos del ganador con información del usuario (valores null si no se encuentra el usuario)
      ganadorData = {
        ...ganadorData,
        NameGanador: user?.display_name || null,
        phoneGanador: user?.phone_number || null,
        userId: user?.id || null,
        PhotoGanador: user?.photo_url || null,
      };
    } else if (ticket.owner_phone) {
      // Actualizar datos del ganador con información del ticket
      ganadorData = {
        ...ganadorData,
        NameGanador: ticket.owner_name || null,
        phoneGanador: ticket.owner_phone || null,
      };
    }

    // Actualizar el sorteo con los datos del ganador
    const { error: updateError } = await supabase
      .from('sorteos')
      .update({
        ganador: ganadorData.ganador,
        NameGanador: ganadorData.NameGanador,
        phoneGanador: ganadorData.phoneGanador,
        userId: ganadorData.userId,
        PhotoGanador: ganadorData.PhotoGanador,
      })
      .eq('id', lotteryId);

    if (updateError) {
      throw new HttpException(
        'Failed to update lottery data.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    // Crear una nueva fila en la tabla premios
    const { error: premiosError } = await supabase.from('premios').insert([
      {
        sorteo: lotteryId,
        nombreSorteo: sorteo.name, // Usando el nombre del sorteo
        fechaSorteo: sorteo.endDate, // Usando la fecha de fin del sorteo
        boletoGanador: numero,
        boletoComprado: numero,
        GanadorReference: ganadorData.userId || null, // Si existe userId lo asigna
      },
    ]);

    if (premiosError) {
      throw new HttpException(
        'Failed to insert prize data.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    return {
      message: 'Winner selected and prize recorded successfully.',
      data: ganadorData,
    };
  }

  async count(findTicketDto: findTicketDto) {
    const { sorteo_id, hash } = findTicketDto;
    const supabase = this.supabaseService.getClient();

    try {
      if (!sorteo_id) {
        throw new HttpException(
          'The lottery id is required',
          HttpStatus.BAD_REQUEST,
        );
      }

      // Obtener el HASH_NONCE desde variables de entorno
      const hashNonce = process.env.HASH_NONCE || '';

      // Generar el hash esperado
      const expectedHash = crypto
        .createHash('md5')
        .update(`sorteo_id=${sorteo_id}+nonce=${hashNonce}`)
        .digest('hex');

      // Validar el hash recibido
      if (hash !== expectedHash) {
        throw new HttpException('Hash validation failed', HttpStatus.FORBIDDEN);
      }

      // Consulta optimizada: contar boletos con estado "Disponible"
      const { count, error } = await supabase
        .from('tickets')
        .select('*', { count: 'exact', head: true }) // No trae datos, solo cuenta
        .eq('sorteo_id', sorteo_id)
        .eq('status', 'Disponible');

      if (error) {
        throw new HttpException(
          'Error fetching available ticket count',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      return {
        sorteo_id,
        Disponibles: count || 0,
      };
    } catch (error) {
      throw new HttpException(
        'Internal Server Error',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async updateUser(UpdateUserDto: UpdateUserDto) {
    const { userId, updateData, hash } = UpdateUserDto;
    const supabase = this.supabaseService.getClient();
    const hashNonce = process.env.HASH_NONCE || '';

    try {
      if (!userId) {
        throw new HttpException('User ID is required', HttpStatus.BAD_REQUEST);
      }

      if (Object.keys(updateData).length === 0) {
        throw new HttpException(
          'No fields provided for update',
          HttpStatus.BAD_REQUEST,
        );
      }
      console.log(updateData);
      // Convertir updateData a string ordenado alfabéticamente
      const sortedDataString = JSON.stringify(
        Object.fromEntries(Object.entries(updateData).sort()),
      );
      console.log(sortedDataString);

      // Generar el hash esperado
      const expectedHash = crypto
        .createHash('md5')
        .update(
          `userId=${userId}+updateData=${sortedDataString}+nonce=${hashNonce}`,
        )
        .digest('hex');

      console.log(`Expected Hash: ${expectedHash}, Received Hash: ${hash}`);

      // Validar el hash recibido
      if (hash !== expectedHash) {
        throw new HttpException('Hash validation failed', HttpStatus.FORBIDDEN);
      }

      // Actualiza solo los campos enviados en updateData
      const { data, error } = await supabase
        .from('users')
        .update(updateData)
        .eq('id', userId)
        .select();

      if (error) {
        throw new HttpException(
          'Error updating user',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      return { message: 'User updated successfully', user: data };
    } catch (error) {
      throw new HttpException(
        'Internal Server Error',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
