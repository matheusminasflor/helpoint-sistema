-- A importação de clientes passa a trazer o documento — e nunca apaga o que existe.
--
-- POR QUE (medido em 2026-09-27). Os 450 clientes importados do Forteplus estão
-- **todos sem documento**, e o CSV de clientes do ERP tem 5 colunas
-- (`CODIGO; ATIVO; RAZAOSOCIAL; FANTASIA; TABELA`) — CNPJ não é uma delas. Só que o
-- Forteplus **escreve o documento dentro da razão social** nos clientes pessoa física
-- e MEI, do jeito que a Receita registra:
--
--   EDMAR GONCALVES DA SILVA 04907925611  → CPF completo
--   49.932.013 LILIAN VIEIRA DA SILVA     → raiz do CNPJ, sem /0001-XX
--
-- Contados na base: **120 com CPF no nome, 25 com raiz de CNPJ, 305 sem nada**.
-- A extração acontece no leitor do arquivo (`extrairDocumentoDoNome`, em
-- `src/lib/documento.ts`, com o dígito verificador conferido — é ele que separa CPF
-- de telefone com DDD, que também tem 11 dígitos), e esta função só recebe o
-- resultado. Assim a carga de produção já nasce com documento em vez de depender de
-- alguém digitar 450 depois.
--
-- A REGRA QUE NÃO MUDA: **a importação nunca apaga o que é nosso** (leva G, decisão
-- do dono). O documento é gravado só quando a linha ainda não tem um:
-- `coalesce(public.com_clientes.documento, excluded.documento)`. Documento digitado
-- por gente ganha do extraído por regex, sempre — e esse é o ponto do `coalesce`,
-- não economia de código.
--
-- E o conflito de documento repetido: o índice `com_clientes_documento_unico`
-- (`tenant_id, documento`) recusaria dois clientes com o mesmo CPF. Em vez de a
-- importação inteira morrer por causa de uma linha, o documento é descartado quando
-- já pertence a OUTRO código — e a contagem devolvida diz quantos, para a tela
-- mostrar. Dois códigos com o mesmo documento é caso real (cadastro duplicado no
-- ERP) e quem resolve é gente, não o importador.

create or replace function public.com_importar_clientes(p_file_name text, p_linhas jsonb)
returns jsonb
language plpgsql
set search_path to 'public'
as $function$
declare
  v_tenant_id uuid := public.get_user_tenant_id();
  v_criados int := 0;
  v_atualizados int := 0;
  v_tabelas_alteradas int := 0;
  v_documentos int := 0;
  v_documentos_em_conflito int := 0;
  v_importacao_id uuid;
  v_linha jsonb;
  v_existente public.com_clientes%rowtype;
  v_documento text;
begin
  if v_tenant_id is null then
    raise exception 'Usuário sem empresa associada.';
  end if;

  insert into public.com_vendas_importacoes (tenant_id, tipo, file_name, linhas_lidas)
  values (v_tenant_id, 'clientes', p_file_name, coalesce(jsonb_array_length(p_linhas), 0))
  returning id into v_importacao_id;

  for v_linha in select * from jsonb_array_elements(p_linhas)
  loop
    select * into v_existente
    from public.com_clientes
    where tenant_id = v_tenant_id and codigo = v_linha->>'codigo';

    if not found then
      v_criados := v_criados + 1;
    else
      v_atualizados := v_atualizados + 1;
      if v_existente.tabela_preco is distinct from (v_linha->>'tabela_preco') then
        v_tabelas_alteradas := v_tabelas_alteradas + 1;
        insert into public.com_clientes_tabela_historico (tenant_id, cliente_codigo, tabela_preco, importacao_id)
        values (v_tenant_id, v_linha->>'codigo', v_linha->>'tabela_preco', v_importacao_id);
      end if;
    end if;

    -- O documento extraído do nome, se houver — e se ainda não pertencer a outro
    -- código nesta empresa (senão o índice único derrubaria a importação inteira).
    v_documento := nullif(v_linha->>'documento', '');
    if v_documento is not null and exists (
      select 1 from public.com_clientes outro
       where outro.tenant_id = v_tenant_id
         and outro.documento = v_documento
         and outro.codigo <> (v_linha->>'codigo')
    ) then
      v_documentos_em_conflito := v_documentos_em_conflito + 1;
      v_documento := null;
    elsif v_documento is not null and v_existente.documento is null then
      v_documentos := v_documentos + 1;
    end if;

    insert into public.com_clientes (tenant_id, codigo, razao_social, fantasia, tabela_preco, ativo, origem, documento)
    values (
      v_tenant_id, v_linha->>'codigo', v_linha->>'razao_social', v_linha->>'fantasia',
      v_linha->>'tabela_preco', (v_linha->>'ativo')::boolean, 'cadastro', v_documento
    )
    on conflict (tenant_id, codigo) do update set
      razao_social = excluded.razao_social,
      fantasia = excluded.fantasia,
      tabela_preco = excluded.tabela_preco,
      ativo = excluded.ativo,
      origem = case when public.com_clientes.origem = 'venda' then 'cadastro' else public.com_clientes.origem end,
      -- Nunca apaga: documento que já existe ganha do extraído (leva G).
      documento = coalesce(public.com_clientes.documento, excluded.documento),
      updated_at = now();
  end loop;

  return jsonb_build_object(
    'criados', v_criados,
    'atualizados', v_atualizados,
    'tabelas_alteradas', v_tabelas_alteradas,
    'documentos_preenchidos', v_documentos,
    'documentos_em_conflito', v_documentos_em_conflito
  );
end;
$function$;

-- `create or replace` preserva a ACL (regra 14 do pgTAP), então não há revoke/grant
-- a refazer: a função já era alcançável só por `authenticated`.
