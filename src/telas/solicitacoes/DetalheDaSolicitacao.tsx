// Uma solicitação (etapa 4b): as etapas com a de agora marcada, de quem é a vez, os dados, os anexos, a linha do tempo
// e só os botões de quem tem a vez. O banco confere cada ação (`solicitacao_agir`); a tela só não oferece o que ele
// recusaria. Rodada 2: a compra é um pedido — no lugar dos dados e dos botões vai o painel da compra (as ações dela são
// as do quadro de Compras) — e todo pedido tem conversa ("Escrever", `pedido_escrever`).
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ClipboardList, Paperclip } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useConfiguracaoDosSetores } from '@/hooks/useAccessProfiles';
import { useTenantPath } from '@/hooks/useTenantPath';
import {
  abrirAnexoDaSolicitacao, useAgirNaSolicitacao, useAnexarNaSolicitacao, useEscreverNoPedido, useSolicitacao,
  type AnexoDaSolicitacao,
} from '@/hooks/useSolicitacoes';
import { PurchasePanel } from '@/components/compras/PurchasePanel';
import { ContasLigadas } from '@/components/financeiro/ContasLigadas';
import { ROTULO_DA_ETAPA, TIPOS, deQuemEAVez, terminou } from '@/config/solicitacoes';
import { unwrap } from '@/lib/supabase-result';
import { dataHora, todayISO } from '@/lib/dates';
import { formatBRL } from '@/types/financeiro';
import { cn } from '@/lib/utils';
import { EtapasParaQuemPediu } from '@/components/request/EtapasParaQuemPediu';
import { estadoDoPedidoParaQuemPediu } from '@/lib/estado-para-quem-pediu';

const ROTULO_DA_ACAO: Record<string, string> = {
  pedir: 'pediu', aprovar: 'aprovou', recusar: 'recusou', aceitar: 'aceitou', entregar: 'entregou', liberar: 'liberou',
  andamento: 'pôs em andamento', concluir: 'concluiu', prestar_contas: 'prestou contas', cancelar: 'cancelou', pagar: 'pagou',
  // A compra (rodada 2): o que o banco escreve quando ela anda, e o registro que era nota interna do chamado.
  ajustar: 'pediu ajuste', reenviar: 'reenviou', comprar: 'registrou a compra', trocar_forma: 'trocou a forma de pagamento',
  aguardar_fornecedor: 'marcou aguardando o fornecedor',
  registro: 'registrou', escrever: 'escreveu',
};
const ROTULO_DO_MOMENTO: Record<AnexoDaSolicitacao['momento'], string> = { pedido: 'do pedido', entrega: 'da entrega', prestacao: 'da prestação de contas' };

