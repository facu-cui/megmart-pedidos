// Datos de tu proyecto de Supabase.
// Los encontrás en Supabase → Project Settings → API.
// La "anon key" es pública a propósito: lo que protege los datos es el login
// y los permisos del archivo supabase.sql.
export const SUPABASE_URL = 'https://qfqevswzbfgyjpukskte.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_LS31z5vIUYU_ZojEOZeQsg_j3U8HnEv';

// Cuántos días se guardan las fotos. Después se borran solas.
export const DIAS_GUARDADO = 30;

// Hora (0 a 23) en que empieza cada turno. La app elige sola el turno según la hora.
// Ajustalo a los horarios reales del local.
export const HORARIOS = { Apertura: 6, Medio: 12, Cierre: 18 };

// Hora en que "cambia el día" en la app. Con 5, lo cargado a la 1 AM en el Cierre
// sigue contando como el día anterior.
export const INICIO_DIA = 5;
