-- Campanha, evento, treinamento e reunião podem ser com alguém da empresa, no lugar do cliente (dono, 2026-11-05).
-- Todo lançamento novo tem de dizer com quem foi: um cliente, ou uma pessoa da empresa nessas ações.
alter table public.com_interacoes
  add column pessoa_interna_id uuid references public.profiles(id) on delete set null;
alter table public.com_indicadores
  add column aceita_pessoa_interna boolean not null default false;

update public.com_indicadores set aceita_pessoa_interna = true
 where tipo = 'acao' and nome in ('Campanhas', 'Eventos', 'Evento PCF', 'Treinamento semanal com distribuidores');

-- O catálogo só tinha reunião técnica, que é indicador e exige cliente.
insert into public.com_indicadores (tenant_id, tipo, nome, ordem, aceita_pessoa_interna)
select t.tenant_id, 'acao', 'Reunião interna', t.ordem + 1, true
  from (select tenant_id, max(ordem) as ordem from public.com_indicadores where tipo = 'acao' group by tenant_id) t
 where not exists (select 1 from public.com_indicadores i where i.tenant_id = t.tenant_id and i.nome = 'Reunião interna');

create or replace function pg_temp.troca(p_funcao regprocedure, p_de text, p_para text)
returns void language plpgsql as $$
declare
  v_def text := pg_get_functiondef(p_funcao);
begin
  if position(p_de in v_def) = 0 then
    raise exception 'trecho não encontrado em %: %', p_funcao, left(p_de, 80);
  end if;
  execute replace(v_def, p_de, p_para);
end;
$$;

select pg_temp.troca('public.com_salvar_interacao(uuid, jsonb, uuid[])'::regprocedure,
$$  v_filial text := upper(nullif(btrim(p_dados ->> 'nota_filial'), ''));
begin$$,
$$  v_filial text := upper(nullif(btrim(p_dados ->> 'nota_filial'), ''));
  v_cliente text := nullif(btrim(p_dados ->> 'cliente_codigo'), '');
  v_pessoa uuid := nullif(p_dados ->> 'pessoa_interna_id', '')::uuid;
begin$$);

select pg_temp.troca('public.com_salvar_interacao(uuid, jsonb, uuid[])'::regprocedure,
$$    if nullif(btrim(p_dados ->> 'cliente_codigo'), '') is null then
      raise exception 'Escolha o cliente: todo lançamento precisa de um cliente.' using errcode = '23514';
    end if;
    insert into public.com_interacoes
      (cliente_codigo, data, status, valor_venda, nota_fiscal, nota_em, nota_filial, prazo, observacoes, fora_da_carteira)
    values (
      nullif(btrim(p_dados ->> 'cliente_codigo'), ''),$$,
$$    if v_cliente is not null then
      v_pessoa := null;
    elsif v_pessoa is null then
      raise exception 'Escolha o cliente ou a pessoa da empresa.' using errcode = '23514';
    elsif not exists (select 1 from public.profiles p where p.id = v_pessoa and p.tenant_id = public.get_user_tenant_id() and p.is_active) then
      raise exception 'Pessoa da empresa não encontrada.' using errcode = '23514';
    elsif cardinality(v_marcas) = 0 or exists (
      select 1 from unnest(v_marcas) m
        left join public.com_indicadores i on i.id = m
       where not coalesce(i.aceita_pessoa_interna, false)) then
      raise exception 'Com pessoa da empresa, marque só campanha, evento, treinamento ou reunião interna.' using errcode = '23514';
    end if;
    insert into public.com_interacoes
      (cliente_codigo, pessoa_interna_id, data, status, valor_venda, nota_fiscal, nota_em, nota_filial, prazo, observacoes, fora_da_carteira)
    values (
      v_cliente, v_pessoa,$$);
