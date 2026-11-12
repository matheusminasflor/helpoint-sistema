-- OS INDICADORES COM NOMES DE MERCADO (revisão do Comercial aprovada pelo dono, https://claude.ai/artifact/DogLjeM9MuJUzFt2H7ALFV,
-- seção 4). Muda só o que aparece no painel (`rotulo_painel`); o `nome` (o que a vendedora marca no lançamento) fica.
-- "Treinamentos técnicos agendados" e "Eventos vendidos" passam a medir o período escolhido, como o par deles: na mesma
-- tabela, um era da semana e o outro do mês. Medido antes: nenhum indicador tem meta (com_metas_indicador vazia para
-- todos), então a troca de período não mexe em meta nenhuma.
update public.com_indicadores i
   set rotulo_painel = n.rotulo,
       periodo = coalesce(n.periodo, i.periodo),
       updated_at = now()
  from (values
    ('Contato para venda',          'Contatos comerciais',                          null),
    ('Venda ativa',                 'Vendas ativas (iniciativa da vendedora)',      null),
    ('Venda passiva',               'Vendas receptivas (iniciativa do cliente)',    null),
    ('Passiva aumentada',           'Vendas receptivas ampliadas',                  null),
    ('Prospecção ativa',            'Prospecção ativa',                             null),
    ('Prospecção passiva',          'Prospecção receptiva',                         null),
    ('Venda promocional',           'Vendas em campanha',                           null),
    ('Marcar reunião técnica',      'Treinamentos técnicos agendados',              'mes'),
    ('Reunião técnica realizada',   'Treinamentos técnicos realizados',             null),
    ('Venda de evento',             'Eventos vendidos',                             'mes'),
    ('Evento realizado',            'Eventos realizados',                           null),
    ('Contato inadimplente',        'Contatos de cobrança',                         null),
    ('Venda inadimplente/inativo',  'Vendas com pendência financeira',              null)
  ) as n(nome, rotulo, periodo)
 where i.tipo = 'indicador' and i.nome = n.nome;
