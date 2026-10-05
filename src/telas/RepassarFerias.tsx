// "Repassar demandas" — a pessoa fica fora 2+ dias (férias, abono, banco de horas, atestado) e quem
// tem a caixinha do setor escolhe quem assume (decisões do dono, 2026-10-03; 20261128010000). Um
// substituto para tudo, ajustável item a item:
//   * chamados abertos com a pessoa trocam de atendente na hora;
//   * categorias em que ela é responsável ganham um substituto só durante as férias — no dia
//     seguinte ao fim, a categoria volta sozinha para ela.
// Quem abre e o que vale, o banco decide (`ferias_demandas`, `ferias_repassar`).
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { Plane } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { mensagemDeErro, unwrap } from '@/lib/supabase-result';
import { rotuloDoSetor } from '@/lib/setores';
import { concessaoDoModulo, type MembroDoSetor } from '@/hooks/useMembrosDoSetor';
import { toast } from 'sonner';

interface Item { id: string; modulo: string }
interface Chamado extends Item { numero: number | null; titulo: string }
interface Categoria extends Item { nome: string; substituto: string | null }
interface Demandas {
  pessoa: { id: string; nome: string };
  inicio: string;
  fim: string;
  /** "férias", "abono", "banco de horas" ou "atestado" (20261128010000). */
  tipo: string;
  chamados: Chamado[];
  categorias: Categoria[];
}

/** "Fica como está" no chamado e "ninguém" na categoria. */
const NINGUEM = '__ninguem__';

