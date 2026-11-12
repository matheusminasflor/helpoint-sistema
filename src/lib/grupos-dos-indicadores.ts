// Os indicadores do Comercial em 5 grupos (revisão aprovada pelo dono, https://claude.ai/artifact/DogLjeM9MuJUzFt2H7ALFV,
// seção 4). Lei de Miller: blocos pequenos no lugar de 20 linhas soltas. O grupo sem meta e sem nenhum registro fica
// fechado, com o total ao lado ("Ações · 0 de 6"), e abre com um clique.
//
// O grupo de cada indicador do catálogo sai do `nome` (o que a vendedora marca no lançamento, e não muda); indicador
// novo que o gestor criar cai em "Ações" até ganhar um lugar aqui.

export type GrupoDoIndicador = 'resultado' | 'carteira' | 'atividade' | 'acoes' | 'cobranca';

export const GRUPOS_DOS_INDICADORES: { id: GrupoDoIndicador; titulo: string }[] = [
  { id: 'resultado', titulo: 'Resultado' },
  { id: 'carteira', titulo: 'Carteira' },
  { id: 'atividade', titulo: 'Atividade' },
  { id: 'acoes', titulo: 'Ações' },
  { id: 'cobranca', titulo: 'Cobrança' },
];

/** Os quatro indicadores que o banco calcula (não estão no catálogo), com o nome de mercado. */
export const ROTULO_DO_CALCULADO: Record<string, string> = {
  valor_vendas: 'Venda realizada',
  pct_meta: 'Atingimento da meta',
  clientes_com_venda: 'Clientes positivados',
  clientes_relacionados: 'Clientes atendidos',
};

const GRUPO_POR_NOME: Record<string, GrupoDoIndicador> = {
  'Contato para venda': 'atividade',
  'Venda ativa': 'atividade',
  'Venda passiva': 'atividade',
  'Passiva aumentada': 'atividade',
  'Prospecção ativa': 'atividade',
  'Prospecção passiva': 'atividade',
  'Venda promocional': 'acoes',
  'Marcar reunião técnica': 'acoes',
  'Reunião técnica realizada': 'acoes',
  'Venda de evento': 'acoes',
  'Evento realizado': 'acoes',
  'Demanda pontual': 'acoes',
  'Contato inadimplente': 'cobranca',
  'Venda inadimplente/inativo': 'cobranca',
};

/** `metrica` é a chave da linha do painel: `valor_vendas`, `ind:<id>`, `aberto:<id>`… */
export function grupoDaLinha(metrica: string, nomePorId: ReadonlyMap<string, string>): GrupoDoIndicador {
  if (metrica === 'valor_vendas' || metrica === 'pct_meta') return 'resultado';
  if (metrica === 'clientes_com_venda' || metrica === 'clientes_relacionados') return 'carteira';
  const id = metrica.replace(/^(ind|aberto):/, '');
  return GRUPO_POR_NOME[nomePorId.get(id) ?? ''] ?? 'acoes';
}

interface LinhaComFarol { metrica: string; cor: string; realizado: number | null }

/** Fechado: nenhuma linha tem meta e nenhuma tem registro. O que pesa aparece primeiro. */
export function grupoFechado(linhas: LinhaComFarol[]): boolean {
  return linhas.every((l) => l.cor === 'sem_meta' && !l.realizado);
}

/** As linhas de uma vendedora, nos 5 grupos e na ordem deles; grupo sem linha nenhuma não aparece. */
export function agruparIndicadores<L extends LinhaComFarol>(linhas: L[], nomePorId: ReadonlyMap<string, string>) {
  return GRUPOS_DOS_INDICADORES
    .map((g) => ({ ...g, linhas: linhas.filter((l) => grupoDaLinha(l.metrica, nomePorId) === g.id) }))
    .filter((g) => g.linhas.length > 0);
}
