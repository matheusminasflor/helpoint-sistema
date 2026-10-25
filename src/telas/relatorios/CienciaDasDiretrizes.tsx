// Ciência das diretrizes (etapa 5): quem ainda não leu a regra nova. Uma linha por pessoa e diretriz que falta, das
// diretrizes publicadas que pedem ciência, nos setores em que eu edito diretrizes (o gestor). "Quem deve dar ciência" é
// quem é do setor — a mesma régua do "X de Y cientes" da Gestão de diretrizes.
import { useQuery } from '@tanstack/react-query';
import { BookCheck } from 'lucide-react';
import { ModeloDeRelatorio, type ColunaDoRelatorio } from '@/components/relatorios/ModeloDeRelatorio';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useConfiguracaoDosSetores } from '@/hooks/useAccessProfiles';
import { useCienciasDasDiretrizes, useDiretrizes } from '@/hooks/useDiretrizes';
import { SETORES_COM_DIRETRIZ } from '@/config/diretrizes';
import { rotuloDoSetor } from '@/lib/setores';
import { unwrap } from '@/lib/supabase-result';
import type { Department } from '@/config/access-profile-schemas';

interface Linha { chave: string; pessoa: string; diretriz: string; setor: string; versao: number; publicada: string | null }

export default function CienciaDasDiretrizes() {
  const { tenantId } = useAuth();
  const perfil = useConfiguracaoDosSetores();
  const meus = SETORES_COM_DIRETRIZ.map((s) => s.setor)
    .filter((s) => !perfil.isLoading && !perfil.isError && perfil.pode(s as Department, 'diretrizes', 'edit'));
  const { data: todas = [], isLoading, error } = useDiretrizes();
  const pedem = todas.filter((d) => d.exige_ciencia && d.status === 'publicada' && d.versao_atual > 0 && (meus as string[]).includes(d.setor));
  const { data: cientes } = useCienciasDasDiretrizes(pedem);
  const membros = useQuery({
    queryKey: ['diretrizes', 'membros-dos-setores', tenantId, meus.join(',')],
    enabled: !!tenantId && meus.length > 0,
    queryFn: async () => Object.fromEntries(await Promise.all(meus.map(async (s) =>
      [s, (unwrap(await supabase.rpc('membros_do_setor', { p_setor: s })) ?? []) as { id: string; full_name: string | null; email: string }[]] as const))),
  });
  const linhas: Linha[] = pedem.flatMap((d) => (membros.data?.[d.setor] ?? [])
    .filter((m) => !cientes?.get(d.id)?.has(m.id))
    .map((m) => ({ chave: `${d.id}-${m.id}`, pessoa: m.full_name || m.email, diretriz: d.titulo, setor: d.setor, versao: d.versao_atual, publicada: d.publicada_em })));
  const esperadas = pedem.reduce((s, d) => s + (membros.data?.[d.setor]?.length ?? 0), 0);
  const colunas: ColunaDoRelatorio<Linha>[] = [
    { chave: 'pessoa', rotulo: 'Quem falta', valor: (l) => l.pessoa },
    { chave: 'diretriz', rotulo: 'Diretriz', valor: (l) => l.diretriz },
    { chave: 'setor', rotulo: 'Setor', valor: (l) => rotuloDoSetor(l.setor) },
    { chave: 'versao', rotulo: 'Versão', valor: (l) => l.versao, direita: true },
    { chave: 'publicada', rotulo: 'Publicada em', valor: (l) => l.publicada?.slice(0, 10) ?? null,
      mostrar: (l) => (l.publicada ? `${l.publicada.slice(8, 10)}/${l.publicada.slice(5, 7)}` : '—') },
  ];
  return (
    <ModeloDeRelatorio titulo="Ciência das diretrizes" icone={BookCheck} arquivo="ciencia-das-diretrizes"
      descricao="Quem ainda não deu ciência da versão atual das diretrizes que pedem ciência, nos setores em que você edita diretrizes."
      linhas={linhas} colunas={colunas} chave={(l) => l.chave} carregando={isLoading || membros.isLoading} erro={error ?? membros.error}
      vazio={meus.length === 0 ? 'Você não edita as diretrizes de nenhum setor.' : 'Todo mundo deu ciência.'}
      resumo={[
        { rotulo: 'Diretrizes que pedem ciência', valor: pedem.length, formatar: String },
        { rotulo: 'Cientes', valor: esperadas ? Math.round(((esperadas - linhas.length) / esperadas) * 100) : null, formatar: (n) => `${n}%`,
          nota: esperadas ? `${esperadas - linhas.length} de ${esperadas}` : undefined, ruim: esperadas > 0 && linhas.length > 0 },
        { rotulo: 'Pessoas com pendência', valor: new Set(linhas.map((l) => l.pessoa)).size, formatar: String },
      ]} />
  );
}
