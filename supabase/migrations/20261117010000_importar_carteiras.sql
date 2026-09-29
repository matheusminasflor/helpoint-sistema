-- Importação inicial das carteiras comerciais, a partir da planilha que a equipe usava fora do
-- sistema ("CARTEIRAS ATUAL — DE-MG-SP"). Pedido do dono em 2026-09-29.
--
-- A PERGUNTA DO DONO: como importar isso uma vez sem entrar em conflito, depois, com as importações
-- do Forteplus (vendas, curva ABC, pedidos, cadastro)?
--
-- A RESPOSTA, medida nas funções: as importações do Forteplus NUNCA escrevem carteira nem grupo.
-- `com_importar_clientes` atualiza razão social, fantasia, tabela, ativo e documento (este só se
-- vazio); `com_importar_ficha_clientes` só preenche contato vazio; as de vendas só gravam vendas.
-- Carteira, grupo e vendedora responsável são do Helpoint. Esta função escreve SÓ esses três, e o
-- elo é o código do Forteplus (único por empresa). Ela não cria cliente e não traz número de venda.
--
-- As decisões do dono que moram aqui:
--   * "o sistema manda": a carteira só é gravada em cliente que está SEM carteira. Quem já tem outra
--     aparece como divergência e não muda — a planilha nunca desfaz um ajuste feito pelas telas;
--   * grupo só é gravado onde está vazio, pelo mesmo motivo;
--   * código repetido não entra (a tela já tira os conflitos; aqui é a segunda porta).
--
-- Duas passadas com o mesmo corpo: `p_confirmar = false` calcula a prévia sem gravar nada; `true`
-- grava, numa transação só. Os números da prévia são os da gravação, porque é a mesma conta.
create or replace function public.com_importar_carteiras(p_carteiras jsonb, p_confirmar boolean default false)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_tenant uuid := public.get_user_tenant_id();
  v_item jsonb;
  v_cliente jsonb;
  v_nome text;
  v_codigos text[];
  v_todos text[] := array[]::text[];
  v_responsavel uuid;
  v_membro public.com_carteira_membros%rowtype;
  v_outro_responsavel uuid;
  v_situacao_resp text;
  v_entram int;
  v_ja_estavam int;
  v_grupos int;
  v_divergentes jsonb;
  v_nao_encontrados jsonb;
  v_resultado jsonb := '[]'::jsonb;
