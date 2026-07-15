-- ==========================================
-- ARREGLO PUNTUAL: fecha (date) desfasada un día respecto a start_at
-- ==========================================
-- Ejecutar en el SQL Editor de Supabase (alternativa al arreglo vía REST).
--
-- Causa: algunas clases (sobre todo las recurrentes) se guardaron con la columna
-- `date` a MEDIANOCHE hora local. Medianoche en horario de verano español (CEST,
-- UTC+2) equivale a las 22:00 del día ANTERIOR en UTC, así que `date` quedaba un
-- día por detrás de `start_at` (que sí guarda el día local correcto).
--
-- Efecto visible: el modal de solicitudes mostraba un día menos que el calendario.
--
-- La app ya lee la fecha desde start_at (db.js convertClassFromDB), así que esto no
-- es imprescindible para el funcionamiento; solo deja los datos coherentes.
--
-- Transformación: date := día de start_at a las 12:00 UTC (mediodía evita cualquier
-- ambigüedad de zona horaria: su parte de fecha es siempre el día correcto).

UPDATE classes
SET date = date_trunc('day', start_at) + interval '12 hours'
WHERE start_at IS NOT NULL
  AND date::date <> start_at::date;

-- Verificación: debe devolver 0 filas.
-- SELECT id, date, start_at FROM classes
-- WHERE start_at IS NOT NULL AND date::date <> start_at::date;
