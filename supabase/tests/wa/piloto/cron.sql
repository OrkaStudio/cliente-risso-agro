-- Preparado, NO aplicado. Requiere migración, deploy compatible y Vault
-- wa_queue_job_token = secret dedicado WA_QUEUE_JOB_TOKEN (32+ caracteres).
-- Sólo vuelve a despertar trabajo ya recibido; no reintenta estados inciertos.
select cron.schedule('troppero-wa-cola','* * * * *',$job$
  select net.http_post(
    url:='https://voippiczkxbxsreiqiqu.supabase.co/functions/v1/wa-webhook?job=queue',
    headers:=jsonb_build_object('Content-Type','application/json','x-wa-queue-token',
      (select decrypted_secret from vault.decrypted_secrets where name='wa_queue_job_token')),
    body:='{}'::jsonb
  );
$job$);
