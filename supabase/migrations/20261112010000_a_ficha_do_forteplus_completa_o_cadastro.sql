-- A ficha cadastral do Forteplus completa o cadastro de clientes
--
-- O PROBLEMA. O CSV de clientes × tabela de preço traz cinco campos: código, razão
-- social, fantasia, tabela e ativo. Medido no banco em 2026-09-28, dos 450 clientes
-- da base 144 têm documento (extraído do nome, leva de 2026-09-27) e **zero** têm
-- telefone, e-mail ou endereço. Sem isso o reconhecimento do SAC pelo CNPJ — que o
-- dono pediu e que a migration `20261109020000` entregou — só funciona para 32% da
-- base, e a nota fiscal do go-live não tem endereço para onde ir.
--
-- O "Relatório Geral de Cliente" do Forteplus tem o que falta. Medido no arquivo
-- real, 406 fichas: CNPJ/CPF, ENDEREÇO, CEP, CIDADE e ESTADO em 100%, e-mail em 79%,
-- telefone em 49% (celular em outros 40%). Vendedor e região vêm VAZIOS (1 e 3 de
-- 406) — carteira não vem do Forteplus, quem atribui é a tela do Comercial.
--
-- O QUE ESTA MIGRATION FAZ.
--   1. Três colunas novas em `com_clientes`: `cep`, `cidade`, `estado`. `endereco`,
--      `telefone`, `email` e `documento` já existem.
--   2. A RPC `com_importar_ficha_clientes`, que casa a ficha com a base pela RAZÃO
--      SOCIAL e **só preenche o que está vazio**.
--
-- POR QUE PELA RAZÃO SOCIAL. A ficha NÃO TEM o código do cliente — é o fato que
-- manda aqui. E a razão social é o mesmo texto nos dois relatórios do Forteplus
-- (verificado no banco: 5 de 5 amostras casaram exato, incluindo os nomes com o
-- documento embutido, `26.012.092 PATRICIA ARAUJO PAIVA RIBAS`). Só que 450 clientes
-- têm 440 nomes distintos: dez nomes estão repetidos. Nome repetido é AMBÍGUO, e
-- preencher "o primeiro que aparecer" grava o endereço de um cliente na ficha de
-- outro. A RPC conta esses casos e não toca em nenhum dos dois.
--
-- POR QUE SÓ PREENCHE O VAZIO. O cadastro é editável na tela (`/comercial/clientes`).
-- Se a importação sobrescrevesse, reimportar a ficha antiga apagaria a correção que
-- alguém fez à mão, e sem aviso. `coalesce(atual, novo)` em toda coluna: a ficha é
-- um COMPLEMENTO, não a verdade. É a mesma postura que `com_importar_clientes` já
-- tem para `documento`.
--
-- POR QUE `documento` TEM CONFLITO E AS OUTRAS NÃO. `com_clientes` tem índice único
-- por (tenant_id, documento): dois clientes não podem ter o mesmo CNPJ, e é assim que
-- o SAC reconhece uma pessoa só. Quando a ficha traz um documento que JÁ é de outro
-- código, gravar levantaria 23505 e derrubaria a importação inteira na linha 300.
-- A RPC detecta antes, deixa o documento de fora daquela linha e conta o caso — o
-- resto da ficha (endereço, telefone) entra normalmente.

-- 1. As três colunas que faltam ------------------------------------------------
alter table public.com_clientes
  add column if not exists cep    text,
  add column if not exists cidade text,
  add column if not exists estado text;

comment on column public.com_clientes.cep is
  'CEP em 00000-000. Vem da ficha cadastral do Forteplus ou da tela.';
comment on column public.com_clientes.cidade is
  'Município. Vem da ficha cadastral do Forteplus ou da tela.';
comment on column public.com_clientes.estado is
  'UF em duas letras. Vem da ficha cadastral do Forteplus ou da tela.';

-- A UF tem duas letras maiúsculas ou é nula. Constraint e não validação no front:
-- quem escreve em `com_clientes` é a RPC, a tela e o dia de amanhã — a garantia
-- precisa estar onde os três passam. (Degrau "a plataforma resolve".)
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.com_clientes'::regclass
       and conname = 'com_clientes_estado_uf'
  ) then
    alter table public.com_clientes
      add constraint com_clientes_estado_uf
      check (estado is null or estado ~ '^[A-Z]{2}$');
  end if;
