-- O MODELO ÚNICO DE CLIENTES. 2026-10-01.
--
-- O cadastro do cliente entrava por três importações, em três telas, cada uma com um pedaço do
-- mesmo cliente: CLIENTESXTABELA (código, ativo, razão, fantasia, tabela), a ficha do Forteplus
-- (CNPJ, endereço, CEP, cidade, UF, e-mail, telefone) e o modelo de carteiras (carteira, grupo). O
-- dono não sabia o que importar primeiro e decidiu: **um modelo só** — baixar, preencher, importar.
--
-- A REGRA (decisão dele): **a planilha muda**. Valor preenchido e diferente substitui o do sistema;
-- célula vazia não mexe em nada; a prévia lista quem muda, campo a campo, antes de gravar. É a regra
-- que ele já tinha escolhido para as carteiras, agora em todos os campos — inclusive o documento,
-- que a importação antiga só preenchia quando estava vazio.
--
-- O que continua igual, e por isso é reusado em vez de reescrito:
--   * tabela mudada grava `com_clientes_tabela_historico` (como `com_importar_clientes`);
--   * documento que já é de OUTRO código fica de fora e é listado (o índice único o recusaria);
--   * carteira, grupo e vendedora responsável passam por `com_importar_carteiras` — a mesma conta,
--     a mesma trava (`com_pode_gerir_carteiras`). Sem essa permissão, as colunas CARTEIRA e GRUPO são
--     ignoradas e o resultado avisa.
--
-- Envio: p_linhas = [{codigo, ativo?, razao_social?, fantasia?, tabela_preco?, documento?, endereco?,
-- cep?, cidade?, estado?, email?, telefone?, carteira?, grupo?}] (a tela manda só o que está
-- preenchido); p_responsaveis = [{carteira, responsavel}].
create or replace function public.com_importar_modelo_de_clientes(
  p_file_name text,
  p_linhas jsonb,
  p_responsaveis jsonb default '[]'::jsonb,
  p_confirmar boolean default false
)
returns jsonb
language plpgsql
set search_path to 'public'
as $$
declare
  v_tenant uuid := public.get_user_tenant_id();
  v_gere boolean := public.com_pode_gerir_carteiras();
  v_importacao_id uuid;
  v_linha jsonb;
  v_codigo text;
  v_antes public.com_clientes%rowtype;
  v_existe boolean;
  v_doc text;
  v_carteira text;
  v_campos jsonb;
  v_novos jsonb := '[]'::jsonb;
  v_mudam jsonb := '[]'::jsonb;
  v_sem_razao jsonb := '[]'::jsonb;
  v_doc_conflito jsonb := '[]'::jsonb;
  v_tabelas int := 0;
  v_envio_carteiras jsonb;
  v_carteiras jsonb := '[]'::jsonb;
  v_ignorou_carteiras boolean := false;
