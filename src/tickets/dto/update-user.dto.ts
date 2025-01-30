export class UpdateUserDto {
  userId: string;
  updateData: Record<string, any>; // Solo los campos que se envíen serán modificados
  hash: string;
}
