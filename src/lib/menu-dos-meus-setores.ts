// O menu do celular com os setores da pessoa em cima (rodada 2, decisão 3 do dono, 2026-10-25). Em cima ficam o
// Início, os setores dela (`setores_da_pessoa` no banco: setor do perfil, acesso e perfil de acesso) e a Diretoria de
// quem a vê; o resto fica em "Todos os setores", recolhido; Configurações fica sempre no fim. Sem setor nenhum (o dono
// sem setor), o menu fica como era: tudo à vista.
import { lugarNoMenuDoModulo } from '@/lib/lugar-no-menu';

const SEMPRE_EM_CIMA = ['inicio', 'diretoria'];
const NO_FIM = 'config';

export function separarOMenu<G extends { id: string }>(grupos: G[], meusSetores: readonly string[] | null | undefined) {
  const fim = grupos.filter((g) => g.id === NO_FIM);
  const resto = grupos.filter((g) => g.id !== NO_FIM);
  if (!meusSetores?.length) return { meus: resto, outros: [] as G[], fim };
  const meusGrupos = new Set(meusSetores.map((m) => lugarNoMenuDoModulo(m).grupo));
  const meu = (g: G) => SEMPRE_EM_CIMA.includes(g.id) || meusGrupos.has(g.id);
  return { meus: resto.filter(meu), outros: resto.filter((g) => !meu(g)), fim };
}
