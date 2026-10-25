-- "Pedir compra" (proposta "Helpoint no dia a dia", etapa 4b): quem pede diz o quê, quanto, para quê e, se souber, UM
-- orçamento; as outras cotações são de quem compra (Tesler). Até aqui só quem pediu (e quem aprova) gravava orçamento
-- antes da aprovação; agora quem compra (Compras › Configurações › Quem compra) também, enquanto a compra espera a
-- decisão. A regra dos três orçamentos continua no banco (`compras_exige_tres_orcamentos`): menos de três, quem aprova
-- escreve o porquê.
create policy compras_orcamentos_quem_compra_cota on public.compras_orcamentos for insert to authenticated
  with check (tenant_id = (select public.get_user_tenant_id())
              and exists (select 1 from public.compras_solicitacoes r
                            join public.compras_config c on c.tenant_id = r.tenant_id
                           where r.id = compras_orcamentos.request_id and r.tenant_id = compras_orcamentos.tenant_id
                             and r.status = 'pending_approval' and not r.caixinha
                             and c.comprador_id = auth.uid()));
-- Quem compra lê os orçamentos das compras que ainda vai cotar (a policy de leitura dele era só a do setor Compras).
create policy compras_orcamentos_quem_compra_le on public.compras_orcamentos for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id())
         and exists (select 1 from public.compras_config c where c.tenant_id = compras_orcamentos.tenant_id and c.comprador_id = auth.uid()));