export default function RepassarFerias() {
  const { id = '' } = useParams();
  const { tenantId } = useAuth();
  const qc = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['ferias-demandas', tenantId, id],
    enabled: !!id,
    retry: false,
    // A função devolve jsonb: o formato é o de `Demandas`, montado em `ferias_demandas` (20261127020000).
    queryFn: async () => unwrap(await supabase.rpc('ferias_demandas', { p_vacation: id! })) as unknown as Demandas,
  });

  // Quem pode assumir: quem tem o acesso ao setor de cada item (o banco confere de novo).
  const setores = useMemo(
    () => [...new Set([...(data?.chamados ?? []), ...(data?.categorias ?? [])].map(i => concessaoDoModulo(i.modulo)))],
    [data],
  );
  const membrosPorSetor = useQueries({
    queries: setores.map(setor => ({
      queryKey: ['membros-do-setor', tenantId, setor],
      queryFn: async (): Promise<MembroDoSetor[]> =>
        unwrap(await supabase.rpc('membros_do_setor', { p_setor: setor })) ?? [],
    })),
  });
  const candidatos = (modulo: string): MembroDoSetor[] => {
    const i = setores.indexOf(concessaoDoModulo(modulo));
    return (membrosPorSetor[i]?.data ?? []).filter(m => m.id !== data?.pessoa.id);
  };
  const todos = useMemo(() => {
    const mapa = new Map<string, MembroDoSetor>();
    membrosPorSetor.forEach(q => (q.data ?? []).forEach(m => { if (m.id !== data?.pessoa.id) mapa.set(m.id, m); }));
    return [...mapa.values()];
  }, [membrosPorSetor, data]);

  const [paraChamado, setParaChamado] = useState<Record<string, string>>({});
  const [paraCategoria, setParaCategoria] = useState<Record<string, string>>({});
  useEffect(() => {
    setParaCategoria(Object.fromEntries((data?.categorias ?? []).map(c => [c.id, c.substituto ?? NINGUEM])));
    setParaChamado({});
  }, [data]);

  const paraTudo = (pessoa: string) => {
    const serve = (modulo: string) => candidatos(modulo).some(m => m.id === pessoa);
    setParaChamado(Object.fromEntries((data?.chamados ?? []).filter(c => serve(c.modulo)).map(c => [c.id, pessoa])));
    setParaCategoria(prev => ({
      ...prev,
      ...Object.fromEntries((data?.categorias ?? []).filter(c => serve(c.modulo)).map(c => [c.id, pessoa])),
    }));
  };

  const repassar = useMutation({
    mutationFn: async () => {
      const chamados = Object.entries(paraChamado)
        .filter(([, para]) => para && para !== NINGUEM)
        .map(([idChamado, para]) => ({ id: idChamado, para }));
      const categorias = (data?.categorias ?? []).map(c => ({
        id: c.id, para: paraCategoria[c.id] && paraCategoria[c.id] !== NINGUEM ? paraCategoria[c.id] : '',
      }));
      return unwrap(await supabase.rpc('ferias_repassar',
        { p_vacation: id!, p_chamados: chamados, p_categorias: categorias })) as unknown as { chamados: number; categorias: number };
    },
    onSuccess: (r) => {
      toast.success(`${r.chamados} chamado(s) repassado(s); ${r.categorias} categoria(s) com substituto na ausência.`);
      qc.invalidateQueries({ queryKey: ['ferias-demandas'] });
      qc.invalidateQueries({ queryKey: ['responsaveis-da-categoria'] });
    },
    onError: (e) => toast.error(`Não foi possível repassar: ${mensagemDeErro(e)}`),
  });

  if (isLoading) return <div className="p-6 max-w-4xl mx-auto"><Skeleton className="h-64 w-full" /></div>;
  if (error || !data) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <Card><CardContent className="p-6 text-sm text-muted-foreground">
          {error ? mensagemDeErro(error) : 'Ausência não encontrada.'}
        </CardContent></Card>
      </div>
    );
  }

  const periodo = `${format(parseISO(data.inicio), 'dd/MM')} a ${format(parseISO(data.fim), 'dd/MM/yyyy')}`;
  const nadaARepassar = data.chamados.length === 0 && data.categorias.length === 0;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <PageHeader
        className="bg-transparent border-0 px-0 py-0"
        icon={Plane}
        title={`Repassar demandas — ${data.pessoa.nome}`}
        description={`Fora de ${periodo} (${data.tipo}). Escolha quem assume os chamados abertos e, durante a ausência, as categorias dela. Na volta, as categorias retornam sozinhas.`}
      />

      {nadaARepassar ? (
        <Card><CardContent className="p-6 text-sm text-muted-foreground">
          Nada para repassar: {data.pessoa.nome} não tem chamado aberto nem é responsável por categoria.
        </CardContent></Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Uma pessoa para tudo</CardTitle>
              <CardDescription>Preenche todos os itens abaixo de uma vez. Depois dá para trocar item a item.</CardDescription>
            </CardHeader>
            <CardContent>
              <Select onValueChange={paraTudo}>
                <SelectTrigger className="max-w-sm"><SelectValue placeholder="Escolha o substituto" /></SelectTrigger>
                <SelectContent>
                  {todos.map(m => <SelectItem key={m.id} value={m.id}>{m.full_name || m.email}</SelectItem>)}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {data.chamados.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Chamados abertos ({data.chamados.length})</CardTitle>
                <CardDescription>Trocam de atendente agora, e quem recebe é avisado.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {data.chamados.map(c => (
                  <div key={c.id} className="flex flex-wrap items-center gap-3 border-b border-border pb-2 last:border-0">
                    <span className="flex-1 min-w-[200px] text-sm">
                      {c.numero ? `#${c.numero} ` : ''}{c.titulo}
                      <span className="text-xs text-muted-foreground"> · {rotuloDoSetor(concessaoDoModulo(c.modulo))}</span>
                    </span>
                    <Select value={paraChamado[c.id] ?? NINGUEM} onValueChange={(v) => setParaChamado(p => ({ ...p, [c.id]: v }))}>
                      <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NINGUEM}>Fica com {data.pessoa.nome}</SelectItem>
                        {candidatos(c.modulo).map(m => <SelectItem key={m.id} value={m.id}>{m.full_name || m.email}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {data.categorias.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Categorias de que é responsável ({data.categorias.length})</CardTitle>
                <CardDescription>Durante a ausência, chamado novo destas categorias vai para o substituto. Sem substituto, cai na fila do setor.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {data.categorias.map(c => (
                  <div key={c.id} className="flex flex-wrap items-center gap-3 border-b border-border pb-2 last:border-0">
                    <span className="flex-1 min-w-[200px] text-sm">
                      {c.nome}
                      <span className="text-xs text-muted-foreground"> · {rotuloDoSetor(concessaoDoModulo(c.modulo))}</span>
                    </span>
                    <Select value={paraCategoria[c.id] ?? NINGUEM} onValueChange={(v) => setParaCategoria(p => ({ ...p, [c.id]: v }))}>
                      <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NINGUEM}>Ninguém (fila do setor)</SelectItem>
                        {candidatos(c.modulo).map(m => <SelectItem key={m.id} value={m.id}>{m.full_name || m.email}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <div className="flex justify-end">
            <Button onClick={() => repassar.mutate()} disabled={repassar.isPending}>Repassar</Button>
          </div>
        </>
      )}
    </div>
  );
}
