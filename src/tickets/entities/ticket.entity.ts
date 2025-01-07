import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class Ticket {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ default: 'disponible' })
  status: string;

  @Column({ default: null, nullable: true })
  number: number;

  @Column({ default: null, nullable: true })
  owner: string;

  @Column({ default: null, nullable: true })
  owner_name: string;

  @Column({ default: null, nullable: true })
  owner_phone: string;

  @Column({
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
    onUpdate: 'CURRENT_TIMESTAMP',
  })
  expiration: Date;

  @Column({ default: null, nullable: true })
  price: number;

  @Column({ default: null, nullable: true })
  compnay_id: string;

  @Column({ default: null, nullable: true })
  lottery_id: string;
}
