-- O chamado da compra passa a ser do módulo Compras.
--
-- PEDIDO DO DONO em 2026-09-28: *"ataca agora, quero o chamado da compra em
-- Compras."* É o que faltava da leva N: as telas saíram do Financeiro, o chamado
-- não — e `compras_solicitacoes.ticket_id` é NOT NULL, então **toda compra tem um
-- chamado por baixo**, que é onde moram a conversa, os anexos e o prazo. Com ele no
-- módulo `financeiro`, a caixa de entrada do Financeiro continuava mostrando as
-- compras: metade da poluição que o dono pediu para tirar.
--
-- ── AS TRÊS PEÇAS, e por que são as três ────────────────────────────────────
--
-- 1. `tickets.module` aceitar `'compras'` — sem isso o insert é recusado;
-- 2. `modulos_de_chamado_visiveis()` mapear a concessão `compras` para o módulo de
--    chamado `compras` — **é esta que decide quem responde**. As policies de SELECT e
--    de UPDATE de `tickets` perguntam a ela; sem o par no mapa, o chamado nasceria
--    num módulo que ninguém alcança, e só o requisitante (`requester_id =
--    auth.uid()`) enxergaria a própria compra. Comprador nenhum aprovaria nada;
-- 3. as categorias `is_purchase` mudarem de módulo — é por elas que o formulário sabe
--    que aquele chamado é uma compra, e elas vivem por módulo.
--
-- ── O QUE ISSO FAZ COM A CAIXA DE ENTRADA DO FINANCEIRO ──────────────────────
--
-- Ela para de mostrar compra **sozinha**, sem eu tocar na tela: `FinTickets` filtra
-- `module = 'financeiro'`, e os chamados de compra deixam de ser desse módulo. O
-- inverso também vale — quem tem só o Financeiro para de ver o chamado da compra, o
-- que combina com a policy de `compras_solicitacoes` que a leva N já tinha fechado.
--
-- ── O QUE NÃO ENTRA, e é decisão do dono ────────────────────────────────────
--
-- `automation_workflows.module` **não** recebe `compras`: automação de compra não foi
-- pedida, e a lista de módulos de automação é a terceira das quatro listas
-- enumeradas do banco (ver `20261110040000`). Quando for pedida, é uma linha ali.

-- ── 1 ───────────────────────────────────────────────────────────────────────
alter table public.tickets drop constraint if exists tickets_module_check;
alter table public.tickets add constraint tickets_module_check
  check (module = any (array[
    'tickets', 'marketing', 'qualidade', 'rh', 'financeiro', 'comercial', 'educacional',
    'compras'
  ]));

-- ── 2 ───────────────────────────────────────────────────────────────────────
-- `create or replace` preserva a ACL (regra 14 do pgTAP): a função continua fechada
-- para `anon`. O corpo é o de `pg_get_functiondef`, com UMA linha nova no mapa.
create or replace function public.modulos_de_chamado_visiveis()
returns text[]
language sql
stable security definer
set search_path to 'public'
as $function$
  with mapa(concessao, modulo_do_chamado) as (values
    ('ti',          'tickets'),
    ('marketing',   'marketing'),
    ('qualidade',   'qualidade'),
    ('rh',          'rh'),
    ('financeiro',  'financeiro'),
    ('comercial',   'comercial'),
    ('educacional', 'educacional'),
    -- 2026-09-28: o chamado da compra virou do módulo Compras. Sem este par, quem
    -- cuida de Compras não veria o chamado que ele mesmo tem de responder.
    ('compras',     'compras')
  ),
  minhas as (
    select coalesce(array_agg(uma.module), array[]::text[]) as concessoes
    from public.user_module_access uma
    where uma.user_id = auth.uid()
  )
  select case
    when 'diretoria' = any (coalesce((select concessoes from minhas), array[]::text[]))
      then (select array_agg(modulo_do_chamado) from mapa)
    else coalesce(
      (select array_agg(m.modulo_do_chamado) from mapa m
        where m.concessao = any (coalesce((select concessoes from minhas), array[]::text[]))),
      array[]::text[])
  end;
$function$;

-- ── 3 ───────────────────────────────────────────────────────────────────────
-- As categorias de compra mudam de módulo, e **os chamados já existentes vão com
-- elas**: chamado que ficasse em `financeiro` apontando para categoria de `compras`
-- seria um órfão — apareceria na caixa errada e sumiria da certa.
--
-- Nenhuma função semeia categoria `is_purchase` (conferido em `pg_proc`), então não há
-- semente para corrigir junto: as que existem foram criadas a dedo.
update public.ti_categories
   set module = 'compras'
 where is_purchase and module = 'financeiro';

update public.tickets t
   set module = 'compras'
 where t.module = 'financeiro'
   and exists (
     select 1 from public.compras_solicitacoes r
      where r.ticket_id = t.id and r.tenant_id = t.tenant_id
   );

-- ── A prova de que não sobrou chamado de compra fora de Compras ──────────────
do $$
declare v_fora int;
begin
  select count(*) into v_fora
    from public.compras_solicitacoes r
    join public.tickets t on t.id = r.ticket_id and t.tenant_id = r.tenant_id
   where t.module <> 'compras';

  if v_fora > 0 then
    raise exception 'ficaram % chamado(s) de compra fora do modulo compras', v_fora;
  end if;
end $$;
