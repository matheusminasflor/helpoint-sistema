-- O MODELO de planilha das carteiras (LEVA R, 2026-09-29). Substitui o corpo de
-- `com_importar_carteiras` (20261117010000); a assinatura e a ACL ficam (create or replace).
--
-- O dono: "uma template padrão que baixamos, colocamos os dados e importamos — e baixar a relação
-- de todos os clientes no mesmo formato: baixo os 450, coloco a qual carteira pertence e importo".
--
-- O QUE MUDA NA REGRA. A importação da LEVA Q lia a planilha antiga da equipe e "o sistema
-- mandava": só preenchia quem estava sem carteira. Agora o arquivo sai do próprio sistema, com a
-- carteira atual de cada cliente; se a pessoa trocou o valor, trocou de propósito. Decisão do dono
-- (2026-09-29): **a planilha muda**, e a prévia mostra quem muda, de onde para onde, antes de gravar.
-- Célula de carteira vazia não chega aqui (a tela descarta a linha): vazio não tira ninguém da
-- carteira — isso continua sendo pelo Cadastro.
--
-- O grupo segue a mesma regra: preenchido e diferente, muda; vazio não toca.
--
-- O que NÃO muda: o elo é o código do Forteplus; nenhuma importação do Forteplus escreve carteira ou
-- grupo (medido em 20261117010000); a vendedora responsável não é movida de carteira; código
-- repetido no envio é recusado.
--
-- O envio: [{carteira, responsavel?, clientes: [{codigo, nome, grupo?}]}].
create or replace function public.com_importar_carteiras(p_carteiras jsonb, p_confirmar boolean default false)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_tenant uuid := public.get_user_tenant_id();
  v_item jsonb;
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
  v_mudam jsonb;
  v_nao_encontrados jsonb;
  v_resultado jsonb := '[]'::jsonb;
begin
  if v_tenant is null or not public.com_pode_gerir_carteiras() then
    raise exception 'Só quem gere as carteiras do Comercial importa carteiras.' using errcode = '42501';
  end if;

  select coalesce(array_agg(cl ->> 'codigo'), array[]::text[]) into v_todos
    from jsonb_array_elements(coalesce(p_carteiras, '[]'::jsonb)) i,
         jsonb_array_elements(i -> 'clientes') cl;
  if (select count(*) <> count(distinct x) from unnest(v_todos) x) then
    raise exception 'Há código de cliente repetido na importação; resolva os conflitos antes.' using errcode = '22023';
  end if;

  for v_item in select * from jsonb_array_elements(coalesce(p_carteiras, '[]'::jsonb)) loop
    v_nome := nullif(public.normalizar_nome_carteira(v_item ->> 'carteira'), '');
    if v_nome is null then
      raise exception 'Carteira sem nome.' using errcode = '22023';
    end if;
    select coalesce((select r.para from public.com_carteira_renomeacoes r
                      where r.tenant_id = v_tenant and r.de = v_nome), v_nome) into v_nome;

    select coalesce(array_agg(cl ->> 'codigo'), array[]::text[]) into v_codigos
      from jsonb_array_elements(v_item -> 'clientes') cl;

    select count(*) filter (where c.carteira is null),
           count(*) filter (where c.carteira = v_nome),
           coalesce(jsonb_agg(jsonb_build_object('codigo', c.codigo, 'nome', c.razao_social, 'de', c.carteira)
                               order by c.razao_social)
                      filter (where c.carteira is not null and c.carteira <> v_nome), '[]'::jsonb)
      into v_entram, v_ja_estavam, v_mudam
      from public.com_clientes c
     where c.tenant_id = v_tenant and c.codigo = any (v_codigos);

    select coalesce(jsonb_agg(x), '[]'::jsonb) into v_nao_encontrados
      from unnest(v_codigos) x
     where not exists (select 1 from public.com_clientes c where c.tenant_id = v_tenant and c.codigo = x);

    select count(*) into v_grupos
      from jsonb_array_elements(v_item -> 'clientes') cl
      join public.com_clientes c on c.tenant_id = v_tenant and c.codigo = cl ->> 'codigo'
     where nullif(btrim(cl ->> 'grupo'), '') is not null
       and c.grupo is distinct from btrim(cl ->> 'grupo');

    v_responsavel := nullif(v_item ->> 'responsavel', '')::uuid;
    v_situacao_resp := null;
    v_membro := null;
    v_outro_responsavel := null;
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
       where c.tenant_id = v_tenant and c.codigo = any (v_codigos)
         and c.carteira is distinct from v_nome;

      update public.com_clientes c set grupo = btrim(cl ->> 'grupo'), updated_at = now()
        from jsonb_array_elements(v_item -> 'clientes') cl
       where c.tenant_id = v_tenant and c.codigo = cl ->> 'codigo'
         and nullif(btrim(cl ->> 'grupo'), '') is not null
         and c.grupo is distinct from btrim(cl ->> 'grupo');

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
      'mudam', v_mudam,
      'nao_encontrados', v_nao_encontrados,
      'grupos', v_grupos,
      'responsavel', v_situacao_resp
    );
  end loop;

  return jsonb_build_object('confirmado', p_confirmar, 'carteiras', v_resultado);
end;
$$;

do $$
begin
  if has_function_privilege('anon', 'public.com_importar_carteiras(jsonb, boolean)', 'execute') then
    raise exception 'com_importar_carteiras aberta para anon';
  end if;
end $$;
