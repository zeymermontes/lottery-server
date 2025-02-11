import { Injectable } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Request } from 'express';

@Injectable()
export class SupabaseService {
  private supabase: SupabaseClient;

  constructor() {}

  // Método para configurar el cliente de Supabase basado en el parámetro "entorno"
  setClient(req: Request): SupabaseClient {
    // Obtener el parámetro 'entorno' de la solicitud
    const entorno = req.body.entorno;

    let supabaseUrl: string;
    let supabaseKey: string;

    // Verifica si el entorno es "stage" o "produccion"
    if (entorno === 'stage') {
      // Configuración de Stage
      supabaseUrl = process.env.SUPABASE_URL_STAGE;
      supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY_STAGE;
    } else if (entorno === 'produccion') {
      // Configuración de Producción
      supabaseUrl = process.env.SUPABASE_URL_PROD;
      supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY_PROD;
    } else {
      throw new Error('Entorno desconocido');
    }

    if (!supabaseUrl || !supabaseKey) {
      throw new Error(
        'Supabase credentials are not set in environment variables.',
      );
    }

    // Crear el cliente de Supabase con la URL y la clave seleccionadas
    this.supabase = createClient(supabaseUrl, supabaseKey);
    return this.supabase;
  }

  // Método para obtener el cliente de Supabase
  getClient(req: Request): SupabaseClient {
    return this.setClient(req);
  }
}