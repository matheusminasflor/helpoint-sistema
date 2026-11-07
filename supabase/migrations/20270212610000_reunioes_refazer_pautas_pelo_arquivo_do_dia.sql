-- O evento repetido do Google acumula os anexos de todas as semanas, e o robô pegava o primeiro: um encontro podia
-- mostrar a pauta de outro. Agora o arquivo do encontro vem do Drive, pelo nome e pela data. Esta marca faz o robô reler
-- as reuniões importadas, sem mandar aviso de novo: a data antiga é diferente de qualquer arquivo real.
update public.reunioes set documento_em = '1970-01-01' where documento_em is not null;
