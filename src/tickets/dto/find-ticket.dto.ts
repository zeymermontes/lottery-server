export class findTicketDto {
  sorteo_id: string;
  hash: string;
}

export class findTicketEndingDto {
  sorteo_id: string;
  numero: number;
  hash: string;
}

export class findTicketRandomDto {
  sorteo_id: string;
  cantidad: number;
  hash: string;
}
