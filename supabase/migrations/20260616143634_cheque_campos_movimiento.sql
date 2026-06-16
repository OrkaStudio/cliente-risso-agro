-- Echeqs/cheques como entidad de primera clase. ADITIVO: agrega metadata
-- de cheque al movimiento (un cheque ES un movimiento con medio_pago='cheque').
alter table movimiento_financiero
  add column es_echeq boolean not null default false,
  add column cheque_numero text,
  add column cheque_banco text,
  add column contraparte text;  -- emisor (si cobramos) / beneficiario (si pagamos)
