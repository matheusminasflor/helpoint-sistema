-- A 2ª FORMA DE PAGAMENTO SÓ QUANDO A 1ª PODE FALHAR (proposta "Helpoint no dia a dia", etapa 4 · Compras, aprovada em
-- 2026-10-24). Desde 2026-10-15 ela era obrigatória em toda aprovação. Agora: obrigatória quando a 1ª é cartão ou
-- boleto (o cartão recusa, o boleto não sai); com Pix ou Caixinha é opcional. Dada, continua tendo de ser diferente.
do $$
declare
  v_def text;
  de constant text := $a$    if new.forma_pagamento_2 is null or new.forma_pagamento_2 = new.forma_pagamento then
      raise exception 'Escolha também a 2ª forma de pagamento, diferente da 1ª: é a que o comprador usa se a 1ª não der certo.'
        using errcode = '23514';
    end if;$a$;
  para constant text := $b$    if new.forma_pagamento_2 is null and new.forma_pagamento in ('cartao', 'boleto') then
      raise exception 'Com cartão ou boleto, escolha também a 2ª forma de pagamento: é a que o comprador usa se a 1ª não der certo.'
        using errcode = '23514';
    end if;
    if new.forma_pagamento_2 is not null and new.forma_pagamento_2 = new.forma_pagamento then
      raise exception 'A 2ª forma de pagamento tem de ser diferente da 1ª.' using errcode = '23514';
    end if;$b$;
begin
  select pg_get_functiondef('public.compras_aprovar_exige_pagamento_e_filial'::regproc) into v_def;
  if position(de in v_def) = 0 then
    raise exception 'compras_aprovar_exige_pagamento_e_filial não tem o trecho esperado da 2ª forma';
  end if;
  execute replace(v_def, de, para);
end;
$$;
