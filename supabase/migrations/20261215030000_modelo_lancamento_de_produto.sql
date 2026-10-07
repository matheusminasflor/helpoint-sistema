-- O PRIMEIRO MODELO DE PROJETO: "Lançamento de produto", da planilha do dono "Cronograma do Projeto —
-- Nutribalance 1 Litro" (2026-10-07). Fases e atividades por setor, sem datas e pessoas.
--
-- De-para do "Departamento Responsável" (docs/plano-projetos.md, decisão 6): P&D/Laboratório,
-- Regulatório e Garantia da Qualidade → qualidade; Fábrica/PCP → producao; Suprimentos/Compras → compras;
-- Design → marketing. "A / B" fica no PRIMEIRO setor e o segundo vai na descrição. "Teste de eficácia"
-- (sem setor na planilha) → qualidade.
--
-- Só nas empresas que JÁ existem e só uma vez (idempotente pelo nome do modelo). Empresa nova não ganha.
do $$
declare
  t record;
  v_proj uuid;
  v_fase uuid;
  f record;
  a record;
begin
  for t in select id from public.tenants loop
    if exists (select 1 from public.projects where tenant_id = t.id and e_modelo and name = 'Lançamento de produto') then
      continue;
    end if;
    insert into public.projects (tenant_id, name, description, status, e_modelo)
    values (t.id, 'Lançamento de produto',
      'Modelo a partir do cronograma do Nutribalance 1 Litro: da ideia e viabilidade até a produção e a expedição. '
      || 'Cada setor ajusta as suas atividades ao projeto.', 'planned', true)
    returning id into v_proj;

    for f in select * from (values
      (1, 'Ideação e Viabilidade'),
      (2, 'Pesquisa & Desenvolvimento'),
      (3, 'Embalagem e Arte'),
      (4, 'Fábrica, Suprimentos e Estratégia'),
      (5, 'Estratégia de Lançamento (em paralelo)'),
      (6, 'Produção e Logística (antecipada)')) as x(ordem, nome)
    loop
      insert into public.project_fases (tenant_id, project_id, nome, ordem, created_by)
      values (t.id, v_proj, f.nome, f.ordem, null) returning id into v_fase;

      for a in select * from (values
        (1, 1, 'Briefing e Posicionamento do Produto', 'marketing', 'Pesquisa de concorrentes. Junto com o Comercial.'),
        (1, 2, 'Estudo de Viabilidade e Margem de Lucro', 'comercial', null),
        (2, 1, 'Desenvolvimento da Fórmula', 'qualidade', 'P&D / Laboratório.'),
        (2, 2, 'Testes de Estabilidade e Segurança', 'qualidade', 'P&D / Laboratório.'),
        (2, 3, 'Criação da Ficha Técnica', 'qualidade', 'P&D / Laboratório.'),
        (2, 4, 'Teste de eficácia', 'qualidade', 'P&D / Laboratório.'),
        (3, 1, 'Definição de Volumetria e Frasco', 'qualidade', 'P&D, junto com o Marketing.'),
        (3, 2, 'Criação da Arte da Embalagem', 'marketing', 'Marketing / Design.'),
        (3, 3, 'Revisão de Linguagem Técnica', 'educacional', null),
        (3, 4, 'Revisão Regulatória do Rótulo', 'qualidade', 'Regulatório.'),
        (4, 1, 'Ajuste de Estoque e Compras Menores', 'compras', 'Suprimentos / Compras.'),
        (4, 2, 'Ordem de Produção (PCP)', 'producao', 'Fábrica.'),
        (4, 3, 'Elaboração do Planejamento de Vendas', 'comercial', null),
        (5, 1, 'Alinhamento da Comunicação', 'marketing', null),
        (5, 2, 'Implementação da Política Comercial e Metas', 'comercial', null),
        (5, 3, 'Material de Treinamento Técnico', 'educacional', null),
        (5, 4, 'Inserção no Catálogo (Físico/Digital)', 'marketing', null),
        (5, 5, 'Produção de Conteúdos Criativos e Vídeos', 'marketing', null),
        (5, 6, 'Treinamento do Time Comercial Interno', 'educacional', 'Junto com o Comercial.'),
        (6, 1, 'Fabricação e Envase do Produto', 'producao', 'Fábrica.'),
        (6, 2, 'Inspeção e Controle de Qualidade', 'qualidade', 'Garantia da Qualidade.'),
        (6, 3, 'Faturamento e Expedição dos Pedidos', 'comercial', 'Junto com a Expedição.')) as y(fase, pos, titulo, setor, descricao)
        where y.fase = f.ordem
      loop
        insert into public.tasks (tenant_id, project_id, fase_id, title, description, setor, status, position, priority)
        values (t.id, v_proj, v_fase, a.titulo, a.descricao, a.setor, 'pending', a.pos, 3);
      end loop;
    end loop;

    insert into public.project_setores (tenant_id, project_id, setor)
    select distinct t.id, v_proj, setor from public.tasks where project_id = v_proj
    on conflict (project_id, setor) do nothing;
  end loop;
end $$;
