import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { MarkdownRenderer } from '@/components/ui/markdown-renderer';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useCreatePOP } from '@/hooks/usePOPs';
import { useDecidirSugestao, useGerarSugestoes, useSugestoesDaIA, type SugestaoDaIA } from '@/hooks/useSugestoesDaIA';
import { useTICategories } from '@/hooks/useTICategories';
import { useTenantPath } from '@/hooks/useTenantPath';
import { mensagemDeErro } from '@/lib/supabase-result';

const SELO: Record<SugestaoDaIA['tipo'], string> = {
  categoria_nova: 'Categoria nova', categoria_errada: 'Categoria usada errado', tutorial: 'Tutorial',
};

function Sugestao({ s }: { s: SugestaoDaIA }) {
  const navigate = useNavigate();
  const tenantPath = useTenantPath();
  const decidir = useDecidirSugestao();
  const criarTutorial = useCreatePOP();
  const { createCategory } = useTICategories('tickets');
  const [ocupado, setOcupado] = useState(false);

  const fazer = async (acao: () => Promise<unknown>, status: 'aprovada' | 'recusada', aviso: string) => {
    setOcupado(true);
    try {
      await acao();
      await decidir.mutateAsync({ id: s.id, status });
      toast.success(aviso);
    } catch (e) {
      toast.error(mensagemDeErro(e));
    } finally {
      setOcupado(false);
    }
  };
  const tutorial = s.dados.tutorial;

  return (
    <article className="rounded-xl border border-border p-4 space-y-3">
      <div className="space-y-1">
        <span className="rounded-full px-2 py-0.5 text-[12px] font-semibold badge-warning">{SELO[s.tipo]}</span>
        <h4 className="text-[15px] font-semibold text-foreground">{s.titulo}</h4>
        <p className="text-[14px] text-foreground">{s.motivo}</p>
      </div>
      {tutorial && (
        <div className="rounded-lg bg-muted/40 border border-border/60 p-3 max-h-72 overflow-y-auto">
          <MarkdownRenderer content={tutorial.content} />
        </div>
      )}
      <p className="text-[13px] text-muted-foreground">
        Baseado em{' '}
        {s.chamados.map((c, i) => (
          <span key={c.id}>{i > 0 && ', '}<Link to={tenantPath(`/ti/chamados/${c.id}`)} title={c.titulo} className="underline">#{c.numero}</Link></span>
        ))}
      </p>
      <div className="flex flex-wrap gap-2">
        {s.tipo === 'tutorial' && tutorial && (
          <>
            <Button size="sm" disabled={ocupado} onClick={() => fazer(() => criarTutorial.mutateAsync({ ...tutorial, audience: 'staff' }), 'aprovada', 'Tutorial publicado.')}>
              Aprovar e publicar
            </Button>
            {/* A sugestão fica pendente até publicar pelo editor ou recusar. */}
            <Button size="sm" variant="outline" disabled={ocupado} onClick={() => navigate(tenantPath('/ti/pops/novo'), { state: tutorial })}>Ajustar antes</Button>
          </>
        )}
        {s.tipo === 'categoria_nova' && s.dados.nome && (
          <Button size="sm" disabled={ocupado} onClick={() => fazer(
            () => createCategory.mutateAsync({ module: 'tickets', name: s.dados.nome!, parent_id: s.dados.parent_id ?? null }),
            'aprovada', 'Categoria criada.')}>
            Criar categoria
          </Button>
        )}
        {s.tipo === 'categoria_errada' && (
          <Button size="sm" disabled={ocupado} onClick={() => fazer(async () => undefined, 'aprovada', 'Sugestão marcada como vista.')}>Entendi</Button>
        )}
        <Button size="sm" variant="outline" className="text-destructive" disabled={ocupado}
          onClick={() => fazer(async () => undefined, 'recusada', 'Sugestão recusada. A próxima análise não repete.')}>
          Recusar
        </Button>
      </div>
    </article>
  );
}

/** As sugestões guardadas abrem sem custo; só "Gerar sugestões" usa IA. */
export function SugestoesDaIA({ aberto, onFechar, de, ate, periodo }: {
  aberto: boolean; onFechar: () => void; de: string; ate: string; periodo: string;
}) {
  const { data: sugestoes = [], isLoading } = useSugestoesDaIA(aberto);
  const gerar = useGerarSugestoes();
  const pedir = () => gerar.mutate({ de, ate }, {
    onSuccess: ({ total }) => (total ? toast.success('Sugestões prontas. Confira uma a uma.') : toast.info('A IA não encontrou sugestões neste período.')),
    onError: (e) => toast.error(mensagemDeErro(e)),
  });

  return (
    <Sheet open={aberto} onOpenChange={(v) => { if (!v) onFechar(); }}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2"><Wand2 className="h-5 w-5 text-primary" aria-hidden="true" />Sugestões da IA</SheetTitle>
          <SheetDescription>A IA lê os chamados de {periodo}. Nada muda sem o seu clique.</SheetDescription>
        </SheetHeader>
        <div className="mt-5 space-y-4">
          <Button className="w-full gap-2" onClick={pedir} disabled={gerar.isPending}>
            {gerar.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Wand2 className="h-4 w-4" aria-hidden="true" />}
            {gerar.isPending ? 'Analisando os chamados…' : sugestoes.length ? 'Gerar novas sugestões' : 'Gerar sugestões'}
          </Button>
          {sugestoes.length > 0 && <p className="text-[13px] text-muted-foreground">Gerar de novo troca as sugestões pendentes abaixo.</p>}
          {!isLoading && !sugestoes.length && !gerar.isPending && (
            <p className="text-[14px] text-muted-foreground text-center py-8">Nenhuma sugestão pendente.</p>
          )}
          {sugestoes.map((s) => <Sugestao key={s.id} s={s} />)}
        </div>
      </SheetContent>
    </Sheet>
  );
}