end $$;

-- 2. A ficha é um tipo de importação -------------------------------------------
alter table public.com_vendas_importacoes
  drop constraint if exists com_vendas_importacoes_tipo_check;
alter table public.com_vendas_importacoes
  add constraint com_vendas_importacoes_tipo_check
  check (tipo = any (array['vendas', 'clientes', 'metas', 'ficha']));

-- 3. A RPC ---------------------------------------------------------------------
-- Não é SECURITY DEFINER de propósito: roda como quem chamou, e o RLS de
-- `com_clientes` decide o que pode ser atualizado. Uma importação que escreve com
-- privilégio do dono do banco seria uma porta lateral para o cadastro inteiro.
create or replace function public.com_importar_ficha_clientes(
  p_file_name text,
  p_linhas    jsonb
)
returns jsonb
language plpgsql
set search_path to 'public'
as $$
declare
  v_tenant_id uuid := public.get_user_tenant_id();
  v_importacao_id uuid;
  v_linha jsonb;
  v_nome text;
  v_documento text;
  v_codigo text;
  v_quantos int;
  v_casaram int := 0;
  v_nao_casaram int := 0;
  v_ambiguos int := 0;
  v_preenchidos int := 0;
  v_documentos int := 0;
  v_documentos_em_conflito int := 0;
  v_antes public.com_clientes%rowtype;
  v_afetadas int;
begin
  if v_tenant_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;

  -- O REGISTRO DA IMPORTAÇÃO É GRAVADO NO FIM, com o número já apurado — e isso não
  -- é preferência de estilo. A policy de UPDATE de `com_vendas_importacoes` exige
  -- `status = 'em_andamento'`, e a linha nasce com o default `'concluida'`. Gravar
  -- antes e voltar depois para preencher `itens_gravados` cai na lição 12 do pgTAP:
  -- **UPDATE barrado por policy não levanta erro** — a linha é filtrada, o comando
  -- afeta zero linhas, e o histórico ficaria com "0 itens gravados" para sempre, sem
  -- ninguém saber. A função é uma transação só, então não há meio-caminho a registrar.
  for v_linha in select * from jsonb_array_elements(p_linhas)
  loop
    v_nome := upper(btrim(coalesce(v_linha->>'razao_social', '')));
    if v_nome = '' then
      v_nao_casaram := v_nao_casaram + 1;
      continue;
    end if;

    -- Quantos clientes atendem por este nome? Zero = não está na base; mais de um =
    -- ambíguo, e ambíguo não se adivinha.
    select count(*) into v_quantos
      from public.com_clientes c
     where c.tenant_id = v_tenant_id
       and upper(btrim(c.razao_social)) = v_nome;

    if v_quantos = 0 then
      v_nao_casaram := v_nao_casaram + 1;
      continue;
    end if;
    if v_quantos > 1 then
      v_ambiguos := v_ambiguos + 1;
      continue;
    end if;

    select * into v_antes
      from public.com_clientes c
     where c.tenant_id = v_tenant_id
       and upper(btrim(c.razao_social)) = v_nome;

    v_codigo := v_antes.codigo;
    v_casaram := v_casaram + 1;

    -- O documento só entra se ainda não é de OUTRO código. O índice único por
    -- (tenant_id, documento) existe para o SAC reconhecer uma pessoa só; violá-lo
    -- aqui derrubaria a importação inteira.
    v_documento := nullif(v_linha->>'documento', '');
    if v_documento is not null and exists (
      select 1 from public.com_clientes outro
       where outro.tenant_id = v_tenant_id
         and outro.documento = v_documento
         and outro.codigo <> v_codigo
    ) then
      v_documentos_em_conflito := v_documentos_em_conflito + 1;
      v_documento := null;
    elsif v_documento is not null and v_antes.documento is null then
      v_documentos := v_documentos + 1;
    end if;

    update public.com_clientes c
       set documento = coalesce(c.documento, v_documento),
           endereco  = coalesce(c.endereco,  nullif(v_linha->>'endereco', '')),
           cep       = coalesce(c.cep,       nullif(v_linha->>'cep', '')),
           cidade    = coalesce(c.cidade,    nullif(v_linha->>'cidade', '')),
           estado    = coalesce(c.estado,    upper(nullif(v_linha->>'estado', ''))),
           email     = coalesce(c.email,     nullif(v_linha->>'email', '')),
           telefone  = coalesce(c.telefone,  nullif(v_linha->>'telefone', '')),
           updated_at = now()
     where c.tenant_id = v_tenant_id
       and c.codigo = v_codigo;
    get diagnostics v_afetadas = row_count;

    -- Lição 12 do pgTAP, do lado da RPC: `UPDATE` barrado por policy NÃO levanta
    -- erro — a linha é filtrada e o comando afeta zero linhas. Contar é a única
    -- forma de saber. Sem isto, uma importação sem permissão devolveria
    -- "406 casaram" e não teria gravado nada.
    if v_afetadas = 0 then
      v_casaram := v_casaram - 1;
      v_nao_casaram := v_nao_casaram + 1;
      continue;
    end if;

    -- "Preenchido" é a ficha ter posto algo onde não havia nada. Reimportar a mesma
    -- ficha casa tudo de novo e preenche zero — é isso que o número tem de dizer.
    if (v_antes.endereco is null and nullif(v_linha->>'endereco', '') is not null)
       or (v_antes.cep is null      and nullif(v_linha->>'cep', '') is not null)
       or (v_antes.cidade is null   and nullif(v_linha->>'cidade', '') is not null)
       or (v_antes.estado is null   and nullif(v_linha->>'estado', '') is not null)
       or (v_antes.email is null    and nullif(v_linha->>'email', '') is not null)
       or (v_antes.telefone is null and nullif(v_linha->>'telefone', '') is not null)
       or (v_antes.documento is null and v_documento is not null)
    then
      v_preenchidos := v_preenchidos + 1;
    end if;
  end loop;

  insert into public.com_vendas_importacoes
    (tenant_id, tipo, file_name, linhas_lidas, itens_gravados)
  values (v_tenant_id, 'ficha', p_file_name,
          coalesce(jsonb_array_length(p_linhas), 0), v_casaram)
  -- `returning` de propósito (lição 11): com RETURNING o Postgres aplica a policy de
  -- SELECT já no insert. Se quem chamou não pudesse ler a própria importação, isto
  -- falha aqui em vez de a tela levar 42501 depois.
  returning id into v_importacao_id;

  return jsonb_build_object(
    'casaram', v_casaram,
    'nao_casaram', v_nao_casaram,
    'ambiguos', v_ambiguos,
    'preenchidos', v_preenchidos,
    'documentos_preenchidos', v_documentos,
    'documentos_em_conflito', v_documentos_em_conflito
  );
