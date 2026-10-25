// Calendário de ausências (etapa 5; `ausencias_no_periodo`): quem estará fora e quando, antes de aprovar férias.
// Decisão do dono (2026-10-25): o RH vê o tipo (férias, atestado, falta); o gestor vê da própria equipe as férias e
// "Ausente", sem o motivo. Quem não é RH nem gestor não vê ninguém.
import { CalendarOff } from 'lucide-react';
import { ModeloDeRelatorio, type ColunaDoRelatorio } from '@/components/relatorios/ModeloDeRelatorio';
import { usePeriodoDoRelatorio } from '@/hooks/usePeriodoDoRelatorio';
import { useRelatorioNosDoisPeriodos, type Ausencia } from '@/hooks/useRelatorios';
import { diasEntre } from '@/lib/relatorios-novos';
import { todayISO } from '@/lib/dates';

const dia = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

export default function CalendarioDeAusencias() {
  const periodo = usePeriodoDoRelatorio();
  const { linhas, antes, carregando, erro } = useRelatorioNosDoisPeriodos<Ausencia>('ausencias_no_periodo', periodo.atual, periodo.anterior);
  const hoje = todayISO();
  const foraHoje = new Set(linhas.filter((l) => l.de <= hoje && l.ate >= hoje).map((l) => l.user_id));
  const pessoas = (ls: Ausencia[]) => new Set(ls.map((l) => l.user_id)).size;
  const colunas: ColunaDoRelatorio<Ausencia>[] = [
    { chave: 'nome', rotulo: 'Pessoa', valor: (l) => l.nome },
    { chave: 'tipo', rotulo: 'Tipo', valor: (l) => l.tipo },
    { chave: 'de', rotulo: 'De', valor: (l) => l.de, mostrar: (l) => dia(l.de) },
    { chave: 'ate', rotulo: 'Até', valor: (l) => l.ate, mostrar: (l) => dia(l.ate) },
    { chave: 'dias', rotulo: 'Dias', valor: (l) => diasEntre(l.de, l.ate), direita: true },
    { chave: 'agora', rotulo: 'Agora', valor: (l) => (l.de <= hoje && l.ate >= hoje ? 'fora hoje' : l.de > hoje ? 'vai sair' : 'voltou') },
  ];
  return (
    <ModeloDeRelatorio titulo="Calendário de ausências" icone={CalendarOff} arquivo="calendario-de-ausencias"
      descricao="Quem estará fora e quando: férias aprovadas, atestados e faltas. O gestor vê a equipe, sem o motivo; o RH vê o tipo."
      periodo={periodo} linhas={linhas} colunas={colunas} chave={(l, i) => `${l.user_id}-${l.de}-${i}`} carregando={carregando} erro={erro}
      vazio="Ninguém fora no período — ou você não é RH nem gestor de ninguém."
      resumo={[
        { rotulo: 'Fora hoje', valor: foraHoje.size, formatar: String },
        { rotulo: 'Pessoas fora no período', valor: pessoas(linhas), anterior: pessoas(antes), formatar: String },
        { rotulo: 'Ausências no período', valor: linhas.length, anterior: antes.length, formatar: String },
      ]} />
  );
}