begin
  if v_tenant is null or not public.com_pode_gerir_carteiras() then
    raise exception 'Só quem gere as carteiras do Comercial importa carteiras.' using errcode = '42501';
  end if;

  -- Código repetido no envio: recusa tudo, em vez de escolher um.
  select coalesce(array_agg(c), array[]::text[]) into v_todos
    from jsonb_array_elements(coalesce(p_carteiras, '[]'::jsonb)) i,
         jsonb_array_elements(i -> 'clientes') cl,
         jsonb_array_elements_text(cl -> 'codigos') c;
  if (select count(*) <> count(distinct x) from unnest(v_todos) x) then
    raise exception 'Há código de cliente repetido na importação; resolva os conflitos antes.' using errcode = '22023';
  end if;

  for v_item in select * from jsonb_array_elements(coalesce(p_carteiras, '[]'::jsonb)) loop
    -- O nome, normalizado e com as renomeações que a Diretoria já registrou (VIP → ESPECIAL).
    v_nome := nullif(public.normalizar_nome_carteira(v_item ->> 'carteira'), '');
    if v_nome is null then
      raise exception 'Carteira sem nome.' using errcode = '22023';
    end if;
    select coalesce((select r.para from public.com_carteira_renomeacoes r
                      where r.tenant_id = v_tenant and r.de = v_nome), v_nome) into v_nome;

    select coalesce(array_agg(c), array[]::text[]) into v_codigos
      from jsonb_array_elements(v_item -> 'clientes') cl, jsonb_array_elements_text(cl -> 'codigos') c;

    select count(*) filter (where c.carteira is null),
           count(*) filter (where c.carteira = v_nome),
           coalesce(jsonb_agg(jsonb_build_object('codigo', c.codigo, 'nome', c.razao_social, 'carteira', c.carteira))
                      filter (where c.carteira is not null and c.carteira <> v_nome), '[]'::jsonb)
      into v_entram, v_ja_estavam, v_divergentes
      from public.com_clientes c
     where c.tenant_id = v_tenant and c.codigo = any (v_codigos);

    select coalesce(jsonb_agg(x), '[]'::jsonb) into v_nao_encontrados
      from unnest(v_codigos) x
     where not exists (select 1 from public.com_clientes c where c.tenant_id = v_tenant and c.codigo = x);

    -- Grupos: linha com mais de um código. O nome do grupo é o nome da linha da planilha.
    select count(*) into v_grupos
      from jsonb_array_elements(v_item -> 'clientes') cl
     where jsonb_array_length(cl -> 'codigos') > 1
       and exists (select 1 from public.com_clientes c
                    where c.tenant_id = v_tenant and c.grupo is null
                      and c.codigo in (select jsonb_array_elements_text(cl -> 'codigos')));

    -- A vendedora responsável: uma pessoa está em UMA carteira só, e a carteira tem UM responsável
    -- (restrições que já existem em `com_carteira_membros`). Nada é movido: o que não cabe é dito.
    v_responsavel := nullif(v_item ->> 'responsavel', '')::uuid;
    v_situacao_resp := null;
    if v_responsavel is not null then
      select * into v_membro from public.com_carteira_membros m
       where m.tenant_id = v_tenant and m.user_id = v_responsavel;
      select m.user_id into v_outro_responsavel from public.com_carteira_membros m
       where m.tenant_id = v_tenant and m.carteira = v_nome and m.responsavel and m.user_id <> v_responsavel;
      v_situacao_resp := case
        when v_membro.id is not null and v_membro.carteira <> v_nome then 'em_outra_carteira:' || v_membro.carteira
        when v_outro_responsavel is not null then 'carteira_ja_tem_responsavel'
        when v_membro.id is not null and v_membro.responsavel then 'ja_era'
        else 'definido'
      end;
    end if;

    if p_confirmar then
      update public.com_clientes c set carteira = v_nome, updated_at = now()
       where c.tenant_id = v_tenant and c.codigo = any (v_codigos) and c.carteira is null;

      update public.com_clientes c set grupo = cl ->> 'nome', updated_at = now()
        from jsonb_array_elements(v_item -> 'clientes') cl
       where jsonb_array_length(cl -> 'codigos') > 1
         and c.tenant_id = v_tenant and c.grupo is null
         and c.codigo in (select jsonb_array_elements_text(cl -> 'codigos'));

      if v_situacao_resp = 'definido' then
        if v_membro.id is null then
          insert into public.com_carteira_membros (tenant_id, user_id, carteira, responsavel)
          values (v_tenant, v_responsavel, v_nome, true);
        else
          update public.com_carteira_membros set responsavel = true where id = v_membro.id;
        end if;
      end if;
    end if;

    v_resultado := v_resultado || jsonb_build_object(
      'carteira', v_nome,
      'entram', v_entram,
      'ja_estavam', v_ja_estavam,
      'divergentes', v_divergentes,
      'nao_encontrados', v_nao_encontrados,
      'grupos', v_grupos,
      'responsavel', v_situacao_resp
    );
  end loop;

  return jsonb_build_object('confirmado', p_confirmar, 'carteiras', v_resultado);
end;
$$;

revoke all on function public.com_importar_carteiras(jsonb, boolean) from public, anon;
grant execute on function public.com_importar_carteiras(jsonb, boolean) to authenticated;

do $$
begin
  if has_function_privilege('anon', 'public.com_importar_carteiras(jsonb, boolean)', 'execute') then
    raise exception 'com_importar_carteiras aberta para anon';
  end if;
end $$;
