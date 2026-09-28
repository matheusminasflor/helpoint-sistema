-- O vendedor vê os clientes da carteira dele — quando a empresa liga a chave.
--
-- PEDIDO DO DONO em 2026-09-27: *"O vendedor daquela carteira só pode ver dados dos
-- seus clientes, ter uma opção nas configurações do comercial que quando ativar
-- ocorrer isso, pois a ideia é que no futuro próximo eu consiga colocar todos nossos
-- clientes na Carteira X e em cada carteira atrelar o vendedor daquela carteira."*
--
-- ── ONDE A REGRA MORA: AQUI, NÃO NA TELA ─────────────────────────────────────
--
-- Esconder no front não esconde nada: este sistema fala **direto com o banco**, e
-- quem tem a sessão alcança a tabela pela API. Num sistema com camada de servidor
-- dava para discutir; aqui não.
--
-- E a medição que torna isso viável: das **40 funções `com_*` que leem cliente ou
-- venda, 39 são `security invoker`** (conferido em `pg_proc.prosecdef`). Ou seja, a
-- RLS governa quase tudo — restringir as duas tabelas restringe o painel inteiro, a
-- curva, a tendência, o cashback, sem tocar em nenhuma delas. A única `definer` é
-- `com_conciliacao`, que é a tela do diretor, e diretor vê tudo por decisão.
--
-- ── A CHAVE, E POR QUE ELA É POR EMPRESA ─────────────────────────────────────
--
-- `tenants.settings -> 'comercial' -> 'vendedorSoVeSuaCarteira'`, **desligada por
-- padrão**. Fica em `settings` porque é configuração de negócio de cada empresa, no
-- mesmo lugar das outras — não uma constante de código.
--
-- ── QUEM A RESTRIÇÃO NÃO ALCANÇA, E É DE PROPÓSITO ───────────────────────────
--
-- Gestor para cima (`is_supervisor_or_higher`) e quem tem a Diretoria continuam
-- vendo tudo: é deles a pergunta "como vai a empresa", e uma resposta recortada por
-- carteira seria um total que mente. A restrição vale para o vendedor.
--
-- ── O QUE ACONTECE COM CLIENTE SEM CARTEIRA, DITO EM VOZ ALTA ────────────────
--
-- Cliente sem carteira fica **invisível para o vendedor** com a chave ligada. Não é
-- efeito colateral: é a regra pedida ("só os seus"). Hoje **0 de 450 clientes têm
-- carteira**, então ligar a chave na base de teste faria todo vendedor ver zero — o
-- dono dispensou a preocupação porque a produção começa do zero e vai importar a
-- ficha dos clientes, mas a tela de configuração mostra esse número **ao lado da
-- chave**, para ninguém ligar sem saber. Decidir olhando o número é diferente de
-- descobrir depois.

create or replace function public.com_so_a_minha_carteira()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select (t.settings -> 'comercial' ->> 'vendedorSoVeSuaCarteira')::boolean
       from public.tenants t
      where t.id = public.get_user_tenant_id()),
    false)
  -- Gestor para cima e quem tem a Diretoria ficam de fora da restrição.
  and not public.is_supervisor_or_higher(auth.uid())
  and not public.has_diretoria_access(auth.uid());
$$;

comment on function public.com_so_a_minha_carteira() is
  'A empresa ligou "vendedor so ve a carteira dele" E quem chama e vendedor (nao gestor, nao Diretoria)? Desligada por padrao. 2026-09-27.';

create or replace function public.com_minhas_carteiras()
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(distinct m.carteira), array[]::text[])
    from public.com_carteira_membros m
   where m.user_id = auth.uid()
     and m.tenant_id = public.get_user_tenant_id();
$$;

comment on function public.com_minhas_carteiras() is
  'As carteiras de que quem chama e membro. Array vazio quando nenhuma. 2026-09-27.';

-- As duas são `security definer` e leem `tenants`/`com_carteira_membros` por dentro
-- da policy — regra 14: fecham para `anon` e abrem só para `authenticated`.
revoke all on function public.com_so_a_minha_carteira() from public, anon;
revoke all on function public.com_minhas_carteiras() from public, anon;
grant execute on function public.com_so_a_minha_carteira() to authenticated;
grant execute on function public.com_minhas_carteiras() to authenticated;

-- ── As duas policies ─────────────────────────────────────────────────────────
--
-- A condição nova é um `or` com a negação: **com a chave desligada nada muda**, e é
-- assim que esta migration entra sem mexer no que funciona hoje.
--
-- `(select ...)` em volta das chamadas: o Postgres avalia uma vez por consulta em vez
-- de uma vez por linha — a mesma forma que a policy de `tickets` já usa, e aqui pesa,
-- porque `com_vendas_itens` tem 43 mil linhas.
--
-- E O `coalesce` EM VOLTA DO `any` NÃO É ENFEITE — **não o simplifique.** Escrito
-- `carteira = any ((select public.com_minhas_carteiras()))`, o Postgres lê o
-- `(select ...)` como **subconsulta** e aplica a forma `ANY (subquery)`, que espera
-- linhas do tipo do elemento; a função devolve UMA linha de `text[]`, e o erro é
-- `42883: operator does not exist: text = text[]`. Esta migration levou exatamente
-- isso na primeira tentativa. Envolver em `coalesce(...)` faz o Postgres tratar a
-- expressão como escalar de tipo `text[]`, e aí vale a forma `ANY (array)`. A função
-- já devolve array vazio em vez de nulo — o `coalesce` aqui é pelo PARSER, não pelo
-- nulo.

drop policy if exists "com_clientes_select" on public.com_clientes;
create policy "com_clientes_select" on public.com_clientes
  for select using (
    tenant_id = (select public.get_user_tenant_id())
    and ((select public.has_comercial_access(auth.uid())) or (select public.has_diretoria_access(auth.uid())))
    and (
      not (select public.com_so_a_minha_carteira())
      or carteira = any (coalesce((select public.com_minhas_carteiras()), array[]::text[]))
    )
  );

drop policy if exists "com_vendas_itens_select" on public.com_vendas_itens;
create policy "com_vendas_itens_select" on public.com_vendas_itens
  for select using (
    tenant_id = (select public.get_user_tenant_id())
    and ((select public.has_comercial_access(auth.uid())) or (select public.has_diretoria_access(auth.uid())))
    and (
      not (select public.com_so_a_minha_carteira())
      -- A venda segue a carteira DO CLIENTE dela. `in (subconsulta)` e não `any`: o
      -- Postgres transforma isto num hash de uma vez, e é o que segura as 43 mil
      -- linhas sem uma consulta por linha.
      or cliente_codigo in (
        select c.codigo from public.com_clientes c
         where c.tenant_id = com_vendas_itens.tenant_id
           and c.carteira = any (coalesce((select public.com_minhas_carteiras()), array[]::text[]))
      )
    )
  );
