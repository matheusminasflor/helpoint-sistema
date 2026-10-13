-- JORNAL: NOTÍCIA QUE SE REPETE (dono, 2026-10-13).
--
-- "Automatizar posts, repetir se necessário, duplicar." Decisões (múltipla escolha, as recomendadas):
--   * cada repetição é uma NOTÍCIA NOVA (cópia), com a sua data — o histórico mostra cada vez que saiu;
--   * toda semana, todo mês ou todo ano, com data opcional para parar;
--   * a cópia entra no ar sozinha — por isso ligar a repetição pede a caixinha "Publicar e despublicar";
--   * duplicar é da tela (copia os arquivos de verdade; o banco não copia arquivo).
--
-- A cópia usa a MESMA capa da original (o caminho não é único) e mostra os anexos da original
-- (`repeticao_de`): o caminho de anexo é único e arquivo não se copia em SQL.
-- ponytail: excluída ou despublicada a original, as cópias perdem os anexos e quem só lê perde a capa (o
-- balde libera o arquivo pela pasta da original). Saída, se pesar: copiar os arquivos numa edge function.

alter table public.jornal_noticias
  add column if not exists repetir text check (repetir in ('semanal', 'mensal', 'anual')),
  add column if not exists repetir_ate date,
  add column if not exists proxima_repeticao date,
  add column if not exists repeticao_de uuid references public.jornal_noticias (id) on delete set null;

create index if not exists jornal_noticias_repetir_idx on public.jornal_noticias (proxima_repeticao) where repetir is not null;

-- A primeira data base + k × intervalo (k ≥ 1) que cai em `desde` ou depois. Sempre a partir da base,
-- para "todo mês no dia 31" não escorregar para 28 depois de fevereiro.
create or replace function public.jornal_proxima(p_base date, p_repetir text, p_desde date)
returns date language plpgsql immutable set search_path = public as $$
declare
  v_passo interval := case p_repetir when 'semanal' then interval '7 days' when 'mensal' then interval '1 month'
                                     when 'anual' then interval '1 year' end;
  k int := 1;
begin
  if v_passo is null then return null; end if;
  while (p_base + k * v_passo)::date < p_desde loop k := k + 1; end loop;
  return (p_base + k * v_passo)::date;
end;
$$;
revoke all on function public.jornal_proxima(date, text, date) from public, anon;
grant execute on function public.jornal_proxima(date, text, date) to authenticated;

-- Ligar, mudar ou desligar a repetição pede "Publicar e despublicar" (as cópias entram no ar sozinhas).
-- E é aqui que nasce a próxima data.
create or replace function public.jornal_repeticao_guarda()
returns trigger language plpgsql set search_path = public as $$
begin
  if pg_trigger_depth() <= 1 and current_user = 'authenticated'
     and (new.repetir, new.repetir_ate) is distinct from
         (case when tg_op = 'UPDATE' then old.repetir end, case when tg_op = 'UPDATE' then old.repetir_ate end)
     and not public.pode_no_jornal('publish') then
    raise exception 'Repetir a notícia pede a caixinha "Publicar e despublicar" do Jornal: as repetições entram no ar sozinhas.'
      using errcode = '42501';
  end if;
  if new.repetir is not null and new.repeticao_de is not null then
    raise exception 'A repetição é da notícia original, não da cópia.' using errcode = '22023';
  end if;
  new.proxima_repeticao := case when new.repetir is null then null
    else public.jornal_proxima(new.data_noticia, new.repetir, (now() at time zone 'America/Sao_Paulo')::date) end;
  return new;
end;
$$;
revoke all on function public.jornal_repeticao_guarda() from public, anon, authenticated;
drop trigger if exists trg_jornal_repeticao_guarda on public.jornal_noticias;
create trigger trg_jornal_repeticao_guarda before insert or update of repetir, repetir_ate, data_noticia on public.jornal_noticias
  for each row execute function public.jornal_repeticao_guarda();

-- O relógio: todo dia, cada original publicada cuja próxima data chegou ganha UMA cópia publicada (se o
-- relógio parou uns dias, sai só a mais recente, não uma enxurrada) e a próxima data anda.
create or replace function public.jornal_repetir()
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  n public.jornal_noticias%rowtype;
  v_dia date;
  v_feitas int := 0;
begin
  for n in select * from public.jornal_noticias
            where repetir is not null and status = 'publicada' and proxima_repeticao <= v_hoje
            for update skip locked loop
    -- A ocorrência mais recente até hoje.
    v_dia := n.proxima_repeticao;
    while public.jornal_proxima(n.data_noticia, n.repetir, v_dia + 1) <= v_hoje loop
      v_dia := public.jornal_proxima(n.data_noticia, n.repetir, v_dia + 1);
    end loop;
    if n.repetir_ate is null or v_dia <= n.repetir_ate then
      insert into public.jornal_noticias (
        tenant_id, titulo, texto, tipo, data_noticia, exibir_de, exibir_ate, destaque, status, capa_caminho,
        autor_id, publicada_em, repeticao_de
      ) values (
        n.tenant_id, n.titulo, n.texto, n.tipo, v_dia, v_dia,
        -- O mesmo tempo na tela inicial que a original tinha.
        case when n.exibir_ate is not null then v_dia + (n.exibir_ate - coalesce(n.exibir_de, n.data_noticia)) end,
        n.destaque, 'publicada', n.capa_caminho, n.autor_id, now(), n.id
      );
      v_feitas := v_feitas + 1;
    end if;
    update public.jornal_noticias set proxima_repeticao = public.jornal_proxima(n.data_noticia, n.repetir, v_hoje + 1)
     where id = n.id;
  end loop;
  return v_feitas;
end;
$$;
revoke all on function public.jornal_repetir() from public, anon, authenticated;

-- 06:00 no Brasil (09:00 UTC): a cópia do dia já está no ar quando a empresa abre.
select cron.unschedule('jornal-repetir') where exists (select 1 from cron.job where jobname = 'jornal-repetir');
select cron.schedule('jornal-repetir', '0 9 * * *', $cron$select public.jornal_repetir()$cron$);
