// Gera supabase/migrations/20260917020000_bling_passo_fluxo.sql a partir da
// versão vigente do motor (20260915010000, que por sua vez veio de 20260912010000):
// copia `automation_validate_flow` e `automation_run_step` e acrescenta o tipo de
// passo `bling_order` (externo: quem executa é a edge function automation-worker,
// que chama o Bling com o token da empresa). Cada troca precisa casar exatamente
// uma vez — senão o script para. Uso: node scripts/gen-migration-bling.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const src = readFileSync('supabase/migrations/20260915010000_automacoes_modelos.sql', 'utf8').split('\n');
const slice = (from, to) => src.slice(from - 1, to).join('\n');

function replaceOnce(text, from, to, label) {
  const n = text.split(from).length - 1;
  if (n !== 1) throw new Error(`${label}: esperava 1 ocorrência, achei ${n}`);
  return text.replace(from, to);
}

// ── validate_flow (linhas 127–222): só a lista de tipos de passo ─────────────
let validate = slice(127, 222);
validate = replaceOnce(validate,
  "'send_email', 'http_request', 'ai_text', 'create_receivable') then",
  "'send_email', 'http_request', 'ai_text', 'create_receivable', 'bling_order') then",
  'validate_flow: kinds');

// ── run_step (linhas 228–469): o passo é externo e exige um pedido ───────────
let run = slice(228, 469);
run = replaceOnce(run,
  "  when 'send_email', 'http_request', 'ai_text' then\n",
  `  when 'bling_order' then
    -- Pedido (e nota) no Bling (CRM-2b): externo, com o token da empresa; exige um pedido no gatilho.
    if v_entity <> 'crm_order' then raise exception 'a acao "pedido no Bling" exige um pedido'; end if;
    return jsonb_build_object('status', 'waiting', 'pending_kind', p_step->>'kind');

  when 'send_email', 'http_request', 'ai_text' then
`,
  'run_step: bling_order');

const header = `-- Leva CRM-2b: passo de fluxo "pedido no Bling" (bling_order). 2026-09-12.
-- GERADO por scripts/gen-migration-bling.mjs a partir de 20260915010000 — não editar à mão.
-- \`automation_validate_flow\` aceita o tipo novo; \`automation_run_step\` o trata como passo
-- externo (run fica em waiting com pending_kind = 'bling_order' e o worker executa) e recusa
-- fluxo cujo gatilho não é um pedido.
`;

writeFileSync('supabase/migrations/20260917020000_bling_passo_fluxo.sql', `${header}\n${validate}\n\n${run}\n`);
console.log('ok: supabase/migrations/20260917020000_bling_passo_fluxo.sql');
