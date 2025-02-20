export class UpdateCompraDto {
  compraId: string;
  updateData: Record<string, any>; // Solo los campos que se envíen serán modificados
  hash: string;
}

export class DeleteCompraDto {
  compraId: string;
  hash: string;
}
