-- Quem tem o módulo RH vê a lista de empresas do grupo.
--
-- DECISÃO DO DONO em 2026-09-27, perguntado com a medição na mão: "Quem tem o RH
-- vê as empresas."
--
-- O DEFEITO QUE ISSO FECHA. `rh_companies` tinha UMA policy, `ALL` exigindo
-- `is_supervisor_or_higher` — enquanto `rh_employee_profiles`, a tabela vizinha do
-- MESMO módulo, usa `has_rh_access()`, que aceita a concessão do módulo **ou**
-- supervisor. Resultado: quem recebia o módulo RH lia a ficha dos colaboradores e
-- **não lia a lista de empresas**. O seletor de empresa nascia vazio, o cartão
-- "Empresas" mostrava 0, e cadastrar colaborador ficava impossível — porque
-- cadastrar exige escolher a empresa. Nada disso dava erro: a RLS filtra a linha e
-- devolve lista vazia, que é indistinguível de "não há empresa cadastrada".
--
-- O QUE MUDA, E O QUE NÃO MUDA. Só a LEITURA abre. Criar, editar e apagar empresa
-- continuam sendo de supervisor — nome de empresa é dado estrutural do grupo, e
-- quem cadastra gente não precisa poder mexer nele para trabalhar.
--
-- Por que duas policies em vez de uma: o Postgres não tem grupo "escrita", então a
-- de supervisor continua `FOR ALL`. Como as duas são permissivas, o SELECT efetivo
-- é a UNIÃO delas — e `has_rh_access` já contém supervisor, então a metade de
-- leitura da policy de escrita é subconjunto da outra e não amplia nada. Os nomes
-- dizem qual serve para quê, para ninguém ler a `FOR ALL` como se fosse a regra de
-- leitura.

alter policy "rh_companies_supervisor" on public.rh_companies rename to "rh_companies_escreve_supervisor";

create policy "rh_companies_le_quem_tem_o_rh"
  on public.rh_companies
  for select
  using (
    public.has_rh_access(auth.uid())
    and tenant_id = public.get_user_tenant_id()
  );

comment on policy "rh_companies_le_quem_tem_o_rh" on public.rh_companies is
  'Leitura: mesma régua de rh_employee_profiles (has_rh_access = módulo RH ou supervisor). Decisão do dono, 2026-09-27. Escrita continua em rh_companies_escreve_supervisor.';
