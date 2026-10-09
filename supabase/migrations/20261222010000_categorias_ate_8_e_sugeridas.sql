-- CATEGORIAS: ATÉ 8 POR SETOR, AS SUGERIDAS, E O GESTOR DO FINANCEIRO CONFIGURA (dono, 2026-10-09).
--
-- "Verifique por setor quais categorias seria ideal já ter pré-criadas e um limite de no máximo 8."
-- Decisões (múltipla escolha + ajuste do dono):
--   1. até 8 categorias PRINCIPAIS ativas por setor (as subcategorias ficam livres);
--   2. acrescentar as sugeridas — nada some nem muda de nome; Marketing e TI ficam como estão; Comercial só
--      ganha "Devolução e troca"; o desconto ao cliente é do Financeiro;
--   3. "Os gestores não conseguem mexer em categorias": medido, o banco já deixa o perfil Gestor (Comercial,
--      Qualidade, Educacional, Expedição e Produção conseguem). Não conseguia o Gestor do FINANCEIRO, com
--      "Configurar chamados" desligado — liga aqui. Marketing, RH, TI e Compras não têm ninguém com perfil
--      Gestor: o dono atribui em Pessoas e acessos.

-- ─── 1. As sugeridas (antes do limite, e a conta fecha em ≤ 8 em todo setor) ──────────────────────
insert into public.ti_categories (tenant_id, module, name, sort_order, is_purchase)
select t.id, s.module, s.name, s.ordem, s.module = 'compras'
  from public.tenants t
 cross join (values
   ('qualidade',  'Análise e laudo de lote', 6),
   ('qualidade',  'Registro e notificação Anvisa', 7),
   ('rh',         'Ponto e banco de horas', 6),
   ('rh',         'Treinamento e desenvolvimento', 7),
   ('financeiro', 'Pagamento a fornecedor', 3),
   ('financeiro', 'Nota fiscal e boleto', 4),
   ('financeiro', 'Adiantamento', 5),
   ('financeiro', 'Cobrança de cliente', 6),
   ('financeiro', 'Desconto ao cliente', 7),
   ('financeiro', 'Outros', 99),
   ('compras',    'Embalagens e insumos', 2),
   ('compras',    'Equipamentos e TI', 3),
   ('compras',    'Material de escritório', 4),
   ('compras',    'Serviços', 5),
   ('compras',    'Material de marketing', 6),
   ('compras',    'Outros', 99),
   ('comercial',  'Devolução e troca', 3),
   ('educacional','Material didático', 4),
   ('educacional','Evento e workshop', 5),
   ('expedicao',  'Retirada no local', 4),
   ('expedicao',  'Amostras e brindes', 5),
   ('producao',   'Envase e rotulagem', 5),
   ('producao',   'Programação (PCP)', 6)
 ) as s(module, name, ordem)
 where not exists (select 1 from public.ti_categories c
                    where c.tenant_id = t.id and c.module = s.module and c.parent_id is null
                      and lower(btrim(c.name)) = lower(s.name));

-- "Outros" por último, nos setores que ganharam categoria nova.
update public.ti_categories set sort_order = 99
 where parent_id is null and lower(btrim(name)) = 'outros' and sort_order < 99
   and module in ('qualidade', 'rh', 'financeiro', 'compras', 'comercial', 'educacional', 'expedicao', 'producao');

-- ─── 2. Até 8 categorias principais ativas por setor ──────────────────────────────────────────────
-- AFTER, e não BEFORE: quem não tem permissão recebe o "sem permissão" da policy (que vem antes), não o
-- do limite.
create or replace function public.categoria_ate_8_por_setor()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.parent_id is not null or not coalesce(new.is_active, true) then
    return null;
  end if;
  if (select count(*) from public.ti_categories c
       where c.tenant_id = new.tenant_id and c.module = new.module
         and c.parent_id is null and coalesce(c.is_active, true)) > 8 then
    raise exception 'O setor já tem 8 categorias: junte ou desative uma antes de criar outra.'
      using errcode = '23514', constraint = 'categoria_ate_8_por_setor';
  end if;
  return null;
end;
$$;
revoke all on function public.categoria_ate_8_por_setor() from public, anon, authenticated;

drop trigger if exists trg_categoria_ate_8_por_setor on public.ti_categories;
create trigger trg_categoria_ate_8_por_setor after insert or update of is_active, parent_id, module on public.ti_categories
  for each row execute function public.categoria_ate_8_por_setor();

-- ─── 3. O Gestor do Financeiro configura os chamados do Financeiro ───────────────────────────────
update public.access_profiles
   set permissions = jsonb_set(permissions, '{config_chamados}', '{"view": true, "edit": true}'::jsonb)
 where department = 'financeiro' and name = 'Gestor';
