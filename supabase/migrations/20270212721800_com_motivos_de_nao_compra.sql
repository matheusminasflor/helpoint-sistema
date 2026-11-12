-- MOTIVOS DE NÃO COMPRA (revisão do Comercial aprovada pelo dono, https://claude.ai/artifact/DogLjeM9MuJUzFt2H7ALFV,
-- seção 6): a lista fixa ganha os três que faltavam — "Mudou de ramo ou fechou", "Compra por outra razão social" e
-- "Sazonalidade". Medido antes: das 4 dores em "Outros", 3 eram "compra em 4 razões sociais / CNPJs" escritas à mão
-- ("EXPLICADO ABAIXO"), e por isso o gráfico não mostrava padrão. Essas três passam para o motivo novo.
alter table public.com_cliente_dores drop constraint com_cliente_dores_motivo_check;
alter table public.com_cliente_dores add constraint com_cliente_dores_motivo_check check (motivo = any (array[
  'preco', 'frete', 'estoque', 'credito', 'concorrente', 'produto', 'atendimento', 'pouca_venda',
  'fechou', 'outra_razao_social', 'sazonalidade', 'outros']));

-- A guarda (com_raio_x_so_o_gestor_corrige) só deixa o gestor logado corrigir; a migration não tem login. Desliga só
-- durante esta correção, dentro da mesma transação.
alter table public.com_cliente_dores disable trigger com_cliente_dores_guarda;
update public.com_cliente_dores
   set motivo = 'outra_razao_social', motivo_outros = null
 where motivo = 'outros'
   and (coalesce(motivo_outros, '') || ' ' || coalesce(descricao, '')) ~* '(raz(õ|o)es sociais|cnpjs)';
alter table public.com_cliente_dores enable trigger com_cliente_dores_guarda;
