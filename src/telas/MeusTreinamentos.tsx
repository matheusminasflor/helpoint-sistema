// Meus treinamentos (rodada 2, R6): as turmas em que a pessoa está inscrita — próximas e já feitas —, com onde é, a
// carga horária e a situação. Lê `meus_treinamentos()` (só as da própria pessoa; as tabelas do Educacional seguem
// fechadas para quem não é do setor).
import { useQuery } from '@tanstack/react-query';
import { GraduationCap, MapPin, Video } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { unwrap, mensagemDeErro } from '@/lib/supabase-result';
import { dataHora } from '@/lib/dates';

interface MeuTreinamento {
  inscricao_id: string; treinamento: string; horas: number | null; inicio: string; fim: string | null;
  modalidade: string; local: string | null; situacao: string; concluido_em: string | null;
}

const SITUACAO: Record<string, string> = {
  inscrito: 'Inscrito', presente: 'Presente', concluido: 'Concluído', faltou: 'Faltou', cancelado: 'Inscrição cancelada',
};

export default function MeusTreinamentos() {
  const { user } = useAuth();
  const { data = [], isLoading, error } = useQuery({
    queryKey: ['meus-treinamentos', user?.id], enabled: !!user?.id,
    queryFn: async () => unwrap(await supabase.rpc('meus_treinamentos' as never)) as unknown as MeuTreinamento[],
  });
  const agora = new Date().toISOString();
  const proximos = data.filter((t) => t.inicio >= agora && t.situacao !== 'cancelado').sort((a, b) => a.inicio.localeCompare(b.inicio));
  const feitos = data.filter((t) => !proximos.includes(t));
  const horas = data.filter((t) => t.situacao === 'concluido').reduce((s, t) => s + Number(t.horas ?? 0), 0);
  const linha = (t: MeuTreinamento) => (
    <li key={t.inscricao_id} className="py-3 flex gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-[15px] font-medium">{t.treinamento}</p>
        <p className="text-[13px] text-muted-foreground flex flex-wrap items-center gap-x-2">
          <span>{dataHora(t.inicio)}{t.horas ? ` · ${Number(t.horas).toLocaleString('pt-BR')} h` : ''}</span>
          {t.local && (
            <span className="inline-flex items-center gap-1">
              {t.modalidade === 'online' ? <Video className="w-3.5 h-3.5" aria-hidden="true" /> : <MapPin className="w-3.5 h-3.5" aria-hidden="true" />}
              {/^https?:\/\//.test(t.local) ? <a href={t.local} target="_blank" rel="noreferrer" className="text-primary underline">entrar na sala</a> : t.local}
            </span>
          )}
        </p>
      </div>
      <span className={t.situacao === 'concluido' ? 'text-[13px] text-status-success shrink-0' : t.situacao === 'faltou' ? 'text-[13px] text-status-danger shrink-0' : 'text-[13px] text-muted-foreground shrink-0'}>
        {SITUACAO[t.situacao] ?? t.situacao}
      </span>
    </li>
  );
  return (
    <div>
      <PageHeader title="Meus treinamentos" icon={GraduationCap}
        description={horas ? `Você já concluiu ${horas.toLocaleString('pt-BR')} horas de treinamento.` : 'Os treinamentos em que você está inscrito.'} />
      <div className="p-4 sm:p-6 space-y-4 max-w-3xl">
        {error && <p className="text-[14px] text-status-danger">{mensagemDeErro(error)}</p>}
        <Card className="p-4">
          <h2 className="text-[16px] font-semibold">Próximos</h2>
          {isLoading ? <p className="text-sm text-muted-foreground">Carregando…</p> : proximos.length === 0
            ? <p className="text-sm text-muted-foreground py-2">Nenhuma turma marcada para você. O Educacional inscreve a equipe nas turmas.</p>
            : <ul className="divide-y divide-border">{proximos.map(linha)}</ul>}
        </Card>
        {feitos.length > 0 && (
          <Card className="p-4">
            <h2 className="text-[16px] font-semibold">Já aconteceram</h2>
            <ul className="divide-y divide-border">{feitos.map(linha)}</ul>
          </Card>
        )}
      </div>
    </div>
  );
}