export default function DetalheDaSolicitacao() {
  const { id = '' } = useParams();
  const { user, role } = useAuth();
  const tenantPath = useTenantPath();
  const { data, isLoading } = useSolicitacao(id);
  const perfil = useConfiguracaoDosSetores();
  const agir = useAgirNaSolicitacao();
  const anexar = useAnexarNaSolicitacao();
  const escrever = useEscreverNoPedido();
  const [mensagem, setMensagem] = useState('');
  const [motivo, setMotivo] = useState('');
  const [recusando, setRecusando] = useState(false);
  const [novaData, setNovaData] = useState('');
  const [gasto, setGasto] = useState('');
  const s = data?.solicitacao ?? null;
  const { data: souGestor = false } = useQuery({
    queryKey: ['solicitacoes', 'sou-gestor', s?.para_id, user?.id],
    enabled: !!s && s.para_id !== user?.id,
    queryFn: async () => !!unwrap(await supabase.rpc('sou_gestor_de' as never, { p_user: s!.para_id } as never)),
  });

  if (isLoading) return <div className="p-6"><Skeleton className="h-64 w-full" /></div>;
  if (!s) return <div className="p-6"><EmptyState icon={ClipboardList} title="Pedido não encontrado" description="Ele não existe ou não é para você ver." /></div>;

  const cfg = TIPOS[s.tipo];
  const compra = s.tipo === 'compra';
  const admin = role === 'owner' || role === 'admin';
  const gestor = admin || souGestor;
  const setorDecide = !perfil.isLoading && !perfil.isError && perfil.pode(s.setor, 'solicitacoes', 'decidir');
  const souEu = s.solicitante_id === user?.id;
  // Na compra, "Somente leitura" de Compras vê e não escreve (o banco recusa, `pedido_escrever`).
  // ponytail: o responsável da Caixinha sem perfil de Compras não vê a caixa aqui, embora o banco o deixe escrever;
  // se pedirem, perguntar `pode_decidir_compra` como o painel da compra.
  const podeEscrever = !compra || souEu || admin
    || perfil.pode('compras', 'solicitacoes', 'execute') || perfil.pode('compras', 'solicitacoes', 'approve');
  const pedeGestor = s.tipo === 'acesso' || s.tipo === 'reembolso' || s.tipo === 'adiantamento';
  const vez = terminou(s.tipo, s.etapa) ? null : deQuemEAVez(s.tipo, s.etapa);
  const anexos = data?.anexos ?? [];
  const caminho = cfg.etapas.map(([e]) => e);
  const atual = s.etapa === 'recusada' || s.etapa === 'cancelada' ? -1 : caminho.indexOf(s.etapa);
  const fazer = (acao: string, texto?: string, dados?: Record<string, unknown>) =>
    agir.mutate({ id: s.id, acao, texto, dados }, {
      onSuccess: (etapa) => { toast.success(`Feito: ${ROTULO_DA_ETAPA[etapa].toLowerCase()}.`); setRecusando(false); setMotivo(''); },
    });

  // Rodada 3, decisão 4: quem só PEDIU (não decide, não aprova) vê as três etapas traduzidas, sem o gestor no meio.
  const soPediu = souEu && !setorDecide && !gestor && !admin;
  const podeRecusar = !terminou(s.tipo, s.etapa) && (
    (s.etapa === 'pedido' && pedeGestor && gestor)
    || (setorDecide && ((s.etapa === 'pedido' && !pedeGestor) || ['aceita', 'aprovada', 'em_andamento'].includes(s.etapa))));

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader title={s.titulo} icon={ClipboardList} identifier={`#${s.numero}`}
        description={`${cfg.rotulo} · ${s.para?.full_name ?? '—'}${s.solicitante_id !== s.para_id ? ` (pedido por ${s.solicitante?.full_name ?? '—'})` : ''}`}
        actions={<Button asChild variant="outline" size="sm"><Link to={tenantPath(soPediu ? '/meus' : '/solicitacoes')}>{soPediu ? 'Minhas solicitações' : 'Voltar aos pedidos'}</Link></Button>} />
      <div className="p-4 lg:p-6 grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          {soPediu && (
            <section className="rounded-lg border border-border bg-card p-4 space-y-2">
              <EtapasParaQuemPediu estado={estadoDoPedidoParaQuemPediu(s.tipo, s.etapa, s.setor)} />
              {s.etapa === 'recusada' && <p className="text-[14px] text-status-danger">Recusado: {s.motivo_recusa}</p>}
              <p className="text-[13px] text-muted-foreground">Você recebe um aviso a cada mudança.</p>
            </section>
          )}
          {/* A compra mostra as etapas e a recusa no painel dela, com as datas; aqui fica só de quem é a vez. */}
          {!soPediu && (!compra || vez) && <section className="rounded-lg border border-border bg-card p-4 space-y-3">
            {!compra && <ol className="grid gap-1" style={{ gridTemplateColumns: `repeat(${caminho.length}, minmax(0, 1fr))` }} aria-label="Etapas">
              {cfg.etapas.map(([e, rotulo], i) => (
                <li key={e} className="min-w-0">
                  <span className={cn('block h-1 rounded-full', atual >= i ? 'bg-foreground' : i === atual + 1 && atual >= 0 ? 'bg-status-info' : 'bg-secondary')} />
                  <span className={cn('block text-[12px] mt-1 truncate', atual >= i ? 'text-foreground' : 'text-muted-foreground')}>{rotulo}</span>
                </li>
              ))}
            </ol>}
            {s.etapa === 'recusada' && <p className="text-[14px] text-status-danger">Recusado: {s.motivo_recusa}</p>}
            {s.etapa === 'cancelada' && <p className="text-[14px] text-muted-foreground">Cancelado por quem pediu.</p>}
            {vez && <p className="text-[14px]"><span className="text-muted-foreground">Agora:</span> {vez}.</p>}
          </section>}

          {compra ? (
            <section className="rounded-lg border border-border bg-card p-4 space-y-3">
              {s.detalhes && <p className="text-[14px] whitespace-pre-wrap"><span className="text-muted-foreground">Para quê:</span> {s.detalhes}</p>}
              <PurchasePanel pedidoId={s.id} />
            </section>
          ) : (<>
          <section className="rounded-lg border border-border bg-card p-4 space-y-2 text-[14px]">
            {s.valor != null && <p><span className="text-muted-foreground">Valor:</span> <b className="tabular-nums">{formatBRL(Number(s.valor))}</b></p>}
            {s.preciso_ate && <p><span className="text-muted-foreground">Preciso até:</span> {s.preciso_ate.slice(8, 10)}/{s.preciso_ate.slice(5, 7)}/{s.preciso_ate.slice(0, 4)}</p>}
            {typeof s.dados.tipo_acesso === 'string' && <p><span className="text-muted-foreground">Tipo de acesso:</span> {s.dados.tipo_acesso}</p>}
            {typeof s.dados.gasto === 'number' && (
              <p><span className="text-muted-foreground">Gasto:</span> {formatBRL(s.dados.gasto)} · <span className="text-muted-foreground">sobra a devolver:</span> {formatBRL(Number(s.dados.sobra ?? 0))}</p>
            )}
            {s.detalhes ? <p className="whitespace-pre-wrap">{s.detalhes}</p> : <p className="text-muted-foreground">Sem detalhes.</p>}
          </section>

          <section className="rounded-lg border border-border bg-card p-4 space-y-2">
            <h2 className="text-[14px] font-semibold">Anexos</h2>
            {anexos.length === 0 ? <p className="text-[13px] text-muted-foreground">Nenhum.</p> : anexos.map((a) => (
              <button key={a.id} type="button" onClick={() => abrirAnexoDaSolicitacao(a.caminho)}
                className="flex items-center gap-2 text-[14px] text-primary underline min-h-9">
                <Paperclip className="w-4 h-4" aria-hidden="true" />{a.nome}
                <span className="text-muted-foreground no-underline">· {ROTULO_DO_MOMENTO[a.momento]}</span>
              </button>
            ))}
            {souEu && s.etapa === 'pedido' && (
              <Input type="file" multiple aria-label="Anexar ao pedido"
                onChange={(e) => e.target.files?.length && anexar.mutate({ id: s.id, arquivos: Array.from(e.target.files), momento: 'pedido' })} />
            )}
          </section>
          </>)}
        </div>

        <aside className="space-y-4">
          {/* As ações de quem tem a vez (a compra tem as dela no painel). */}
          {!compra && <section className="rounded-lg border border-border bg-card p-4 space-y-3">
            <h2 className="text-[14px] font-semibold">O que fazer</h2>
            {s.etapa === 'pedido' && pedeGestor && gestor && !recusando && (
              <Button className="w-full" disabled={agir.isPending} onClick={() => fazer('aprovar')}>Aprovar</Button>
            )}
            {s.tipo === 'arte' && s.etapa === 'pedido' && setorDecide && !recusando && (
              <div className="space-y-2">
                <Label htmlFor="sol-nova-data">Outra data (opcional)</Label>
                <Input id="sol-nova-data" type="date" min={todayISO()} value={novaData} onChange={(e) => setNovaData(e.target.value)} />
                <Button className="w-full" disabled={agir.isPending}
                  onClick={() => fazer('aceitar', undefined, novaData ? { preciso_ate: novaData } : undefined)}>Aceitar</Button>
              </div>
            )}
            {s.tipo === 'arte' && s.etapa === 'aceita' && setorDecide && !recusando && (
              <div className="space-y-2">
                <Label htmlFor="sol-entrega">Arquivo da arte</Label>
                <Input id="sol-entrega" type="file" multiple
                  onChange={(e) => e.target.files?.length && anexar.mutate({ id: s.id, arquivos: Array.from(e.target.files), momento: 'entrega' })} />
                <Button className="w-full" disabled={agir.isPending || !anexos.some((a) => a.momento === 'entrega')} onClick={() => fazer('entregar')}>
                  Entregar
                </Button>
              </div>
            )}
            {s.tipo === 'acesso' && s.etapa === 'aprovada' && setorDecide && !recusando && (
              <Button className="w-full" disabled={agir.isPending} onClick={() => fazer('liberar')}>Marcar como liberado</Button>
            )}
            {(s.tipo === 'reembolso' || s.tipo === 'adiantamento') && s.etapa === 'aprovada' && (
              <p className="text-[13px] text-muted-foreground">
                A conta a pagar já está no Financeiro. Ao ser paga lá, este pedido passa para "Pago".
              </p>
            )}
            {(s.tipo === 'reembolso' || s.tipo === 'adiantamento') && <ContasLigadas contaId={s.fin_entry_id} />}
            {s.tipo === 'adiantamento' && s.etapa === 'paga' && souEu && (
              <div className="space-y-2">
                <Label htmlFor="sol-gasto">Quanto foi gasto (R$)</Label>
                <Input id="sol-gasto" inputMode="decimal" className="tabular-nums" value={gasto} onChange={(e) => setGasto(e.target.value)} />
                <Label htmlFor="sol-comprovantes">Comprovantes</Label>
                <Input id="sol-comprovantes" type="file" multiple
                  onChange={(e) => e.target.files?.length && anexar.mutate({ id: s.id, arquivos: Array.from(e.target.files), momento: 'prestacao' })} />
                <Button className="w-full" disabled={agir.isPending || !gasto || !anexos.some((a) => a.momento === 'prestacao')}
                  onClick={() => fazer('prestar_contas', undefined, { gasto: Number(gasto.replace(/\./g, '').replace(',', '.')) })}>
                  Enviar a prestação de contas
                </Button>
              </div>
            )}
            {s.tipo === 'adiantamento' && s.etapa === 'prestando_contas' && setorDecide && (
              <Button className="w-full" disabled={agir.isPending} onClick={() => fazer('concluir')}>Conferido</Button>
            )}
            {s.setor === 'rh' && setorDecide && !recusando && (s.etapa === 'pedido' || s.etapa === 'em_andamento') && (
              <div className="flex flex-col gap-2">
                {s.etapa === 'pedido' && <Button variant="outline" disabled={agir.isPending} onClick={() => fazer('andamento')}>Pôr em andamento</Button>}
                <Button disabled={agir.isPending} onClick={() => fazer('concluir', motivo || undefined)}>Concluir</Button>
              </div>
            )}
            {podeRecusar && (recusando ? (
              <div className="space-y-2">
                <Label htmlFor="sol-motivo">Motivo da recusa *</Label>
                <Textarea id="sol-motivo" rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus />
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setRecusando(false)}>Voltar</Button>
                  <Button variant="destructive" disabled={!motivo.trim() || agir.isPending} onClick={() => fazer('recusar', motivo)}>Recusar</Button>
                </div>
              </div>
            ) : (
              // Recusar fica longe do sim e pede o motivo (lei de Fitts, a mesma do benefício de sexta).
              <button type="button" className="block text-[13px] text-muted-foreground underline mt-4" onClick={() => setRecusando(true)}>Recusar com motivo</button>
            ))}
            {souEu && s.etapa === 'pedido' && !recusando && (
              <button type="button" className="block text-[13px] text-muted-foreground underline" disabled={agir.isPending}
                onClick={() => fazer('cancelar')}>Cancelar o pedido</button>
            )}
            {terminou(s.tipo, s.etapa) && <p className="text-[13px] text-muted-foreground">Encerrado: nada a fazer.</p>}
          </section>}

          <section className="rounded-lg border border-border bg-card p-4 space-y-3">
            <h2 className="text-[14px] font-semibold">Conversa e histórico</h2>
            <ol className="space-y-2 text-[13px]">
              {(data?.eventos ?? []).map((e) => e.acao === 'escrever' ? (
                // A mensagem é de gente: aparece inteira, como texto, e não como nota do histórico.
                <li key={e.id} className="rounded-md bg-muted/50 px-3 py-2">
                  <span className="block text-muted-foreground tabular-nums">
                    <b className="font-medium text-foreground">{e.pessoa?.full_name ?? '—'}</b> · {dataHora(e.created_at)}
                  </span>
                  <span className="block text-[14px] text-foreground whitespace-pre-wrap">{e.texto}</span>
                </li>
              ) : (
                <li key={e.id}>
                  <span className="text-muted-foreground tabular-nums">{dataHora(e.created_at)}</span>{' · '}
                  <b className="font-medium">{e.pessoa?.full_name ?? 'Sistema'}</b> {ROTULO_DA_ACAO[e.acao] ?? e.acao}
                  {e.texto && <span className="text-muted-foreground whitespace-pre-wrap"> — {e.texto}</span>}
                </li>
              ))}
            </ol>
            {podeEscrever && <form className="space-y-2" onSubmit={(ev) => {
              ev.preventDefault();
              if (!mensagem.trim()) return;
              escrever.mutate({ id: s.id, texto: mensagem }, { onSuccess: () => setMensagem('') });
            }}>
              <Label htmlFor="pedido-mensagem" className="sr-only">Escrever no pedido</Label>
              <Textarea id="pedido-mensagem" rows={2} value={mensagem} onChange={(e) => setMensagem(e.target.value)}
                placeholder="Escreva para quem está neste pedido…" />
              <Button type="submit" variant="outline" className="w-full" disabled={!mensagem.trim() || escrever.isPending}>
                {escrever.isPending ? 'Enviando…' : 'Enviar mensagem'}
              </Button>
            </form>}
          </section>
        </aside>
      </div>
    </div>
  );
}
