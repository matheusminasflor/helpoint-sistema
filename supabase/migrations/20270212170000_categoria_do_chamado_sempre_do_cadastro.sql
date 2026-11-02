-- A CATEGORIA DO CHAMADO SAI SEMPRE DO CADASTRO (revisão dos Indicadores da TI, dono, 2026-11-01).
--
-- "Chamados por Categoria" mostrava "Software" com 22 chamados (últimos 30 dias, produção), categoria que não existe
-- mais: a tabela conta pelo nome gravado no chamado (`category`), e esse nome era o que o formulário mandou na abertura.
-- O banco (20270129110000) respeitava o que vinha. Medido: 23 chamados com a categoria principal diferente do cadastro
-- (os 22 "Software" são de Sistemas). Regra nova: havendo `category_id`, o nome e o caminho vêm SEMPRE do cadastro — na
-- abertura e quando o id muda. O id é a verdade; o nome é só o espelho dele.
--
-- ponytail: renomear ou mover uma categoria depois não reescreve os chamados antigos (reescrever dispararia avisos e
-- automações de "categoria mudou"). Saída se voltar a acontecer: repetir o bloco 2 numa migration.

create or replace function public.chamado_nome_da_categoria()
returns trigger language plpgsql set search_path = public as $$
declare
  v_caminho text[];
begin
  if new.category_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.category_id is not distinct from old.category_id then
    return new;
  end if;

  with recursive acima as (
    select c.id, c.name, c.parent_id, 0 as nivel from public.ti_categories c where c.id = new.category_id
    union all
    select p.id, p.name, p.parent_id, a.nivel + 1 from public.ti_categories p join acima a on p.id = a.parent_id
  )
  select array_agg(name order by nivel desc) into v_caminho from acima;

  if v_caminho is null then
    return new;
  end if;
  new.category := v_caminho[1];
  new.subcategory := nullif(array_to_string(v_caminho[2:], ' › '), '');
  return new;
end;
$$;

-- ─── 2. Os chamados que já estão com o nome velho ───────────────────────────────────────────────────
-- Os gatilhos do chamado ficam desligados só nesta transação: corrigir o espelho não é "a categoria mudou" (sem aviso,
-- sem automação, sem mexer em `updated_at`). Quem tentar gravar em `tickets` agora espera o fim da transação.
alter table public.tickets disable trigger user;

with recursive acima as (
  select t.id as ticket_id, c.id, c.name, c.parent_id, 0 as nivel
    from public.tickets t join public.ti_categories c on c.id = t.category_id
  union all
  select a.ticket_id, p.id, p.name, p.parent_id, a.nivel + 1
    from public.ti_categories p join acima a on p.id = a.parent_id
), caminho as (
  select ticket_id, array_agg(name order by nivel desc) as nomes from acima group by ticket_id
)
update public.tickets t
   set category = c.nomes[1], subcategory = nullif(array_to_string(c.nomes[2:], ' › '), '')
  from caminho c
 where c.ticket_id = t.id
   and (t.category is distinct from c.nomes[1]
        or t.subcategory is distinct from nullif(array_to_string(c.nomes[2:], ' › '), ''));

alter table public.tickets enable trigger user;
