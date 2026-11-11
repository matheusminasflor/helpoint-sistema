-- A NOTA ENTRA PELO XML (dono, 2026-11-11; revisão de outubro/novembro em https://claude.ai/artifact/BEHe5o4FEe7Xftx157veoM).
-- A revisão achou 10 remessas emitidas com CFOP de venda, 7 vendas emitidas como remessa e 3 remessas na série errada: a
-- conferência só vinha na importação semanal, depois do prazo de 24 h para cancelar a NF-e, e dava para finalizar antes.
-- Decisões do dono:
--   1. Série 1 (a única que emite NF-e: venda, e publicidade 5910/6910 sem imposto): o Financeiro sobe o XML e o PDF da
--      nota no checklist assim que emite. O banco lê o XML, acha o pedido pelo "Pedido: N" que o Forteplus escreve nas
--      informações complementares, e preenche nº, emissão e o faturado = total dos produtos menos o desconto (sem ST e
--      sem frete: é o que o espelho e o relatório do Forteplus já mostram). Tipo × CFOP, série e CNPJ do cliente travam;
--      o valor diferente do pedido só avisa.
--   2. Séries 75 e 76 não emitem nota fiscal: o Financeiro faz a conferência guiada (série, natureza de remessa, cliente
--      e valor) e informa o nº do documento (`ped_informar_nota`). A importação confere depois e avisa o Financeiro.
--   3. A vendedora não digita mais a nota. A regra vale para todo checklist ainda não finalizado.
--   4. A divergência só sai com a nota corrigida; o aviso vai ao Financeiro e à vendedora.
--   5. A Expedição marca "Aguardando coleta" e "Entregue à transportadora" (Expedição › Saídas), e a vendedora é avisada.

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

-- ─── 1. O que a nota traz, no pedido; a saída, no checklist ──────────────────────────────────────
alter table public.ped_pedidos
  add column nota_chave text,
  add column nota_serie_fiscal text,
  add column nota_cfops text[],
  add column nota_natureza text,
  add column nota_cnpj text,
  add column nota_transportadora text,
  add column nota_xml_path text,
  add column nota_pdf_path text,
  add column nota_registrada_por uuid references auth.users(id) on delete set null,
  add column nota_registrada_em timestamptz,
  add column divergencia_avisada_em timestamptz;
alter table public.ped_pedidos drop constraint if exists ped_pedidos_nota_origem_check;
alter table public.ped_pedidos add constraint ped_pedidos_nota_origem_check
  check (nota_origem in ('digitada', 'importacao', 'xml', 'conferida'));
create unique index ped_pedidos_nota_chave_unica on public.ped_pedidos (tenant_id, nota_chave) where nota_chave is not null;

alter table public.ped_checklists
  add column expedicao_situacao text check (expedicao_situacao in ('aguardando_coleta', 'com_transportadora')),
  add column expedicao_transportadora text,
  add column expedicao_rastreio text,
  add column expedicao_em timestamptz,
  add column expedicao_por uuid references auth.users(id) on delete set null;

-- A nota é do pedido: trocou o número ou a filial ao regravar, o que a nota trouxe sai junto (o `ped_salvar_checklist`
-- já faz isso com nº, valor, data e origem). Nota nova volta a poder ser avisada como divergente.
create or replace function public.ped_pedidos_nota_acompanha()
returns trigger language plpgsql set search_path = public as $$
begin
  if (new.numero, new.filial) is distinct from (old.numero, old.filial) then
    new.nota_chave := null; new.nota_serie_fiscal := null; new.nota_cfops := null; new.nota_natureza := null;
    new.nota_cnpj := null; new.nota_transportadora := null; new.nota_xml_path := null; new.nota_pdf_path := null;
    new.nota_registrada_por := null; new.nota_registrada_em := null;
  end if;
  if new.nota_fiscal is distinct from old.nota_fiscal or new.nota_chave is distinct from old.nota_chave then
    new.divergencia_avisada_em := null;
  end if;
  return new;
end;
$$;
revoke all on function public.ped_pedidos_nota_acompanha() from public, anon, authenticated;
create trigger trg_ped_pedidos_nota_acompanha before update on public.ped_pedidos
  for each row execute function public.ped_pedidos_nota_acompanha();

-- ─── 2. O arquivo: PDF e XML num bucket privado, `<empresa>/<checklist>/<arquivo>` ────────────────
insert into storage.buckets (id, name, public, file_size_limit)
values ('notas-fiscais', 'notas-fiscais', false, 10485760)
on conflict (id) do update set public = false, file_size_limit = 10485760;

create or replace function public.ped_pode_expedir()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin_or_higher(auth.uid())
      or coalesce(public.tem_permissao(auth.uid(), 'expedicao', 'saidas', 'edit'), false);
$$;
revoke all on function public.ped_pode_expedir() from public, anon;
grant execute on function public.ped_pode_expedir() to authenticated;

create or replace function public.ped_ve_saidas()
returns boolean language sql stable security definer set search_path = public as $$
  select public.ped_pode_expedir() or public.ped_ve_todos()
      or coalesce(public.tem_permissao(auth.uid(), 'expedicao', 'saidas', 'view'), false);
$$;
revoke all on function public.ped_ve_saidas() from public, anon;
grant execute on function public.ped_ve_saidas() to authenticated;

-- security definer: a vendedora lê o arquivo do próprio checklist sem precisar ver a tabela inteira.
create or replace function public.ped_ve_arquivo_do_checklist(p_checklist text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.ped_checklists c
                  where c.id::text = p_checklist and c.tenant_id = public.get_user_tenant_id()
                    and (c.vendedor_id = auth.uid() or public.ped_ve_saidas()));
$$;
revoke all on function public.ped_ve_arquivo_do_checklist(text) from public, anon;
grant execute on function public.ped_ve_arquivo_do_checklist(text) to authenticated;

create policy notas_fiscais_grava on storage.objects for insert to authenticated
  with check (bucket_id = 'notas-fiscais'
     and (storage.foldername(name))[1] = public.get_user_tenant_id()::text
     and (public.ped_pode_decidir() or public.ped_pode_registrar_pagamento()));
create policy notas_fiscais_le on storage.objects for select to authenticated
  using (bucket_id = 'notas-fiscais'
     and (storage.foldername(name))[1] = public.get_user_tenant_id()::text
     and public.ped_ve_arquivo_do_checklist((storage.foldername(name))[2]));

-- ─── 3. A situação de cada pedido, num lugar só ─────────────────────────────────────────────────
-- Ordem: o que a importação trouxe manda (o Forteplus prevalece); antes dela, o XML (série 1) ou a conferência guiada
-- do Financeiro (séries 75 e 76). Sem nenhum dos dois, falta a nota. Sem checar quem chama: serve à trava de finalizar e
-- ao aviso da importação; quem lê pela tela passa por `ped_situacao_das_notas`.
create function public.ped_situacao_interna(p_checklist uuid)
returns table(pedido_id uuid, ordem int, situacao text, mensagem text, aviso text)
language plpgsql stable security definer set search_path = public as $$
declare
  v_ck public.ped_checklists%rowtype;
  v_chave text;
  v_doc text;
  p record;
  n json;
  v_tipo_errado boolean;
  v_cfops text;
begin
  select * into v_ck from public.ped_checklists c where c.id = p_checklist;
  select public.com_chave_do_grupo(c.grupo, c.codigo), nullif(regexp_replace(coalesce(c.documento, ''), '\D', '', 'g'), '')
    into v_chave, v_doc
    from public.com_clientes c where c.tenant_id = v_ck.tenant_id and c.codigo = v_ck.cliente_codigo;

  for p in select * from public.ped_pedidos x where x.checklist_id = p_checklist and x.serie is not null order by x.ordem loop
    pedido_id := p.id; ordem := p.ordem; aviso := null;
    n := (select json_build_object(
                   'serie', min(vi.serie), 'venda', bool_or(vi.classe = 'venda'), 'remessa', min(vi.remessa),
                   'cliente', public.com_chave_do_grupo(max(c.grupo), max(vi.cliente_codigo)))
            from public.com_vendas_itens vi
            left join public.com_clientes c on c.tenant_id = vi.tenant_id and c.codigo = vi.cliente_codigo
           where vi.tenant_id = v_ck.tenant_id and vi.filial = p.filial
             and ltrim(regexp_replace(vi.documento, '\D', '', 'g'), '0') = p.nota_fiscal
          having count(*) > 0);

    if p.nota_fiscal is not null and n is not null then
      -- O Forteplus já trouxe a nota: a conferência de sempre. A remessa sai da série; o CFOP de venda numa remessa (o
      -- caso da revisão: cashback 8, 9 e 14 e bonificação 564) agora também diverge — antes passava pela série certa.
      v_tipo_errado := case p.tipo when 'Venda' then not (n ->> 'venda')::boolean
                                   when 'Bonificação' then n ->> 'remessa' is distinct from 'bonificacao'
                                   when 'Publicidade' then n ->> 'remessa' is distinct from 'publicidade'
                                   when 'Cashback' then n ->> 'remessa' is distinct from 'cashback' end
                       or (p.tipo <> 'Venda' and (n ->> 'venda')::boolean);
      if n ->> 'cliente' is distinct from v_chave then
        situacao := 'divergente';
        mensagem := format('Pedido %s: a nota %s é de outro cliente.', p.ordem, p.nota_fiscal);
      elsif n ->> 'serie' is distinct from p.serie then
        situacao := 'divergente';
        mensagem := format('Pedido %s (%s): a nota %s saiu na série %s, e o pedido diz série %s. %s sai na %s: corrija no Forteplus.',
                           p.ordem, p.tipo, p.nota_fiscal, n ->> 'serie', p.serie, p.tipo, public.ped_series_do_tipo(p.tipo));
      elsif v_tipo_errado then
        situacao := 'divergente';
        mensagem := format('Pedido %s (%s): a nota %s não é de %s no Forteplus (CFOP de %s). Corrija no Forteplus.',
                           p.ordem, p.tipo, p.nota_fiscal, lower(p.tipo),
                           case when (n ->> 'venda')::boolean then 'venda' else 'remessa gratuita' end);
      else
        situacao := 'ok';
        mensagem := format('Pedido %s: nota %s confirmada na importação do Forteplus.', p.ordem, p.nota_fiscal);
      end if;

    elsif p.serie = '1' and p.nota_origem = 'xml' then
      v_cfops := array_to_string(p.nota_cfops, '/');
      if p.nota_serie_fiscal is distinct from '1' then
        situacao := 'divergente';
        mensagem := format('Pedido %s (%s): a nota %s saiu na série %s, e o pedido é da série 1. Cancele no Forteplus e emita na série 1.',
                           p.ordem, p.tipo, p.nota_fiscal, p.nota_serie_fiscal);
      elsif p.tipo = 'Venda' and exists (select 1 from unnest(p.nota_cfops) x where public.com_classe_do_cfop(x) <> 'venda') then
        situacao := 'divergente';
        mensagem := format('Pedido %s (Venda): a nota %s saiu com CFOP %s, que não é de venda. Cancele no Forteplus em até 24 h e emita com natureza de venda.',
                           p.ordem, p.nota_fiscal, v_cfops);
      elsif p.tipo = 'Publicidade' and exists (select 1 from unnest(p.nota_cfops) x where public.com_classe_do_cfop(x) <> 'bonificacao') then
        situacao := 'divergente';
        mensagem := format('Pedido %s (Publicidade): a nota %s saiu com CFOP %s, que é de venda. Cancele no Forteplus em até 24 h e emita com natureza de remessa (5910 dentro do estado, 6910 fora).',
                           p.ordem, p.nota_fiscal, v_cfops);
      elsif v_doc is not null and p.nota_cnpj is distinct from v_doc then
        situacao := 'divergente';
        mensagem := format('Pedido %s: a nota %s é do CNPJ/CPF %s, que não é o do cliente do checklist (%s).',
                           p.ordem, p.nota_fiscal, p.nota_cnpj, v_doc);
      else
        situacao := 'conferida';
        mensagem := format('Pedido %s: nota %s conferida pelo XML (CFOP %s).', p.ordem, p.nota_fiscal, v_cfops);
      end if;
      if abs(coalesce(p.nota_valor, 0) - coalesce(p.valor, 0)) > 1 then
        aviso := format('O total dos produtos da nota (R$ %s) é diferente do valor do pedido (R$ %s). Confira.',
                        replace(to_char(p.nota_valor, 'FM999999990.00'), '.', ','), replace(to_char(p.valor, 'FM999999990.00'), '.', ','));
      end if;

    elsif p.serie <> '1' and p.nota_origem = 'conferida' then
      situacao := 'conferida';
      mensagem := format('Pedido %s: documento %s conferido pelo Financeiro. A importação do Forteplus confirma.', p.ordem, p.nota_fiscal);

    else
      situacao := 'sem_nota';
      mensagem := case when p.serie = '1'
                       then format('Pedido %s (%s): falta subir o XML e o PDF da nota.', p.ordem, p.tipo)
                       else format('Pedido %s (%s): falta a conferência do Financeiro.', p.ordem, p.tipo) end;
    end if;
    return next;
  end loop;
end;
$$;
revoke all on function public.ped_situacao_interna(uuid) from public, anon, authenticated;

-- A tela: a mesma situação, para quem vê o checklist. `drop` + `create` porque ganhou o aviso (lição 14).
drop function public.ped_situacao_das_notas(uuid);
create function public.ped_situacao_das_notas(p_checklist uuid)
returns table(pedido_id uuid, ordem int, situacao text, mensagem text, aviso text)
language plpgsql stable security definer set search_path = public as $$
declare
  v_ck public.ped_checklists%rowtype;
begin
  select * into v_ck from public.ped_checklists c where c.id = p_checklist and c.tenant_id = public.get_user_tenant_id();
  if v_ck.id is null or not (v_ck.vendedor_id = auth.uid() or public.ped_ve_todos()) then
    return;
  end if;
  return query select * from public.ped_situacao_interna(p_checklist);
end;
$$;
revoke all on function public.ped_situacao_das_notas(uuid) from public, anon;
grant execute on function public.ped_situacao_das_notas(uuid) to authenticated;

-- Finalizar: todo pedido conferido (XML, conferência guiada ou importação). Antes, a nota "a confirmar" passava.
select pg_temp.troca('public.ped_finalizacoes_antes_inserir()'::regprocedure,
  'from public.ped_situacao_das_notas(new.checklist_id) s',
  'from public.ped_situacao_interna(new.checklist_id) s');
-- O gatilho roda como quem finaliza, e `ped_situacao_interna` não é aberta a `authenticated`.
alter function public.ped_finalizacoes_antes_inserir() security definer;

-- ─── 4. Informar a nota à mão: só o Financeiro. Nas séries 75 e 76 é a conferência guiada ─────────
select pg_temp.troca('public.ped_informar_nota(uuid, text, numeric, date)'::regprocedure,
  $x$  if not (v_ck.vendedor_id = auth.uid() or public.ped_pode_decidir() or public.ped_pode_registrar_pagamento()) then
    raise exception 'Só quem fez o pedido ou o Financeiro informa a nota.' using errcode = '42501';$x$,
  $x$  if not (public.ped_pode_decidir() or public.ped_pode_registrar_pagamento()) then
    raise exception 'A nota agora é informada pelo Financeiro: o XML na série 1, a conferência nas séries 75 e 76.' using errcode = '42501';$x$);
select pg_temp.troca('public.ped_informar_nota(uuid, text, numeric, date)'::regprocedure,
  $x$nota_origem = case when v_nota is null then null else 'digitada' end$x$,
  $x$nota_origem = case when v_nota is null then null when v_ped.serie in ('75', '76') then 'conferida' else 'digitada' end,
         nota_registrada_por = case when v_nota is null then null else auth.uid() end,
         nota_registrada_em = case when v_nota is null then null else now() end$x$);

-- A prévia da venda conta também a nota que veio pelo XML e a conferida.
select pg_temp.troca('public.com_notas_a_confirmar(date, date)'::regprocedure,
  $x$p.nota_origem = 'digitada'$x$,
  $x$p.nota_origem in ('digitada', 'xml', 'conferida')$x$);

-- ─── 5. O XML ────────────────────────────────────────────────────────────────────────────────────
create or replace function public.ped_registrar_xml(p_checklist uuid, p_xml text, p_xml_path text, p_pdf_path text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_ck public.ped_checklists%rowtype;
  v_ped public.ped_pedidos%rowtype;
  v_x xml;
  v_ns text[] := array[array['n', 'http://www.portalfiscal.inf.br/nfe']];
  v_chave text; v_status text; v_numero text; v_serie text; v_emissao date; v_natureza text; v_dest text;
  v_prod numeric; v_desc numeric; v_compl text; v_pedido text; v_transp text; v_cfops text[];
  v_pasta text;
  v_outro text;
  s record;
begin
  if not (public.ped_pode_decidir() or public.ped_pode_registrar_pagamento()) then
    raise exception 'Só o Financeiro sobe a nota.' using errcode = '42501';
  end if;
  select * into v_ck from public.ped_checklists where id = p_checklist and tenant_id = public.get_user_tenant_id();
  if v_ck.id is null then
    raise exception 'Checklist não encontrado.' using errcode = 'P0002';
  end if;
  if public.ped_cancelado(v_ck.id) then
    raise exception 'Checklist cancelado: a nota não muda mais.' using errcode = 'P0001';
  end if;
  if public.ped_finalizado(v_ck.id) then
    raise exception 'Checklist finalizado: a nota não muda mais.' using errcode = 'P0001';
  end if;
  if coalesce(public.ped_decisao_vigente(v_ck.id), '') <> 'Aprovado' then
    raise exception 'Só o checklist aprovado recebe a nota.' using errcode = 'P0001';
  end if;

  begin
    v_x := xmlparse(document p_xml);
  exception when others then
    raise exception 'Este arquivo não é o XML de uma nota fiscal (NF-e).' using errcode = '22023';
  end;
  v_chave := (xpath('//n:protNFe/n:infProt/n:chNFe/text()', v_x, v_ns))[1]::text;
  v_status := (xpath('//n:protNFe/n:infProt/n:cStat/text()', v_x, v_ns))[1]::text;
  v_numero := ltrim((xpath('//n:infNFe/n:ide/n:nNF/text()', v_x, v_ns))[1]::text, '0');
  if v_numero is null then
    raise exception 'Este arquivo não é o XML de uma nota fiscal (NF-e).' using errcode = '22023';
  end if;
  if v_status is distinct from '100' then
    raise exception 'A nota % não está autorizada na SEFAZ (situação %). Suba o XML da nota autorizada.',
      v_numero, coalesce(v_status, 'sem protocolo') using errcode = '23514';
  end if;
  v_serie := (xpath('//n:infNFe/n:ide/n:serie/text()', v_x, v_ns))[1]::text;
  v_emissao := left((xpath('//n:infNFe/n:ide/n:dhEmi/text()', v_x, v_ns))[1]::text, 10)::date;
  v_natureza := (xpath('//n:infNFe/n:ide/n:natOp/text()', v_x, v_ns))[1]::text;
  v_dest := coalesce((xpath('//n:infNFe/n:dest/n:CNPJ/text()', v_x, v_ns))[1]::text,
                     (xpath('//n:infNFe/n:dest/n:CPF/text()', v_x, v_ns))[1]::text);
  v_prod := (xpath('//n:infNFe/n:total/n:ICMSTot/n:vProd/text()', v_x, v_ns))[1]::text::numeric;
  v_desc := coalesce((xpath('//n:infNFe/n:total/n:ICMSTot/n:vDesc/text()', v_x, v_ns))[1]::text::numeric, 0);
  v_compl := (xpath('//n:infNFe/n:infAdic/n:infCpl/text()', v_x, v_ns))[1]::text;
  v_transp := (xpath('//n:infNFe/n:transp/n:transporta/n:xNome/text()', v_x, v_ns))[1]::text;
  select array_agg(distinct c::text order by c::text) into v_cfops
    from unnest(xpath('//n:infNFe/n:det/n:prod/n:CFOP/text()', v_x, v_ns)) c;

  -- O Forteplus escreve "Pedido: 11536 Vendedor: ..." nas informações complementares: é por ele que a nota acha o pedido,
  -- mesmo se o arquivo foi solto no pedido errado.
  v_pedido := ltrim(substring(coalesce(v_compl, '') from 'Pedido:\s*(\d+)'), '0');
  if v_pedido is null then
    raise exception 'A nota % não diz o número do pedido (o "Pedido:" das informações complementares). Confira no Forteplus.', v_numero
      using errcode = '23514';
  end if;
  select * into v_ped from public.ped_pedidos x
   where x.checklist_id = p_checklist and ltrim(regexp_replace(x.numero, '\D', '', 'g'), '0') = v_pedido;
  if v_ped.id is null then
    raise exception 'A nota % é do pedido % no Forteplus, que não está neste checklist.', v_numero, v_pedido using errcode = '23514';
  end if;
  if v_ped.serie is distinct from '1' then
    raise exception 'O pedido % é da série %, que não emite nota fiscal: este XML não é dele. Confira o pedido no Forteplus.',
      v_pedido, coalesce(v_ped.serie, '?') using errcode = '23514';
  end if;
  select c.protocolo into v_outro from public.ped_pedidos o join public.ped_checklists c on c.id = o.checklist_id
   where o.tenant_id = v_ck.tenant_id and o.nota_chave = v_chave and o.id <> v_ped.id limit 1;
  if v_outro is not null then
    raise exception 'A nota % já está no checklist %.', v_numero, v_outro using errcode = '23505';
  end if;

  v_pasta := v_ck.tenant_id::text || '/' || v_ck.id::text || '/';
  if left(coalesce(p_pdf_path, ''), length(v_pasta)) <> v_pasta or left(coalesce(p_xml_path, ''), length(v_pasta)) <> v_pasta
     or (select count(*) from storage.objects o where o.bucket_id = 'notas-fiscais' and o.name in (p_pdf_path, p_xml_path)) < 2 then
    raise exception 'Suba o XML e o PDF (DANFE) da nota juntos.' using errcode = '23514';
  end if;

  update public.ped_pedidos
     set nota_fiscal = v_numero, nota_em = v_emissao, nota_valor = v_prod - v_desc, nota_origem = 'xml',
         nota_chave = v_chave, nota_serie_fiscal = v_serie, nota_cfops = v_cfops, nota_natureza = v_natureza,
         nota_cnpj = v_dest, nota_transportadora = v_transp, nota_xml_path = p_xml_path, nota_pdf_path = p_pdf_path,
         nota_registrada_por = auth.uid(), nota_registrada_em = now()
   where id = v_ped.id;

  select * into s from public.ped_situacao_interna(p_checklist) x where x.pedido_id = v_ped.id;

  -- A vendedora fica sabendo na hora; na divergência, o resto do Financeiro também (quem subiu já vê na tela).
  insert into public.notifications (tenant_id, user_id, type, reference_type, reference_id, title, message)
  select v_ck.tenant_id, v_ck.vendedor_id, 'reminder', 'ped_nota', v_ck.id,
         case when s.situacao = 'divergente' then 'Nota com problema: ' else 'Nota emitida: ' end || v_ck.protocolo,
         case when s.situacao = 'divergente'
              then s.mensagem || ' O Financeiro vai corrigir antes de finalizar.'
              else format('A nota %s do pedido %s de %s foi emitida. O PDF está no checklist.', v_numero, v_ped.numero, v_ck.cliente_nome) end
   where v_ck.vendedor_id is not null and v_ck.vendedor_id <> auth.uid();
  if s.situacao = 'divergente' then
    insert into public.notifications (tenant_id, user_id, type, reference_type, reference_id, title, message)
    select v_ck.tenant_id, u, 'reminder', 'ped_nota_divergente', v_ck.id, 'Nota com problema: ' || v_ck.protocolo, s.mensagem
      from unnest(public.ped_quem_confere(v_ck.tenant_id)) u
     where u <> auth.uid();
  end if;

  return jsonb_build_object('pedido_id', v_ped.id, 'ordem', v_ped.ordem, 'nota', v_numero,
                            'situacao', s.situacao, 'mensagem', s.mensagem, 'aviso', s.aviso);
end;
$$;
revoke all on function public.ped_registrar_xml(uuid, text, text, text) from public, anon;
grant execute on function public.ped_registrar_xml(uuid, text, text, text) to authenticated;

-- ─── 6. A importação que acha erro avisa o Financeiro e a vendedora (uma vez por nota) ───────────
-- ponytail: olha os checklists dos últimos 120 dias, um por um; a importação é semanal e são centenas. Se ficar lento,
-- passar a olhar só os documentos da importação concluída.
create or replace function public.ped_avisar_divergencias(p_tenant uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_avisos int := 0;
begin
  for r in
    select c.id as checklist_id, c.protocolo, c.vendedor_id, s.pedido_id, s.mensagem
      from public.ped_checklists c
      cross join lateral public.ped_situacao_interna(c.id) s
      join public.ped_pedidos p on p.id = s.pedido_id
     where c.tenant_id = p_tenant and c.criado_em >= now() - interval '120 days'
       and not public.ped_cancelado(c.id) and public.ped_decisao_vigente(c.id) = 'Aprovado'
       and s.situacao = 'divergente' and p.divergencia_avisada_em is null
  loop
    insert into public.notifications (tenant_id, user_id, type, reference_type, reference_id, title, message)
    select p_tenant, u, 'reminder', case when u = r.vendedor_id then 'ped_nota' else 'ped_nota_divergente' end, r.checklist_id,
           'Importação achou nota errada: ' || r.protocolo, r.mensagem
      from (select distinct x as u from unnest(public.ped_quem_confere(p_tenant) || r.vendedor_id) x) d
     where u is not null;
    update public.ped_pedidos set divergencia_avisada_em = now() where id = r.pedido_id;
    v_avisos := v_avisos + 1;
  end loop;
  return v_avisos;
end;
$$;
revoke all on function public.ped_avisar_divergencias(uuid) from public, anon, authenticated;

select pg_temp.troca('public.ped_ao_concluir_importacao()'::regprocedure,
  'perform public.ped_achar_notas_importadas(new.tenant_id);',
  $x$perform public.ped_achar_notas_importadas(new.tenant_id);
  perform public.ped_avisar_divergencias(new.tenant_id);$x$);

-- O que já está divergente hoje entra como avisado: o aviso é para o erro que a próxima importação achar, não para o
-- passado inteiro de uma vez (a revisão de outubro e novembro já foi entregue ao Financeiro).
update public.ped_pedidos p set divergencia_avisada_em = now()
  from public.ped_checklists c
 cross join lateral public.ped_situacao_interna(c.id) s
 where c.id = p.checklist_id and s.pedido_id = p.id and s.situacao = 'divergente';

-- ─── 7. A Expedição: Saídas ──────────────────────────────────────────────────────────────────────
create or replace function public.ped_marcar_saida(p_checklist uuid, p_situacao text, p_transportadora text default null,
                                                   p_rastreio text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_ck public.ped_checklists%rowtype;
begin
  if not public.ped_pode_expedir() then
    raise exception 'Só a Expedição marca a saída do pedido.' using errcode = '42501';
  end if;
  select * into v_ck from public.ped_checklists where id = p_checklist and tenant_id = public.get_user_tenant_id();
  if v_ck.id is null then
    raise exception 'Checklist não encontrado.' using errcode = 'P0002';
  end if;
  if public.ped_cancelado(v_ck.id) then
    raise exception 'Checklist cancelado: não sai.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.ped_pedidos p where p.checklist_id = v_ck.id and p.serie = '1' and p.nota_fiscal is not null) then
    raise exception 'O pedido ainda não tem nota emitida.' using errcode = 'P0001';
  end if;
  if p_situacao not in ('aguardando_coleta', 'com_transportadora') then
    raise exception 'Situação de saída desconhecida: %.', p_situacao using errcode = '23514';
  end if;
  if p_situacao = 'com_transportadora' and btrim(coalesce(p_transportadora, '')) = '' then
    raise exception 'Informe a transportadora.' using errcode = '23514';
  end if;
  update public.ped_checklists
     set expedicao_situacao = p_situacao, expedicao_transportadora = nullif(btrim(coalesce(p_transportadora, '')), ''),
         expedicao_rastreio = nullif(btrim(coalesce(p_rastreio, '')), ''), expedicao_em = now(), expedicao_por = auth.uid()
   where id = v_ck.id;
  insert into public.notifications (tenant_id, user_id, type, reference_type, reference_id, title, message)
  select v_ck.tenant_id, v_ck.vendedor_id, 'reminder', 'ped_saida', v_ck.id,
         case p_situacao when 'aguardando_coleta' then 'Aguardando coleta: ' else 'Entregue à transportadora: ' end || v_ck.protocolo,
         case p_situacao when 'aguardando_coleta'
              then format('O pedido de %s está separado, aguardando a coleta.', v_ck.cliente_nome)
              else format('O pedido de %s foi entregue à %s%s.', v_ck.cliente_nome, btrim(p_transportadora),
                          coalesce('. Rastreio: ' || nullif(btrim(coalesce(p_rastreio, '')), ''), '')) end
   where v_ck.vendedor_id is not null and v_ck.vendedor_id <> auth.uid();
end;
$$;
revoke all on function public.ped_marcar_saida(uuid, text, text, text) from public, anon;
grant execute on function public.ped_marcar_saida(uuid, text, text, text) to authenticated;

-- A lista da Expedição: checklist aprovado com nota emitida, até 30 dias depois de entregue à transportadora.
create or replace function public.ped_saidas()
returns table(checklist_id uuid, protocolo text, cliente text, vendedor text, notas jsonb, situacao text,
              transportadora text, rastreio text, marcado_em timestamptz, marcado_por text)
language sql stable security definer set search_path = public as $$
  select c.id, c.protocolo, c.cliente_nome, vp.full_name,
         (select jsonb_agg(jsonb_build_object('numero', p.nota_fiscal, 'filial', p.filial, 'tipo', p.tipo,
                                              'transportadora', p.nota_transportadora, 'pdf', p.nota_pdf_path) order by p.ordem)
            from public.ped_pedidos p where p.checklist_id = c.id and p.serie = '1' and p.nota_fiscal is not null),
         c.expedicao_situacao, c.expedicao_transportadora, c.expedicao_rastreio, c.expedicao_em, mp.full_name
    from public.ped_checklists c
    left join public.profiles vp on vp.id = c.vendedor_id
    left join public.profiles mp on mp.id = c.expedicao_por
   where c.tenant_id = public.get_user_tenant_id() and public.ped_ve_saidas()
     and not public.ped_cancelado(c.id) and public.ped_decisao_vigente(c.id) = 'Aprovado'
     and exists (select 1 from public.ped_pedidos p where p.checklist_id = c.id and p.serie = '1' and p.nota_fiscal is not null)
     and (c.expedicao_situacao is distinct from 'com_transportadora' or c.expedicao_em >= now() - interval '30 days')
   order by (c.expedicao_situacao = 'com_transportadora') nulls first, c.enviado_em;
$$;
revoke all on function public.ped_saidas() from public, anon;
grant execute on function public.ped_saidas() to authenticated;

-- A tela nova da Expedição, ligada em todos os perfis do setor (dá acesso, não tira).
update public.access_profiles
   set permissions = coalesce(permissions, '{}'::jsonb) || '{"saidas": {"view": true, "edit": true}}'::jsonb
 where department = 'expedicao';
