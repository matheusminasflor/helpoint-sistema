-- O PEDIDO AO RH COM FORMULÁRIO POR ASSUNTO (dono, 2026-10-28; proposta "Helpoint no celular", decisão 4, aprovada):
-- "O RH é totalmente formulário" — escolhido o assunto, aparecem só os campos dele; o título sai do assunto e a
-- descrição vira "Observação", opcional (CreateTicketForm, `formularioDoAssunto`). É o mesmo formulário por assunto
-- que o Admissional da TI já usa (`ticket_form_fields`): só dado, nenhuma regra nova.
-- Idempotente: só entra o campo que o assunto ainda não tem (pelo rótulo); assunto que não existir não recebe nada.
with campos (assunto, rotulo, tipo, opcoes, obrigatorio, dica, ordem) as (values
  ('Solicitação de férias', 'Início das férias', 'date', '[]', true, null, 1),
  ('Solicitação de férias', 'Fim das férias', 'date', '[]', true, null, 2),
  ('Solicitação de férias', 'Vender 1/3 das férias?', 'radio', '["Sim", "Não"]', true, null, 3),
  ('Solicitação de férias', 'Adiantar a 1ª parcela do 13º?', 'radio', '["Sim", "Não"]', true, null, 4),
  ('Abono', 'Dia', 'date', '[]', true, null, 1),
  ('Abono', 'Motivo', 'select', '["Aniversário", "Doação de sangue", "Casamento", "Outro"]', true, null, 2),
  ('Banco de horas', 'O que você precisa', 'select', '["Usar horas", "Consultar o saldo"]', true, null, 1),
  ('Banco de horas', 'Dia', 'date', '[]', false, null, 2),
  ('Banco de horas', 'Quantas horas', 'text', '[]', false, 'Ex.: 4 horas', 3),
  ('Atestado médico', 'Data do atestado', 'date', '[]', true, null, 1),
  ('Atestado médico', 'Quantos dias', 'text', '[]', true, 'Ex.: 2', 2),
  ('Atestado médico', 'O atestado', 'file', '[]', true, null, 3),
  ('INSS', 'Início do afastamento', 'date', '[]', true, null, 1),
  ('INSS', 'Previsão de volta', 'date', '[]', false, null, 2),
  ('INSS', 'Documento', 'file', '[]', false, null, 3),
  ('Licenças', 'Tipo de licença', 'select', '["Maternidade", "Paternidade", "Casamento", "Falecimento na família", "Outra"]', true, null, 1),
  ('Licenças', 'Início', 'date', '[]', true, null, 2),
  ('Licenças', 'Previsão de volta', 'date', '[]', false, null, 3),
  ('Licenças', 'Documento', 'file', '[]', false, null, 4),
  ('Holerite', 'Mês do holerite', 'text', '[]', true, 'Ex.: outubro de 2026', 1),
  ('Holerite', 'O que você precisa', 'select', '["Segunda via", "Dúvida no valor"]', true, null, 2),
  ('Vale-transporte', 'O que você precisa', 'select', '["Incluir", "Alterar", "Cancelar"]', true, null, 1),
  ('Vale-transporte', 'Linhas ou trajeto', 'text', '[]', false, 'Ex.: ônibus 4102 ida e volta', 2),
  ('Vale-refeição', 'O que você precisa', 'select', '["Incluir", "Alterar", "Cancelar", "Dúvida"]', true, null, 1),
  ('Plano de saúde', 'O que você precisa', 'select', '["Incluir dependente", "Alterar", "Cancelar", "Dúvida"]', true, null, 1),
  ('Plano de saúde', 'Dependente', 'text', '[]', false, 'Nome do dependente, se houver', 2),
  ('Ponto e banco de horas', 'Dia', 'date', '[]', true, null, 1),
  ('Ponto e banco de horas', 'O que aconteceu', 'select', '["Esqueci de bater", "Batida errada", "Outro"]', true, null, 2),
  ('Ponto e banco de horas', 'Horário certo', 'text', '[]', false, 'Ex.: 08:00 às 17:30', 3)
)
insert into public.ticket_form_fields (tenant_id, category_id, label, field_type, options, is_required, placeholder, sort_order, is_active)
select c.tenant_id, c.id, x.rotulo, x.tipo::public.form_field_type, x.opcoes::jsonb, x.obrigatorio, x.dica, x.ordem, true
  from campos x
  join public.ti_categories c on c.module = 'rh' and c.is_active and c.name = x.assunto
 where not exists (select 1 from public.ticket_form_fields f where f.category_id = c.id and f.label = x.rotulo);
