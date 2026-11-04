// O menu com os setores da pessoa em cima (rodada 2, decisão 3 do dono, 2026-10-25; desde a proposta de 2026-11-04 vale
// também no computador). No topo, Início, Meu trabalho e Empresa; depois os setores dela (`setores_da_pessoa` no banco:
// setor do perfil, acesso e perfil de acesso); o resto fica em "Outros setores", recolhido; Diretoria e Configurações
// fecham a lista. Sem setor nenhum (o dono sem setor), todos os setores ficam à vista.
import { lugarNoMenuDoModulo } from '@/lib/lugar-no-menu';

const NO_TOPO = ['inicio', 'trabalho', 'empresa'];
const NO_FIM = ['diretoria', 'config'];

export function separarOMenu<G extends { id: string }>(grupos: G[], meusSetores: readonly string[] | null | undefined) {
  const topo = grupos.filter((g) => NO_TOPO.includes(g.id));
  const fim = grupos.filter((g) => NO_FIM.includes(g.id));
  const setores = grupos.filter((g) => !NO_TOPO.includes(g.id) && !NO_FIM.includes(g.id));
  if (!meusSetores?.length) return { topo, meus: setores, outros: [] as G[], fim };
  const meusGrupos = new Set(meusSetores.map((m) => lugarNoMenuDoModulo(m).grupo));
  return { topo, meus: setores.filter((g) => meusGrupos.has(g.id)), outros: setores.filter((g) => !meusGrupos.has(g.id)), fim };
}
