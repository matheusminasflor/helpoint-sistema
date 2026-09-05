-- RH: as seis tabelas ganham chave estrangeira em user_id.
--
-- POR QUE ISTO É O CONSERTO DE UM MÓDULO INTEIRO, NÃO UMA ARRUMAÇÃO
-- ─────────────────────────────────────────────────────────────────
-- O front pede `profile:user_id(full_name, ...)` nestas tabelas. O PostgREST
-- só resolve esse embed se existir uma FK que ligue a coluna ao alvo; sem ela
-- devolve PGRST200 ("Could not find a relationship"). E todo hook do módulo
-- escreve `const { data } = await ...` sem ler o `error`, então o erro vira
-- lista vazia em silêncio.
--
-- Resultado hoje: Aprovações (férias e atestados), "Últimos envios" de
-- holerites, o cofre de documentos, "Colaboradores vinculados" e
-- Aniversariantes/Tempo de casa mostram "nenhum" para sempre. O RH não
-- consegue aprovar férias nem validar atestado pela interface.
--
-- Conferido em 2026-09-04 no test-helpoint: as seis tabelas têm ZERO linhas
-- órfãs (nenhum user_id sem profile correspondente), então as constraints
-- nascem validadas, sem limpeza prévia.
--
-- ┌─ A ESCOLHA DO ON DELETE É SUA, E TEM CONSEQUÊNCIA ────────────────────┐
-- │ Está RESTRICT abaixo, de propósito: folha, atestado e holerite são     │
-- │ histórico trabalhista, e apagar por acidente é pior que travar.        │
-- │                                                                        │
-- │ O que isso muda na prática: `profiles.id` referencia                   │
-- │ `auth.users(id) ON DELETE CASCADE`. Com RESTRICT aqui, apagar o        │
-- │ usuário de um colaborador que tenha QUALQUER registro de RH passa a    │
-- │ FALHAR, em vez de apagar o histórico junto.                            │
-- │                                                                        │
-- │ Isso é desejável, mas atinge um caminho que existe hoje:               │
-- │ `RHColaboradores.tsx:148` exclui colaborador com um `confirm()`        │
-- │ simples. Esse botão passará a dar erro para quem já tem histórico —    │
-- │ o certo é trocá-lo por desativação (`status`), e isso é trabalho de    │
-- │ front, fora desta migration.                                           │
-- │                                                                        │
-- │ Se preferir o comportamento antigo, troque RESTRICT por CASCADE nas    │
-- │ seis linhas — mas então apagar um usuário apaga a folha dele.          │
-- └────────────────────────────────────────────────────────────────────────┘
--
-- `rh_employee_profiles.user_id` é NULLABLE (colaborador cadastrado sem conta
-- no sistema). FK aceita NULL, então esses registros seguem válidos.

alter table public.rh_vacation_requests
  add constraint rh_vacation_requests_user_id_fkey
  foreign key (user_id) references public.profiles(id) on delete restrict;

alter table public.rh_medical_certificates
  add constraint rh_medical_certificates_user_id_fkey
  foreign key (user_id) references public.profiles(id) on delete restrict;

alter table public.rh_payslips
  add constraint rh_payslips_user_id_fkey
  foreign key (user_id) references public.profiles(id) on delete restrict;

alter table public.rh_documents
  add constraint rh_documents_user_id_fkey
  foreign key (user_id) references public.profiles(id) on delete restrict;

alter table public.rh_employee_benefits
  add constraint rh_employee_benefits_user_id_fkey
  foreign key (user_id) references public.profiles(id) on delete restrict;

alter table public.rh_employee_profiles
  add constraint rh_employee_profiles_user_id_fkey
  foreign key (user_id) references public.profiles(id) on delete restrict;

-- Índice em cada FK: sem ele, o RESTRICT faz varredura sequencial a cada
-- tentativa de apagar um profile, e as consultas por colaborador também.
create index if not exists idx_rh_vacation_requests_user_id    on public.rh_vacation_requests (user_id);
create index if not exists idx_rh_medical_certificates_user_id on public.rh_medical_certificates (user_id);
create index if not exists idx_rh_payslips_user_id             on public.rh_payslips (user_id);
create index if not exists idx_rh_documents_user_id            on public.rh_documents (user_id);
create index if not exists idx_rh_employee_benefits_user_id    on public.rh_employee_benefits (user_id);
create index if not exists idx_rh_employee_profiles_user_id    on public.rh_employee_profiles (user_id);
