// Etapa 0b da proposta "Helpoint no dia a dia" (2026-10-24): tira do menu de permissões as opções que nenhuma tela
// e nenhuma regra do banco lê (conferido no código e nos perfis da produção). Roda uma vez; falha se o texto mudou.
import { readFileSync, writeFileSync } from 'node:fs';
const F = 'src/config/access-profile-schemas.ts';
let s = readFileSync(F, 'utf8');
const tira = (re, esperado, nome) => {
  const n = (s.match(re) || []).length;
  if (n === 0) throw new Error(`${nome}: não achei`); console.log(nome, n);
  s = s.replace(re, '');
};
tira(/      \{ key: 'dashboard', label: 'Painel', actions: \[\{ key: 'view', label: 'Visualizar' \}\] \},\n/g, 8, 'Painel');
tira(/      \.\.\.CONFIG_SECTIONS,\n/g, 6, 'Perfis (CONFIG_SECTIONS)');
tira(/      \{ key: 'profiles', label: 'Perfis de acesso', actions: \[\n        \.\.\.CRUD,\n        \{ key: 'assign_users', label: 'Atribuir a usuários', sensitive: true \},\n      \]\},\n/g, 2, 'Perfis (inline)');
tira(/      \{ key: 'campaigns', label: 'Campanhas', actions: CRUD \},\n/g, 1, 'Campanhas');
tira(/      \{ key: 'quotations', label: 'Cotações', actions: \[\n        \.\.\.CRUD,\n        \{ key: 'approve', label: 'Aprovar' \},\n      \]\},\n/g, 1, 'Cotações');
tira(/      \{ key: 'ugc', label: 'UGC', actions: \[\n        \.\.\.CRUD,\n        \{ key: 'approve', label: 'Aprovar' \},\n      \]\},\n/g, 1, 'UGC');
tira(/        \{ key: 'approve_payment', label: 'Aprovar pagamento', sensitive: true \},\n/g, 1, 'Aprovar pagamento');
tira(/        \{ key: 'create', label: 'Lançar entrada e saída' \},\n/g, 1, 'Caixinha lançar');
// Aprovar tutorial: TI (Base de Conhecimento) e Qualidade (POPs)
s = s.replace(/(\{ key: 'knowledge', label: 'Base de Conhecimento', actions: )\[\n        \.\.\.CRUD,\n        \{ key: 'approve', label: 'Aprovar' \},\n      \]\}/, '$1CRUD }');
s = s.replace(/(\{ key: 'pops', label: 'POPs \/ Base de Conhecimento', actions: \[\n        \.\.\.CRUD,\n)        \{ key: 'approve', label: 'Aprovar' \},\n/, '$1');
// O bloco CONFIG_SECTIONS some (só tinha "Perfis")
s = s.replace(/const CONFIG_SECTIONS: ModuleSchema\[\] = \[\n  \{ key: 'profiles', label: 'Perfis de acesso', actions: \[\n    \.\.\.CRUD,\n    \{ key: 'assign_users', label: 'Atribuir a usuários', sensitive: true \},\n  \]\},\n\];\n\n/,
  `// "Perfis de acesso" saiu de todos os setores (dono, 2026-10-24, decisão 4 da proposta): nenhuma tela nem regra lia a
// caixinha; quem edita perfis continua sendo só dono e administrador. Saíram junto as opções que não valiam nada:
// Painel (a fila já tem opção), Campanhas, Cotações e UGC (sem tela), Aprovar pagamento (o banco só a usava como
// sinônimo de editar), Caixinha · lançar (quem lança é o responsável) e Aprovar tutorial (nunca perguntado).\n\n`);
// O passo 3 de `normalizePermissions` só copiava o "settings" antigo para "Perfis": sem Perfis, ele não faz nada.
s = s.replace(/\n  \/\/ 3\. seção única "settings" antiga → seções de configuração granulares\n[\s\S]*?\n  \}\n\n  return out;/, '\n\n  return out;');
const sobra = s.split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => /CONFIG_SECTIONS|key: 'profiles'|key: 'dashboard'|approve_payment|key: 'campaigns'|key: 'ugc'|key: 'quotations'/.test(l));
if (sobra.length) throw new Error('sobrou: ' + JSON.stringify(sobra));
if (/key: 'knowledge'[^\n]*\n        \{ key: 'approve'/.test(s)) throw new Error('knowledge ainda aprova');
writeFileSync(F, s);
console.log('ok');
