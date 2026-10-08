-- MODELOS DE PROJETO DA INDÚSTRIA (dono, 2026-10-08: "Sim, os 12").
--
-- Os projetos que uma indústria de cosméticos capilares profissional faz no ano, para o colaborador
-- escolher em "Começar de um modelo". Pesquisa em docs/especificacao-projetos.md (seção "Modelos"):
-- Anvisa RDC 752/2022 (Grau 1 = notificação; Grau 2 = registro: progressiva, coloração, ondulação, pomada),
-- fluxo de P&D (briefing → fórmula → estabilidade e compatibilidade → embalagem → CQ → produção) e o
-- Forteplus como sistema de cadastro, lote e estoque.
--
-- Formato igual ao do primeiro modelo (20261215030000): só fases e atividades por setor, sem datas,
-- pessoas ou duração. Idempotente pelo NOME, só nas empresas que já existem.
-- Setores: qualidade (P&D, regulatório, CQ), producao, compras, comercial, marketing, educacional,
-- expedicao, financeiro, ti.

-- Semeia UM modelo: p_fases = [{"nome": "...", "atividades": [["título", "setor", "descrição"|null], ...]}, ...]
create or replace function public.semear_modelo_de_projeto(p_tenant uuid, p_nome text, p_descricao text, p_fases jsonb)
returns void language plpgsql set search_path to 'public' as $$
declare
  v_proj uuid;
  v_fase uuid;
  f jsonb;
  a jsonb;
  v_ordem int := 0;
  v_pos int;
begin
  if exists (select 1 from public.projects where tenant_id = p_tenant and e_modelo and name = p_nome) then
    return;
  end if;
  insert into public.projects (tenant_id, name, description, status, e_modelo)
  values (p_tenant, p_nome, p_descricao, 'planned', true)
  returning id into v_proj;

  for f in select * from jsonb_array_elements(p_fases) loop
    v_ordem := v_ordem + 1;
    insert into public.project_fases (tenant_id, project_id, nome, ordem, created_by)
    values (p_tenant, v_proj, f->>'nome', v_ordem, null) returning id into v_fase;
    v_pos := 0;
    for a in select * from jsonb_array_elements(f->'atividades') loop
      v_pos := v_pos + 1;
      insert into public.tasks (tenant_id, project_id, fase_id, title, setor, description, status, position, priority)
      values (p_tenant, v_proj, v_fase, a->>0, a->>1, nullif(a->>2, ''), 'pending', v_pos, 3);
    end loop;
  end loop;

  insert into public.project_setores (tenant_id, project_id, setor)
  select distinct p_tenant, v_proj, setor from public.tasks where project_id = v_proj
  on conflict (project_id, setor) do nothing;
end;
$$;

-- Acrescenta uma atividade ao fim de uma fase de um modelo que já existe (idempotente pelo título).
create or replace function public.modelo_acrescentar_atividade(p_proj uuid, p_fase_ordem int, p_titulo text, p_setor text, p_descricao text)
returns void language plpgsql set search_path to 'public' as $$
declare v_fase public.project_fases%rowtype;
begin
  select * into v_fase from public.project_fases where project_id = p_proj and ordem = p_fase_ordem;
  if not found or exists (select 1 from public.tasks where project_id = p_proj and title = p_titulo) then
    return;
  end if;
  insert into public.tasks (tenant_id, project_id, fase_id, title, setor, description, status, position, priority)
  values (v_fase.tenant_id, p_proj, v_fase.id, p_titulo, p_setor, p_descricao, 'pending',
          coalesce((select max(position) from public.tasks where fase_id = v_fase.id), 0) + 1, 3);
  insert into public.project_setores (tenant_id, project_id, setor)
  values (v_fase.tenant_id, p_proj, p_setor) on conflict (project_id, setor) do nothing;
end;
$$;

-- Os 12 modelos de UMA empresa. Função (e não só um bloco solto) para o pgTAP poder provar o resultado
-- numa empresa de teste — no banco do CI não há empresa no momento da migration.
create or replace function public.semear_modelos_da_industria(p_tenant uuid)
returns void language plpgsql set search_path to 'public' as $$
declare
  t record;
  v_grau1 uuid;