end;
$$;

-- `create or replace` preserva a ACL, mas esta função é NOVA: nasce com o padrão do
-- schema, que dá `execute` a PUBLIC — e `anon` é público. Fechar é obrigatório (é a
-- lição 14, e `anon_so_nas_portas_publicas.test.sql` reprova se ficar aberta).
revoke all on function public.com_importar_ficha_clientes(text, jsonb) from public, anon;
grant execute on function public.com_importar_ficha_clientes(text, jsonb) to authenticated;

comment on function public.com_importar_ficha_clientes(text, jsonb) is
  'Completa o cadastro de clientes com a ficha cadastral do Forteplus. Casa pela razão '
  'social (a ficha não tem código), só preenche coluna vazia, ignora nome ambíguo e '
  'deixa de fora o documento que já é de outro cliente.';

-- 4. Confere no próprio banco ---------------------------------------------------
do $$
declare
  v_faltando text;
begin
  select string_agg(c, ', ') into v_faltando
    from unnest(array['cep', 'cidade', 'estado']) c
   where not exists (
     select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'com_clientes' and column_name = c
   );
  if v_faltando is not null then
    raise exception 'com_clientes ficou sem as colunas: %', v_faltando;
  end if;

  if not exists (
    select 1 from pg_proc
     where pronamespace = 'public'::regnamespace
       and proname = 'com_importar_ficha_clientes'
       and prokind = 'f'
  ) then
    raise exception 'com_importar_ficha_clientes não foi criada';
  end if;

  -- A função não pode estar alcançável por anon (lição 14).
  if has_function_privilege('anon', 'public.com_importar_ficha_clientes(text, jsonb)', 'execute') then
    raise exception 'com_importar_ficha_clientes ficou executável por anon';
  end if;
end $$;