begin
  if v_tenant is null
     or not (public.is_admin_or_higher(auth.uid())
             or public.tem_permissao(auth.uid(), 'comercial', 'vendas', 'importar')) then
    raise exception 'Só quem importa vendas importa o cadastro de clientes.' using errcode = '42501';
  end if;

  if (select count(*) <> count(distinct btrim(l ->> 'codigo'))
        from jsonb_array_elements(coalesce(p_linhas, '[]'::jsonb)) l) then
    raise exception 'Há código de cliente repetido no arquivo; resolva antes de importar.' using errcode = '22023';
  end if;

  if p_confirmar then
    insert into public.com_vendas_importacoes (tenant_id, tipo, file_name, linhas_lidas)
    values (v_tenant, 'clientes', p_file_name, coalesce(jsonb_array_length(p_linhas), 0))
    returning id into v_importacao_id;
  end if;

  for v_linha in select * from jsonb_array_elements(coalesce(p_linhas, '[]'::jsonb)) loop
    v_codigo := nullif(btrim(v_linha ->> 'codigo'), '');
    continue when v_codigo is null;

    select * into v_antes from public.com_clientes c where c.tenant_id = v_tenant and c.codigo = v_codigo;
    v_existe := found;

    if not v_existe and nullif(btrim(v_linha ->> 'razao_social'), '') is null then
      v_sem_razao := v_sem_razao || to_jsonb(v_codigo);
      continue;
    end if;

    v_doc := nullif(btrim(v_linha ->> 'documento'), '');
    if v_doc is not null and exists (
      select 1 from public.com_clientes o
       where o.tenant_id = v_tenant and o.documento = v_doc and o.codigo <> v_codigo
    ) then
      v_doc_conflito := v_doc_conflito || to_jsonb(v_codigo);
      v_doc := null;
    end if;

    v_carteira := null;
    if nullif(btrim(v_linha ->> 'carteira'), '') is not null then
      if v_gere then
        v_carteira := public.normalizar_nome_carteira(v_linha ->> 'carteira');
        select coalesce((select r.para from public.com_carteira_renomeacoes r
                          where r.tenant_id = v_tenant and r.de = v_carteira), v_carteira) into v_carteira;
      else
        v_ignorou_carteiras := true;
      end if;
    end if;

    -- Campo a campo: só o que veio preenchido e é diferente do que está gravado.
    select coalesce(jsonb_agg(jsonb_build_object('campo', x.campo, 'de', x.de, 'para', x.para)), '[]'::jsonb)
      into v_campos
      from (values
        ('ativo',        v_antes.ativo::text,   nullif(btrim(v_linha ->> 'ativo'), '')),
        ('razao_social', v_antes.razao_social,  nullif(btrim(v_linha ->> 'razao_social'), '')),
        ('fantasia',     v_antes.fantasia,      nullif(btrim(v_linha ->> 'fantasia'), '')),
        ('tabela_preco', v_antes.tabela_preco,  nullif(btrim(v_linha ->> 'tabela_preco'), '')),
        ('documento',    v_antes.documento,     v_doc),
        ('endereco',     v_antes.endereco,      nullif(btrim(v_linha ->> 'endereco'), '')),
        ('cep',          v_antes.cep,           nullif(btrim(v_linha ->> 'cep'), '')),
        ('cidade',       v_antes.cidade,        nullif(btrim(v_linha ->> 'cidade'), '')),
        ('estado',       v_antes.estado,        upper(nullif(btrim(v_linha ->> 'estado'), ''))),
        ('email',        v_antes.email,         nullif(btrim(v_linha ->> 'email'), '')),
        ('telefone',     v_antes.telefone,      nullif(btrim(v_linha ->> 'telefone'), '')),
        ('carteira',     v_antes.carteira,      v_carteira),
        ('grupo',        v_antes.grupo,         case when v_gere then nullif(btrim(v_linha ->> 'grupo'), '') end)
      ) x(campo, de, para)
     where x.para is not null and x.para is distinct from x.de;

    if not v_existe then
      v_novos := v_novos || jsonb_build_object('codigo', v_codigo, 'nome', btrim(v_linha ->> 'razao_social'));
    elsif jsonb_array_length(v_campos) > 0 then
      v_mudam := v_mudam || jsonb_build_object('codigo', v_codigo, 'nome', v_antes.razao_social, 'campos', v_campos);
    end if;

    if v_existe and exists (select 1 from jsonb_array_elements(v_campos) c where c ->> 'campo' = 'tabela_preco') then
      v_tabelas := v_tabelas + 1;
    end if;

    if p_confirmar then
      if v_existe then
        if exists (select 1 from jsonb_array_elements(v_campos) c where c ->> 'campo' = 'tabela_preco') then
          insert into public.com_clientes_tabela_historico (tenant_id, cliente_codigo, tabela_preco, importacao_id)
          values (v_tenant, v_codigo, btrim(v_linha ->> 'tabela_preco'), v_importacao_id);
        end if;
        update public.com_clientes c set
          ativo        = coalesce(nullif(btrim(v_linha ->> 'ativo'), '')::boolean, c.ativo),
          razao_social = coalesce(nullif(btrim(v_linha ->> 'razao_social'), ''), c.razao_social),
          fantasia     = coalesce(nullif(btrim(v_linha ->> 'fantasia'), ''), c.fantasia),
          tabela_preco = coalesce(nullif(btrim(v_linha ->> 'tabela_preco'), ''), c.tabela_preco),
          documento    = coalesce(v_doc, c.documento),
          endereco     = coalesce(nullif(btrim(v_linha ->> 'endereco'), ''), c.endereco),
          cep          = coalesce(nullif(btrim(v_linha ->> 'cep'), ''), c.cep),
          cidade       = coalesce(nullif(btrim(v_linha ->> 'cidade'), ''), c.cidade),
          estado       = coalesce(upper(nullif(btrim(v_linha ->> 'estado'), '')), c.estado),
          email        = coalesce(nullif(btrim(v_linha ->> 'email'), ''), c.email),
          telefone     = coalesce(nullif(btrim(v_linha ->> 'telefone'), ''), c.telefone),
          origem       = case when c.origem = 'venda' then 'cadastro' else c.origem end,
          updated_at   = now()
         where c.tenant_id = v_tenant and c.codigo = v_codigo;
      else
        insert into public.com_clientes (tenant_id, codigo, razao_social, fantasia, tabela_preco, ativo, origem,
                                         documento, endereco, cep, cidade, estado, email, telefone)
        values (v_tenant, v_codigo, btrim(v_linha ->> 'razao_social'), nullif(btrim(v_linha ->> 'fantasia'), ''),
                nullif(btrim(v_linha ->> 'tabela_preco'), ''),
                coalesce(nullif(btrim(v_linha ->> 'ativo'), '')::boolean, true), 'cadastro',
                v_doc, nullif(btrim(v_linha ->> 'endereco'), ''), nullif(btrim(v_linha ->> 'cep'), ''),
                nullif(btrim(v_linha ->> 'cidade'), ''), upper(nullif(btrim(v_linha ->> 'estado'), '')),
                nullif(btrim(v_linha ->> 'email'), ''), nullif(btrim(v_linha ->> 'telefone'), ''));
      end if;
    end if;
  end loop;

  -- Carteira, grupo e vendedora responsável: a mesma função de antes, com os clientes já gravados
  -- (na prévia, cliente novo ainda não existe e ela o conta como "não encontrado" — a tela ignora).
  if v_gere then
    select coalesce(jsonb_agg(jsonb_build_object(
             'carteira', g.carteira,
             'responsavel', (select r ->> 'responsavel' from jsonb_array_elements(coalesce(p_responsaveis, '[]'::jsonb)) r
                              where public.normalizar_nome_carteira(r ->> 'carteira') = g.carteira limit 1),
             'clientes', g.clientes)), '[]'::jsonb)
      into v_envio_carteiras
      from (
        select public.normalizar_nome_carteira(l ->> 'carteira') as carteira,
               jsonb_agg(jsonb_build_object('codigo', btrim(l ->> 'codigo'), 'nome', l ->> 'razao_social',
                                            'grupo', nullif(btrim(l ->> 'grupo'), ''))) as clientes
          from jsonb_array_elements(coalesce(p_linhas, '[]'::jsonb)) l
         where nullif(btrim(l ->> 'carteira'), '') is not null
           and not (v_sem_razao ? btrim(l ->> 'codigo'))
         group by 1
      ) g;
    if jsonb_array_length(v_envio_carteiras) > 0 then
      v_carteiras := public.com_importar_carteiras(v_envio_carteiras, p_confirmar) -> 'carteiras';
    end if;
  end if;

  return jsonb_build_object(
    'confirmado', p_confirmar,
    'novos', v_novos,
    'mudam', v_mudam,
    'sem_razao', v_sem_razao,
    'documentos_em_conflito', v_doc_conflito,
    'tabelas_alteradas', v_tabelas,
    'carteiras', v_carteiras,
    'carteiras_ignoradas', v_ignorou_carteiras
  );
end;
$$;

comment on function public.com_importar_modelo_de_clientes(text, jsonb, jsonb, boolean) is
  'O modelo único de clientes (cadastro + tabela + ficha + carteira). A planilha muda; vazio não mexe; p_confirmar=false é a prévia.';

revoke all on function public.com_importar_modelo_de_clientes(text, jsonb, jsonb, boolean) from public, anon;
grant execute on function public.com_importar_modelo_de_clientes(text, jsonb, jsonb, boolean) to authenticated;
