-- APLICAR SÓLO TRAS AUTORIZACIÓN de la migración y publicar wa-resumen-semanal.
-- Vault debe tener wa_weekly_job_token (igual al secret WA_WEEKLY_JOB_TOKEN).
-- Empieza sábado 12:00 UTC = 09:00 Argentina. Los minutos siguientes sólo
-- reintentan preparación; enviado/enviando/incierto jamás se repiten automáticamente.
select cron.schedule('wa-resumen-semanal','*/10 12 * * 6', $job$
  select net.http_post(
    url:='https://voippiczkxbxsreiqiqu.supabase.co/functions/v1/wa-resumen-semanal',
    headers:=jsonb_build_object('Content-Type','application/json','Authorization',
      'Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='wa_weekly_job_token')),
    body:='{}'::jsonb, timeout_milliseconds:=180000
  )
$job$);
