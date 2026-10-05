// A consulta das diretrizes (decisão do dono, 2026-10-04). Três portas para a mesma tela:
//   * no menu de cada setor, "Diretrizes do <setor>" — só as daquele setor;
//   * no Início, "Diretrizes" — todas que a pessoa pode ler, de qualquer setor;
//   * na Diretoria — todas, de todos os setores (o banco dá à Diretoria também as arquivadas).
// Quem lê o quê é o banco que decide (`diretriz_pode_ler`).
import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { BookMarked, Search } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { EmptyState } from '@/components/ui/empty-state';
import { LeituraDaDiretriz } from '@/components/diretrizes/LeituraDaDiretriz';
import { useDiretrizes, type Diretriz } from '@/hooks/useDiretrizes';
import { semAcento } from '@/lib/utils';
import { rotuloDoSetor } from '@/lib/setores';
import {
  nomeDasDiretrizes, SETORES_COM_DIRETRIZ, type SetorComDiretriz,
} from '@/config/diretrizes';


export default function ConsultaDeDiretrizes({ setor, titulo }: { setor?: SetorComDiretriz; titulo?: string }) {
  const { data: todas = [], isLoading, error } = useDiretrizes(setor);
  const [busca, setBusca] = useState('');
  const [filtroSetor, setFiltroSetor] = useState<string>('');
  const [comArquivadas, setComArquivadas] = useState(false);
  const [aberta, setAberta] = useState<Diretriz | null>(null);

  // A consulta mostra o que foi publicado; o rascunho é da aba das Configurações.
  const lidas = todas.filter((d) => d.status === 'publicada' || (comArquivadas && d.status === 'arquivada'));
  const temArquivadas = todas.some((d) => d.status === 'arquivada');
  const lista = useMemo(() => {
    const q = semAcento(busca.trim());
    return lidas.filter((d) =>
      (!filtroSetor || d.setor === filtroSetor)
      && (!q || semAcento(`${d.titulo} ${d.conteudo}`).includes(q)));
  }, [lidas, busca, filtroSetor]);

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-4">
      <PageHeader
        className="bg-transparent border-0 px-0 py-0"
        icon={BookMarked}
        title={titulo ?? (setor ? nomeDasDiretrizes(setor) : 'Diretrizes')}
        description={setor
          ? 'As regras e orientações do setor, sempre na versão publicada mais recente.'
          : 'As diretrizes de todos os setores que você pode ler.'}
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar no título e no texto" className="pl-8" aria-label="Buscar diretriz" />
        </div>
        {!setor && (
          <select
            value={filtroSetor} onChange={(e) => setFiltroSetor(e.target.value)} aria-label="Filtrar por setor"
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="">Todos os setores</option>
            {SETORES_COM_DIRETRIZ.map((s) => <option key={s.setor} value={s.setor}>{rotuloDoSetor(s.setor)}</option>)}
          </select>
        )}
        {temArquivadas && (
          <div className="flex items-center gap-2">
            <Switch id="com-arquivadas" checked={comArquivadas} onCheckedChange={setComArquivadas} />
            <Label htmlFor="com-arquivadas" className="text-sm">Mostrar arquivadas</Label>
          </div>
        )}
      </div>

      {error ? (
        <p className="text-sm text-destructive">Não foi possível carregar as diretrizes.</p>
      ) : isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : lista.length === 0 ? (
        <EmptyState icon={BookMarked} title={busca || filtroSetor ? 'Nenhuma diretriz encontrada' : 'Nenhuma diretriz publicada'}
          description={busca || filtroSetor ? 'Tente outra busca.' : 'Quando o setor publicar uma diretriz, ela aparece aqui.'} />
      ) : (
        <ul className="divide-y rounded-lg border bg-card">
          {lista.map((d) => (
            <li key={d.id}>
              <button type="button" onClick={() => setAberta(d)} className="w-full text-left px-4 py-3 hover:bg-muted/40 transition-colors">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-foreground">{d.titulo}</span>
                  {!setor && <Badge variant="outline">{rotuloDoSetor(d.setor)}</Badge>}
                  {d.exige_ciencia && <Badge variant="secondary">Pede ciência</Badge>}
                  {d.status === 'arquivada' && <Badge variant="secondary">Arquivada</Badge>}
                </div>
                <p className="text-[12px] text-muted-foreground mt-0.5">
                  Versão {d.versao_atual}
                  {d.publicada_em ? ` · publicada em ${format(new Date(d.publicada_em), 'dd/MM/yyyy', { locale: ptBR })}` : ''}
                  {d.responsavel?.full_name ? ` · responsável: ${d.responsavel.full_name}` : ''}
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}

      <LeituraDaDiretriz diretriz={aberta} onClose={() => setAberta(null)} />
    </div>
  );
}