begin
  for t in select p_tenant as id loop

    -- ─── 1. Lançamento Grau 1: o modelo do Nutribalance, renomeado e completado ─────────────────
    update public.projects
       set name = 'Lançamento de produto — Grau 1 (notificação)',
           description = 'Shampoo, condicionador, máscara, leave-in e outros de Grau 1: a Anvisa só precisa da '
             || 'notificação, e o produto pode ser vendido logo depois. Base: cronograma do Nutribalance 1 Litro.'
     where tenant_id = t.id and e_modelo and name = 'Lançamento de produto'
    returning id into v_grau1;
    if v_grau1 is null then
      select id into v_grau1 from public.projects
       where tenant_id = t.id and e_modelo and name = 'Lançamento de produto — Grau 1 (notificação)';
    end if;
    if v_grau1 is not null then
      perform public.modelo_acrescentar_atividade(v_grau1, 3, 'Notificação do produto na Anvisa', 'qualidade',
        'Regulatório: notificar no sistema da Anvisa com a fórmula e o rótulo aprovados. Grau 1 vende após a notificação.');
      perform public.modelo_acrescentar_atividade(v_grau1, 4, 'Cadastro do produto no Forteplus', 'compras',
        'Código, descrição, NCM, EAN (GS1), unidade, ficha de produção (estrutura de matéria-prima e embalagem) e controle de lote.');
      perform public.modelo_acrescentar_atividade(v_grau1, 6, 'Lote piloto e liberação pelo CQ', 'producao',
        'Primeiro lote com acompanhamento do P&D; o CQ libera antes de vender.');
    end if;

    -- ─── 2. Lançamento Grau 2 (registro) ──────────────────────────────────────────────────────
    perform public.semear_modelo_de_projeto(t.id, 'Lançamento de produto — Grau 2 (registro)',
      'Progressiva/alisante, coloração/tintura, ondulação e pomada: precisam de REGISTRO na Anvisa, com testes de '
      || 'segurança e eficácia e análise antes de vender. O lançamento só acontece depois do registro publicado.',
      $j$[
        {"nome": "Ideação e Viabilidade", "atividades": [
          ["Briefing e posicionamento do produto", "marketing", "Público, promessa, concorrentes, preço-alvo."],
          ["Estudo de viabilidade e margem", "comercial", "Volume esperado, preço por canal e margem mínima."],
          ["Viabilidade regulatória (Grau 2)", "qualidade", "Confirmar que é registro, ativos permitidos e concentrações, testes exigidos."]]},
        {"nome": "Pesquisa & Desenvolvimento", "atividades": [
          ["Desenvolvimento da fórmula", "qualidade", "P&D / laboratório."],
          ["Estabilidade e compatibilidade com a embalagem", "qualidade", "Estabilidade acelerada e compatibilidade fórmula × frasco."],
          ["Ficha técnica e especificações de CQ", "qualidade", null]]},
        {"nome": "Segurança e Eficácia", "atividades": [
          ["Contratar laboratório para os testes", "compras", "Testes de segurança (ex.: irritação, sensibilização) e de eficácia da promessa."],
          ["Testes de segurança", "qualidade", "Acompanhar os laudos do laboratório terceiro."],
          ["Testes de eficácia", "qualidade", "Comprovar a promessa do rótulo (ex.: alisamento, cobertura de brancos)."],
          ["Dossiê técnico", "qualidade", "Fórmula, laudos, especificações, modo de uso e advertências."]]},
        {"nome": "Embalagem e Rótulo", "atividades": [
          ["Definição de volumetria e frasco", "qualidade", "Junto com o Marketing."],
          ["Arte da embalagem", "marketing", null],
          ["Revisão de linguagem técnica e modo de uso", "educacional", null],
          ["Revisão regulatória do rótulo e advertências", "qualidade", "Advertências obrigatórias de produto Grau 2."]]},
        {"nome": "Registro na Anvisa", "atividades": [
          ["Peticionamento do registro", "qualidade", "Regulatório: petição eletrônica com o dossiê."],
          ["Responder exigências da Anvisa", "qualidade", null],
          ["Publicação do registro", "qualidade", "O produto só pode ser vendido depois da publicação."]]},
        {"nome": "Fábrica, Suprimentos e Forteplus", "atividades": [
          ["Cadastro do produto no Forteplus", "compras", "Código, NCM, EAN (GS1), ficha de produção e controle de lote."],
          ["Compra de matérias-primas e embalagens", "compras", null],
          ["Ordem de produção (PCP)", "producao", null],
          ["Planejamento de vendas e tabela de preço", "comercial", null]]},
        {"nome": "Lançamento", "atividades": [
          ["Lote piloto e liberação pelo CQ", "producao", null],
          ["Treinamento técnico de aplicação", "educacional", "Equipe interna e distribuidores: modo de uso e cuidados."],
          ["Comunicação e conteúdo", "marketing", "Catálogo, fotos, vídeos de aplicação."],
          ["Faturamento e expedição dos pedidos", "comercial", "Junto com a Expedição."]]}
      ]$j$::jsonb);

    -- ─── 3. Extensão de linha ─────────────────────────────────────────────────────────────────
    perform public.semear_modelo_de_projeto(t.id, 'Extensão de linha (novo tamanho, cor ou kit)',
      'Produto que já existe em versão nova: outro tamanho (ex.: 1 litro), nova cor/nuance ou kit. Mais curto que um lançamento.',
      $j$[
        {"nome": "Definição", "atividades": [
          ["O que muda e para quem", "marketing", "Tamanho, cor ou kit; canal e público."],
          ["Preço e margem da versão nova", "comercial", null]]},
        {"nome": "Produto e embalagem", "atividades": [
          ["Volumetria, frasco ou ajuste de fórmula/cor", "qualidade", null],
          ["Compatibilidade com a embalagem nova", "qualidade", "Só se mudar o frasco."],
          ["Arte do rótulo", "marketing", null],
          ["Revisão regulatória do rótulo", "qualidade", null],
          ["Notificação ou registro da nova apresentação", "qualidade", "Conforme o grau do produto."]]},
        {"nome": "Forteplus e produção", "atividades": [
          ["Cadastro do novo código no Forteplus", "compras", "Código, EAN, ficha de produção e lote."],
          ["Compra de embalagem e insumos", "compras", null],
          ["Produção do estoque inicial", "producao", null]]},
        {"nome": "Venda", "atividades": [
          ["Tabela de preço e aviso aos distribuidores", "comercial", null],
          ["Catálogo e conteúdo", "marketing", null]]}
      ]$j$::jsonb);

    -- ─── 4. Reformulação ──────────────────────────────────────────────────────────────────────
    perform public.semear_modelo_de_projeto(t.id, 'Reformulação / troca de matéria-prima',
      'Mudar a fórmula de um produto que já vende: custo, falta de insumo, melhoria ou adequação a norma.',
      $j$[
        {"nome": "Motivo e escopo", "atividades": [
          ["Motivo da reformulação e o que não pode mudar", "qualidade", "Sensorial, desempenho, promessa do rótulo."],
          ["Impacto em custo e margem", "financeiro", null]]},
        {"nome": "Desenvolvimento", "atividades": [
          ["Nova fórmula", "qualidade", "P&D / laboratório."],
          ["Estabilidade e compatibilidade", "qualidade", null],
          ["Homologar a matéria-prima nova", "qualidade", "Se mudou fornecedor ou insumo."],
          ["Aprovação sensorial / desempenho", "educacional", "Teste de aplicação comparando com a fórmula atual."]]},
        {"nome": "Regulatório e rótulo", "atividades": [
          ["Atualizar notificação ou registro na Anvisa", "qualidade", null],
          ["Atualizar o rótulo (composição/INCI)", "marketing", "Arte com a lista de ingredientes nova."]]},
        {"nome": "Virada", "atividades": [
          ["Atualizar a ficha de produção no Forteplus", "compras", "Estrutura nova e a partir de qual lote vale."],
          ["Esgotar o estoque da fórmula antiga", "producao", "Matéria-prima, embalagem e produto acabado."],
          ["Primeiro lote da fórmula nova e liberação do CQ", "producao", null],
          ["Avisar distribuidores, se algo mudar para eles", "comercial", null]]}
      ]$j$::jsonb);

    -- ─── 5. Troca de embalagem ou rótulo ──────────────────────────────────────────────────────
    perform public.semear_modelo_de_projeto(t.id, 'Troca de embalagem ou rótulo',
      'Novo frasco, novo fornecedor de embalagem, nova arte ou advertência obrigatória nova.',
      $j$[
        {"nome": "Definição", "atividades": [
          ["Motivo da troca e embalagem/arte nova", "marketing", null]]},
        {"nome": "Testes", "atividades": [
          ["Compatibilidade da fórmula com a embalagem nova", "qualidade", "Só se mudar o frasco ou o material."],
          ["Homologação da embalagem e do fornecedor", "qualidade", null]]},
        {"nome": "Arte", "atividades": [
          ["Arte nova", "marketing", null],
          ["Revisão regulatória do rótulo", "qualidade", "Dizeres obrigatórios, advertências, lote e validade."]]},
        {"nome": "Compra e virada", "atividades": [
          ["Compra da embalagem nova", "compras", null],
          ["Cadastrar a embalagem no Forteplus", "compras", "Código do item e troca na ficha de produção."],
          ["Consumir o estoque antigo de embalagem", "producao", "Definir a partir de qual lote entra a nova."]]}
      ]$j$::jsonb);

    -- ─── 6. Homologação de fornecedor ─────────────────────────────────────────────────────────
    perform public.semear_modelo_de_projeto(t.id, 'Homologação de fornecedor',
      'Aprovar um fornecedor novo de matéria-prima ou de embalagem antes de comprar em volume.',
      $j$[
        {"nome": "Documentação", "atividades": [
          ["Pedir documentos do fornecedor", "compras", "Laudo/certificado de análise, FISPQ, especificação técnica."],
          ["Avaliar a documentação", "qualidade", null]]},
        {"nome": "Amostra e testes", "atividades": [
          ["Receber amostra", "compras", null],
          ["Testes no controle de qualidade", "qualidade", "Conferir com a especificação; teste em fórmula se for matéria-prima."]]},
        {"nome": "Aprovação", "atividades": [
          ["Aprovar ou reprovar o fornecedor", "qualidade", null],
          ["Cadastrar o fornecedor e o item no Forteplus", "compras", null],
          ["Primeira compra acompanhada", "compras", "O CQ confere o primeiro lote recebido."]]}
      ]$j$::jsonb);

    -- ─── 7. Adequação regulatória ─────────────────────────────────────────────────────────────
    perform public.semear_modelo_de_projeto(t.id, 'Adequação a nova norma da Anvisa',
      'Uma resolução nova muda ingredientes, limites ou advertências e dá um prazo para adequar.',
      $j$[
        {"nome": "Levantamento", "atividades": [
          ["Ler a norma e anotar o prazo final", "qualidade", null],
          ["Levantar os produtos afetados", "qualidade", "Fórmulas e rótulos que precisam mudar."]]},
        {"nome": "Adequação", "atividades": [
          ["Ajustar as fórmulas afetadas", "qualidade", "Abrir um projeto de Reformulação por produto, se for grande."],
          ["Ajustar os rótulos e advertências", "marketing", null],
          ["Atualizar notificações e registros", "qualidade", null]]},
        {"nome": "Estoque e prazo", "atividades": [
          ["Plano de esgotamento do estoque antigo", "producao", "Matéria-prima, embalagem e produto acabado até o prazo."],
          ["Atualizar ficha de produção e itens no Forteplus", "compras", null],
          ["Conferir tudo adequado antes do prazo", "qualidade", null]]}
      ]$j$::jsonb);

    -- ─── 8. Descontinuação ────────────────────────────────────────────────────────────────────
    perform public.semear_modelo_de_projeto(t.id, 'Descontinuação de produto',
      'Tirar um produto de linha sem sobrar estoque parado nem deixar o cliente sem aviso.',
      $j$[
        {"nome": "Decisão", "atividades": [
          ["Decidir e definir a data de saída", "comercial", "Motivo, produto substituto (se houver)."],
          ["Avaliar o estoque existente", "producao", "Matéria-prima, embalagem e produto acabado."]]},
        {"nome": "Esgotamento", "atividades": [
          ["Parar compras de insumos e embalagens", "compras", null],
          ["Plano para vender o que sobrou", "comercial", "Promoção, kits ou venda para distribuidores."],
          ["Avisar distribuidores e salões", "comercial", null]]},
        {"nome": "Encerramento", "atividades": [
          ["Inativar o produto no Forteplus", "compras", null],
          ["Tirar do site, catálogo e tabela de preço", "marketing", null],
          ["Treinar sobre o produto substituto", "educacional", "Se houver substituto."]]}
      ]$j$::jsonb);

    -- ─── 9. Evento ou feira ───────────────────────────────────────────────────────────────────
    perform public.semear_modelo_de_projeto(t.id, 'Evento, feira ou convenção',
      'Feira do setor (ex.: Hair Brasil, Beauty Fair), convenção de distribuidores ou evento com salões.',
      $j$[
        {"nome": "Planejamento", "atividades": [
          ["Objetivo, local, data e orçamento", "marketing", null],
          ["Aprovação do orçamento", "financeiro", null],
          ["Metas comerciais do evento", "comercial", "Pedidos, cadastros, novos distribuidores."]]},
        {"nome": "Preparação", "atividades": [
          ["Estande, materiais e brindes", "marketing", null],
          ["Produtos para demonstração", "producao", "Separar por lote para rastrear."],
          ["Equipe técnica e roteiro das demonstrações", "educacional", null],
          ["Transporte do material", "expedicao", null]]},
        {"nome": "Pós-evento", "atividades": [
          ["Retorno aos contatos e leads", "comercial", null],
          ["Resultado do evento e custos", "marketing", "Comparar com o objetivo e o orçamento."]]}
      ]$j$::jsonb);

    -- ─── 10. Campanha comercial ───────────────────────────────────────────────────────────────
    perform public.semear_modelo_de_projeto(t.id, 'Campanha comercial ou promoção',
      'Promoção do mês ou do trimestre para distribuidores e salões.',
      $j$[
        {"nome": "Definição", "atividades": [
          ["Mecânica, público e período", "comercial", null],
          ["Margem e custo da campanha", "financeiro", null]]},
        {"nome": "Preparação", "atividades": [
          ["Material da campanha", "marketing", null],
          ["Treinar a equipe de vendas", "educacional", null],
          ["Garantir estoque e produção extra", "producao", null],
          ["Compras de insumos e brindes", "compras", null]]},
        {"nome": "Execução e apuração", "atividades": [
          ["Acompanhar vendas da campanha", "comercial", null],
          ["Apurar o resultado", "comercial", "Volume, margem e clientes novos, comparando com a meta."]]}
      ]$j$::jsonb);

    -- ─── 11. Treinamento técnico ──────────────────────────────────────────────────────────────
    perform public.semear_modelo_de_projeto(t.id, 'Programa de treinamento técnico',
      'Treinamento para salões, distribuidores ou equipe interna: conteúdo, agenda e certificação.',
      $j$[
        {"nome": "Planejamento", "atividades": [
          ["Público, objetivo e produtos do treinamento", "educacional", null],
          ["Agenda com salões e distribuidores", "comercial", null]]},
        {"nome": "Conteúdo", "atividades": [
          ["Conteúdo técnico e material didático", "educacional", null],
          ["Revisão técnica com o P&D", "qualidade", "Modo de uso e cuidados corretos."],
          ["Materiais visuais e vídeos", "marketing", null]]},
        {"nome": "Execução", "atividades": [
          ["Kits de produto para as aulas", "expedicao", null],
          ["Aplicar os treinamentos", "educacional", null],
          ["Certificação e avaliação", "educacional", "Lista de presença, avaliação e certificado."]]}
      ]$j$::jsonb);

    -- ─── 12. Lote com problema ────────────────────────────────────────────────────────────────
    perform public.semear_modelo_de_projeto(t.id, 'Lote com problema / recolhimento',
      'Não conformidade num lote já vendido ou em estoque: rastrear, bloquear, recolher e corrigir.',
      $j$[
        {"nome": "Contenção", "atividades": [
          ["Registrar a ocorrência e o lote", "qualidade", "Origem: SAC, distribuidor, inspeção."],
          ["Bloquear o lote no estoque (Forteplus)", "producao", null],
          ["Rastrear para quem o lote foi vendido (Forteplus)", "comercial", null]]},
        {"nome": "Análise", "atividades": [
          ["Análise do lote e da causa", "qualidade", "Contra-amostra, registros de produção e de matéria-prima."],
          ["Decidir: liberar, retrabalhar ou recolher", "qualidade", null]]},
        {"nome": "Recolhimento e comunicação", "atividades": [
          ["Comunicar distribuidores e clientes", "comercial", null],
          ["Responder o SAC", "qualidade", null],
          ["Comunicar a Anvisa, se for exigido", "qualidade", null],
          ["Logística reversa do lote", "expedicao", null]]},
        {"nome": "Ação corretiva", "atividades": [
          ["Ação corretiva para não repetir", "qualidade", null],
          ["Ajustar processo de produção", "producao", null]]}
      ]$j$::jsonb);

  end loop;
end;
$$;

-- Só o banco chama (esta migration e o pgTAP).
revoke all on function public.semear_modelo_de_projeto(uuid, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.modelo_acrescentar_atividade(uuid, int, text, text, text) from public, anon, authenticated;
revoke all on function public.semear_modelos_da_industria(uuid) from public, anon, authenticated;

-- As empresas que já existem ganham os modelos (empresa nova não, como o primeiro modelo).
do $$
declare t record;
begin
  for t in select id from public.tenants loop
    perform public.semear_modelos_da_industria(t.id);
  end loop;
end $$;
