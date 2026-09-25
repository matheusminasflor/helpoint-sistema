// Diretoria (L5, reorganizada na Frente 3) — a visão do diretor.
//
// Mesmo mecanismo do Insights do Comercial (`ComercialInsights.tsx`): uma
// rota só (`/diretoria`), a escolha vive em `?visao=`, e a lista de visões
// mora em `@/config/diretoria-insights.ts` para o menu lateral ler sem
// importar esta página (`AppSidebar.tsx`, children de "Insights").
//
// Decisão D6 continua valendo: é visão, não módulo com fila própria. Não há
// tabela nova para os objetivos e chamados por setor (ficaram na visão
// "Setores"); metas e carteiras (`com_metas`/`com_carteira_membros`,
// `metas_carteira`/`metas_ano`) são a exceção que confirma a regra — são
// tabelas do Comercial, e a Diretoria só GANHA VISÕES para lê-las e
// defini-las.
//
// Etapa 4 (2026-09-25): quatro visões, não sete. "Carteiras" e "Conciliação"
// viraram blocos de "Metas e carteiras"; "Setores" virou dois blocos do
// "Resumo". Os `?visao=` velhos não quebram — `resolverVisaoDiretoria` os
// resolve para onde o conteúdo mora agora.
import { useSearchParams } from 'react-router-dom';
import { resolverVisaoDiretoria } from '@/config/diretoria-insights';
import DiretoriaResumo from './DiretoriaResumo';
import DiretoriaMetas from './DiretoriaMetas';
import DiretoriaClientes from './DiretoriaClientes';
import DiretoriaProdutos from './DiretoriaProdutos';

export default function DiretoriaPainel() {
  const [params] = useSearchParams();
  const visao = resolverVisaoDiretoria(params.get('visao'));

  switch (visao) {
    case 'metas': return <DiretoriaMetas />;
    case 'clientes': return <DiretoriaClientes />;
    case 'produtos': return <DiretoriaProdutos />;
    default: return <DiretoriaResumo />;
  }
}
