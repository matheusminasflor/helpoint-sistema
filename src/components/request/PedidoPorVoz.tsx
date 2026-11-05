import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Mic, Square, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useIALigada } from '@/hooks/useAssistantName';
import { useDitado } from '@/hooks/useDitado';
import { useTenantPath } from '@/hooks/useTenantPath';
import { pedeCompra, pedeProjeto, pedeRotina, rotaDeExportacao } from '@/lib/comando-de-voz';
import { invokeEdge } from '@/lib/edge-function';
import { MODULO_DO_SETOR, type SetorDoPedido } from '@/lib/sugerir-setor';
import { toast } from 'sonner';

const SETOR_DO_MODULO = Object.fromEntries(Object.entries(MODULO_DO_SETOR).map(([s, m]) => [m, s])) as Record<string, SetorDoPedido>;

export interface ChamadoOrganizado { setor: SetorDoPedido; categoriaId?: string; titulo: string; texto: string }

interface Resposta { tipo: 'chamado' | 'compra'; modulo: string | null; categoria_id: string | null; titulo: string; descricao: string; error?: string; message?: string }

/**
 * O áudio do "Novo" (proposta aprovada em 2026-11-04): a fala vira texto no aparelho, sem IA. Exportar relatório também
 * não usa IA. Só "Organizar com IA" gasta, e o resultado apenas preenche o formulário: quem envia é a pessoa.
 */
export function PedidoPorVoz({ onOrganizado, compacto = false }: { onOrganizado: (c: ChamadoOrganizado) => void; compacto?: boolean }) {
  const navigate = useNavigate();
  const tenantPath = useTenantPath();
  const iaLigada = useIALigada();
  const [texto, setTexto] = useState('');
  const [organizando, setOrganizando] = useState(false);
  const juntar = useCallback((trecho: string) => setTexto((t) => (t ? `${t} ${trecho}` : trecho)), []);
  const { ouvindo, provisorio, semResposta, iniciar, parar } = useDitado(juntar);

  const rotina = pedeRotina(texto);
  const projeto = !rotina && pedeProjeto(texto);
  const compra = !rotina && !projeto && pedeCompra(texto);
  const exportacao = rotaDeExportacao(texto);

  const organizar = async () => {
    parar();
    setOrganizando(true);
    try {
      const r = await invokeEdge<Resposta>('ai-organizar', { texto });
      if (r.error) throw new Error(r.message || 'Não foi possível organizar.');
      if (projeto) { navigate(tenantPath('/projetos/novo'), { state: { nome: r.titulo, objetivo: r.descricao } }); return; }
      if (r.tipo === 'compra') { navigate(tenantPath('/solicitacoes?novo=compra')); return; }
      const setor = r.modulo ? SETOR_DO_MODULO[r.modulo] : undefined;
      if (!setor) { toast.info('Escolha o setor abaixo. O texto segue com você.'); return; }
      onOrganizado({ setor, categoriaId: r.categoria_id ?? undefined, titulo: r.titulo, texto: r.descricao });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível organizar. Preencha o formulário normalmente.');
    } finally {
      setOrganizando(false);
    }
  };

  return (
    <section className="rounded-xl border border-border bg-card p-4 space-y-3" aria-label="Pedir por voz">
      <div className="flex items-center gap-3">
        <Button type="button" size="lg" variant={ouvindo ? 'destructive' : 'default'} onClick={ouvindo ? parar : iniciar}
          className="h-12 gap-2" aria-pressed={ouvindo}>
          {ouvindo ? <Square className="h-4 w-4" aria-hidden="true" /> : <Mic className="h-5 w-5" aria-hidden="true" />}
          {ouvindo ? 'Parar' : 'Falar'}
        </Button>
        <p className="text-[13px] text-muted-foreground">
          {ouvindo ? 'Ouvindo…' : 'Fale o que precisa, como num áudio: chamado, rotina, projeto ou relatório.'}
        </p>
      </div>
      {semResposta && (
        <p className="text-[13px] text-aviso font-medium">Este aparelho não transcreveu. Toque no campo abaixo e use o microfone do teclado.</p>
      )}
      {(!compacto || ouvindo || texto) && (
        <Textarea aria-label="O que foi falado" rows={3} value={ouvindo && provisorio ? `${texto} ${provisorio}`.trim() : texto}
          readOnly={ouvindo} onChange={(e) => setTexto(e.target.value)} placeholder="O que você falar aparece aqui. Pode corrigir antes de continuar." />
      )}
      {rotina ? (
        <Button type="button" disabled={ouvindo} onClick={() => navigate(tenantPath('/rotinas'), { state: { fala: texto } })}>Continuar para a rotina</Button>
      ) : compra ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[13px] font-medium text-aviso flex-1 min-w-[12rem]">Compra precisa da proposta e dos dados do pedido. Faça pela tela de solicitação.</p>
          <Button type="button" onClick={() => navigate(tenantPath('/solicitacoes?novo=compra'))}>Abrir solicitação de compra</Button>
        </div>
      ) : exportacao ? (
        <Button type="button" onClick={() => navigate(tenantPath(exportacao))}>Exportar relatório</Button>
      ) : texto.trim().length >= 5 && iaLigada && (
        <Button type="button" onClick={organizar} disabled={organizando || ouvindo} className="gap-2">
          {organizando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Wand2 className="h-4 w-4" aria-hidden="true" />}
          {projeto ? 'Montar projeto com IA' : 'Organizar com IA'}
        </Button>
      )}
    </section>
  );
}
