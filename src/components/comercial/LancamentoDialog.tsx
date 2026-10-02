// O formulário de um lançamento — uma linha da aba da vendedora na planilha (manual §3).
//
// A ORDEM DOS CAMPOS é a do manual (§3.2): cliente, data, status, indicadores, ações, valor,
// prazo, observações. E cada regra que o manual escreve em "Atenção" aparece AQUI, na hora em
// que a pessoa está errando, e não depois, no painel que não bate:
//   * indicador sem cliente — desligado, com o motivo;
//   * valor com status diferente de Concluído — avisa que não vai somar;
//   * cliente de outra carteira — o escape, dito com todas as letras.
//
// Quem garante as regras é o banco; a tela só evita que a pessoa descubra pelo erro.
//
// O CHECKLIST DE PEDIDOS (LEVA S, 2026-09-29) vem logo depois do cliente — o dono: "primeiro o
// checklist e depois os dados que medem os indicadores". Lançamento com pedido é venda fechada:
// o status fica Concluído e o valor da venda passa a ser a soma dos pedidos tipo Venda, uma
// digitação só. Salvar são duas chamadas (lançamento, depois checklist): se a segunda falhar, o
// lançamento já está gravado, a tela continua aberta nele e o próximo "Salvar" reenvia o checklist.
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowDownToLine, ClipboardCheck, Search, X } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { todayISO } from '@/lib/dates';
import {
  STATUS_INTERACAO, useAtribuirCarteiraEmLote, useBuscarClienteParaLancar, useClientesDaCarteira,
  useSalvarInteracao,
  type ClienteParaLancar, type IndicadorCatalogo, type Interacao, type StatusInteracao,
} from '@/hooks/useComercialLancamentos';
import {
  pedidoDoFormulario, useChecklistDoLancamento, useItensDoChecklist, useSalvarChecklist,
} from '@/hooks/usePedidosChecklist';
import {
  checklistVazio, dadosParaOBanco, problemasDoChecklist, valorDaVenda, type ChecklistEmEdicao,
} from '@/lib/checklist-de-pedidos';
import { ChecklistDoLancamento } from '@/components/comercial/ChecklistDoLancamento';
import { useAuth } from '@/contexts/AuthContext';
import { usePodeNoLancamento } from '@/hooks/useAccessProfiles';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** As carteiras de quem lança — uma, duas ou mais (2026-10-01). Vazia = sem carteira. */
  minhasCarteiras: string[];
  catalogo: IndicadorCatalogo[];
  /** Nulo = lançamento novo. */
  editando: Interacao | null;
}

interface Form {
  cliente: ClienteParaLancar | null;
  data: string;
  status: StatusInteracao;
  valor: string;
  prazo: string;
  observacoes: string;
  foraDaCarteira: boolean;
  marcas: Set<string>;
}

function formVazio(): Form {
  return {
    cliente: null, data: todayISO(), status: 'em_andamento', valor: '', prazo: '', observacoes: '',
    foraDaCarteira: false, marcas: new Set(),
  };
}

export function LancamentoDialog({ open, onOpenChange, minhasCarteiras, catalogo, editando }: Props) {
  const [form, setForm] = useState<Form>(formVazio);
  const [buscaFora, setBuscaFora] = useState('');
  const [procurandoFora, setProcurandoFora] = useState(false);
  const salvar = useSalvarInteracao();
  const trazer = useAtribuirCarteiraEmLote();
  const { data: daCarteira = [] } = useClientesDaCarteira(minhasCarteiras);
  const { data: achados = [] } = useBuscarClienteParaLancar(procurandoFora ? buscaFora : '');
  const [filtroCarteira, setFiltroCarteira] = useState('');

  // O checklist de pedidos. `idGravado`: o lançamento que já foi gravado nesta abertura da tela —
  // se o checklist falhar, o próximo "Salvar" atualiza o mesmo lançamento em vez de criar outro.
  const [temPedido, setTemPedido] = useState(false);
  const [checklist, setChecklist] = useState<ChecklistEmEdicao>(checklistVazio);
  const [idGravado, setIdGravado] = useState<string | null>(null);
  const [problemas, setProblemas] = useState<string[]>([]);
  const { data: itens = [] } = useItensDoChecklist();
  const { data: gravado } = useChecklistDoLancamento(open ? editando?.id ?? null : null);
  const salvarChecklist = useSalvarChecklist();
  const situacao = gravado?.resumo.situacao ?? null;

  // LANÇAMENTO SALVO NÃO MUDA (decisão do dono, 2026-10-02): "lançou, não pode editar os
  // indicadores e farol mais, precisa lançar de novo caso tenha que entrar em contato novamente".
  // Para a vendedora, depois de salvo travam indicadores, ações, cliente e data; status, valor,
  // prazo e observação só andam até Concluído. Quem tem "Corrigir lançamento" no perfil corrige. O banco
  // garante (`com_interacao_salva_nao_muda`); a tela só não oferece o que vai ser recusado.
  const { user } = useAuth();
  const podeCorrigir = usePodeNoLancamento().corrigir;
  const travadoParaMim = !podeCorrigir && (!!editando || !!idGravado);
  const concluidoTravado = travadoParaMim && editando?.status === 'concluido';
  // O checklist é de quem lançou (o banco só aceita ela ou o administrador).
  const deOutraPessoa = !!editando && editando.vendedor_id !== user?.id;
  // Enviado, o checklist fica com o Financeiro: só a recusa devolve (decisão do dono, 2026-10-02).
  const checklistTravado = (situacao !== null && situacao !== 'Recusado') || deOutraPessoa;

  useEffect(() => {
    if (!open) return;
    setIdGravado(null);
    setProblemas([]);
    if (gravado) {
      setTemPedido(true);
      setChecklist({
        contato: gravado.resumo.contato,
        rota: gravado.resumo.rota ?? '',
        observacao: gravado.resumo.observacao ?? '',
        pedidos: gravado.pedidos.map(pedidoDoFormulario),
      });
    } else {
      setTemPedido(false);
      setChecklist(checklistVazio());
    }
  }, [open, gravado]);

  useEffect(() => {
    if (!open) return;
    setBuscaFora('');
    setProcurandoFora(false);
    setFiltroCarteira('');
    if (!editando) { setForm(formVazio()); return; }
    setForm({
      cliente: editando.cliente_codigo
        ? {
            codigo: editando.cliente_codigo,
            razao_social: editando.cliente?.razao_social ?? editando.cliente_codigo,
            fantasia: null,
            cidade: editando.cliente?.cidade ?? null,
            estado: editando.cliente?.estado ?? null,
            telefone: editando.cliente?.telefone ?? null,
            carteira: editando.fora_da_carteira ? null : (minhasCarteiras[0] ?? null),
          }
        : null,
      data: editando.data,
      status: editando.status,
      valor: editando.valor_venda === null ? '' : String(editando.valor_venda),
      prazo: editando.prazo ?? '',
      observacoes: editando.observacoes ?? '',
      foraDaCarteira: editando.fora_da_carteira,
      marcas: new Set(editando.marcas),
    });
  }, [open, editando, minhasCarteiras]);

  const indicadores = useMemo(() => catalogo.filter((c) => c.tipo === 'indicador' && (c.ativo || form.marcas.has(c.id))), [catalogo, form.marcas]);
  const acoes = useMemo(() => catalogo.filter((c) => c.tipo === 'acao' && (c.ativo || form.marcas.has(c.id))), [catalogo, form.marcas]);

  const semCliente = form.cliente === null;
  // Com pedido, o valor da venda é a soma dos pedidos tipo Venda — não se digita.
  const valorNumero = temPedido
    ? valorDaVenda(checklist.pedidos)
    : form.valor.trim() === '' ? null : Number(form.valor.replace(',', '.'));
  const valorInvalido = valorNumero !== null && (!Number.isFinite(valorNumero) || valorNumero < 0);
  // §3.1: "Vendas só somam com Concluído" e valor > 0. Dizer agora, não no painel.
  const valorQueNaoSoma = valorNumero !== null && valorNumero > 0 && form.status !== 'concluido';
  const indicadorSemCliente = semCliente && indicadores.some((i) => form.marcas.has(i.id));

  const filtrados = useMemo(() => {
    const t = filtroCarteira.trim().toLowerCase();
    if (!t) return daCarteira;
    return daCarteira.filter((c) =>
      c.razao_social.toLowerCase().includes(t) || (c.fantasia ?? '').toLowerCase().includes(t) || c.codigo.includes(t));
  }, [daCarteira, filtroCarteira]);

  const escolher = (c: ClienteParaLancar) => {
    // Fora da minha carteira é TODO cliente que não está nela — o de outra carteira E o do
    // Histórico (sem carteira). Até 2026-09-29 o do Histórico ia como "da minha carteira", e o
    // banco recusava sem exceção: a policy só aceita cliente da carteira ou o escape marcado.
    const foraDaMinha = !c.carteira || !minhasCarteiras.includes(c.carteira);
    setForm((f) => ({ ...f, cliente: c, foraDaCarteira: foraDaMinha }));
    setProcurandoFora(false);
  };

  const alternarMarca = (id: string) => setForm((f) => {
    const marcas = new Set(f.marcas);
    if (marcas.has(id)) marcas.delete(id); else marcas.add(id);
    return { ...f, marcas };
  });

  const enviaChecklist = temPedido && !checklistTravado;

  const ligarPedido = (ligado: boolean) => {
    setTemPedido(ligado);
    setProblemas([]);
    // Pedido fechado é venda concluída: é o status em que o valor soma (§3.1).
    if (ligado) setForm((f) => ({ ...f, status: 'concluido' }));
  };

  const confirmar = async () => {
    if (!form.data || valorInvalido || indicadorSemCliente) return;
    if (enviaChecklist) {
      const achados = problemasDoChecklist(checklist.contato, checklist.pedidos, itens);
      setProblemas(achados);
      if (achados.length > 0) return;
    }
    // Concluído e travado, só o checklist devolvido ainda se corrige: o lançamento nem vai ao banco.
    const id = concluidoTravado && editando ? editando.id : await salvar.mutateAsync({
      id: editando?.id ?? idGravado ?? undefined,
      cliente_codigo: form.cliente?.codigo ?? null,
      data: form.data,
      status: form.status,
      valor_venda: valorNumero,
      prazo: form.prazo || null,
      observacoes: form.observacoes.trim() || null,
      fora_da_carteira: form.foraDaCarteira,
      marcas: [...form.marcas],
    });
    setIdGravado(id);
    if (enviaChecklist) {
      await salvarChecklist.mutateAsync({
        interacaoId: id,
        dados: dadosParaOBanco(checklist.contato, checklist.rota, checklist.observacao, checklist.pedidos, itens),
      });
    }
    onOpenChange(false);
  };

  // Na edição a carteira do cliente não vem junto (o lançamento só guarda se foi "fora"), então
  // a oferta de trazer do Histórico só aparece para cliente escolhido agora, pela busca.
  const noHistorico = !editando && form.cliente !== null && !form.cliente.carteira;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editando ? 'Editar lançamento' : 'Novo lançamento'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {travadoParaMim && (
            <p className="text-[12px] rounded-md badge-info px-2 py-1.5">
              {concluidoTravado
                ? <>Lançamento <strong>concluído</strong>: nada nele muda mais.</>
                : <>Lançamento salvo: <strong>indicadores, ações, cliente e data não mudam</strong>. Dá para avançar o status até Concluído, com valor, prazo e observação.</>}
              {' '}Entrou em contato de novo? Faça um <strong>lançamento novo</strong> — cada contato conta. Erro? Peça ao gestor para corrigir.
            </p>
          )}
          {/* ── Cliente ─────────────────────────────────────────────────────── */}
          <section className="space-y-2">
            <Label>Cliente</Label>
            {form.cliente ? (
              <div className="rounded-lg border border-border p-3 space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold truncate">{form.cliente.razao_social}</p>
                    {/* Cidade/UF e telefone "não se digitam" (§3.1): vêm do cadastro. */}
                    <p className="text-[12px] text-muted-foreground">
                      {[form.cliente.cidade && `${form.cliente.cidade}${form.cliente.estado ? `/${form.cliente.estado}` : ''}`, form.cliente.telefone]
                        .filter(Boolean).join(' · ') || 'Sem cidade e telefone no cadastro'}
                    </p>
                  </div>
                  {/* Lançamento com checklist não troca de cliente (o banco também recusa). */}
                  <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" aria-label="Trocar cliente" disabled={!!gravado || travadoParaMim}
                    onClick={() => setForm((f) => ({ ...f, cliente: null, foraDaCarteira: false }))}>
                    <X className="w-4 h-4" aria-hidden="true" />
                  </Button>
                </div>
                {form.foraDaCarteira && (
                  <p className="text-[12px] rounded-md badge-warning px-2 py-1">
                    {form.cliente.carteira
                      ? <>Cliente da carteira <strong>{form.cliente.carteira}</strong>.</>
                      : <>Cliente do <strong>Histórico</strong>, ainda sem carteira.</>}
                    {' '}O lançamento fica registrado como <strong>fora da minha carteira</strong> e o gestor vê.
                  </p>
                )}
                {/* O gancho: cliente no Histórico se traz para a carteira, em vez de lançar
                    "fora" para sempre. É o que faz a carteira se montar sozinha com o uso. */}
                {/* Com mais de uma carteira, ela escolhe para qual (decisão do dono, 2026-10-01):
                    um botão por carteira dela. */}
                {noHistorico && minhasCarteiras.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 rounded-md badge-info px-2 py-1.5 text-[12px]">
                    <span>Este cliente está no <strong>Histórico</strong> — ainda não é de ninguém.</span>
                    {minhasCarteiras.map((destino) => (
                      <Button key={destino} size="sm" variant="secondary" className="h-7" disabled={trazer.isPending}
                        onClick={() => trazer.mutate(
                          { codigos: [form.cliente!.codigo], carteira: destino },
                          { onSuccess: () => setForm((f) => (f.cliente ? { ...f, cliente: { ...f.cliente, carteira: destino }, foraDaCarteira: false } : f)) },
                        )}>
                        <ArrowDownToLine className="w-3.5 h-3.5 mr-1" aria-hidden="true" />
                        Trazer para a carteira {destino}
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            ) : procurandoFora ? (
              <div className="space-y-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <Input autoFocus className="pl-8" placeholder="Nome, fantasia ou código — em toda a base"
                    value={buscaFora} onChange={(e) => setBuscaFora(e.target.value)} />
                </div>
                <ul className="max-h-48 overflow-y-auto rounded-md border border-border divide-y divide-border">
                  {buscaFora.trim().length < 2 ? (
                    <li className="px-3 py-2 text-[12px] text-muted-foreground">Digite pelo menos duas letras.</li>
                  ) : achados.length === 0 ? (
                    <li className="px-3 py-2 text-[12px] text-muted-foreground">Nenhum cliente encontrado.</li>
                  ) : achados.map((c) => (
                    <li key={c.codigo}>
                      <button type="button" onClick={() => escolher(c)}
                        className="w-full text-left px-3 py-2 hover:bg-muted/60 text-[12px]">
                        <span className="font-medium">{c.razao_social}</span>
                        <span className="text-muted-foreground"> · {c.carteira ?? 'Histórico'}</span>
                      </button>
                    </li>
                  ))}
                </ul>
                <Button variant="ghost" size="sm" onClick={() => setProcurandoFora(false)}>Voltar para a minha carteira</Button>
              </div>
            ) : (
              <div className="space-y-2">
                {minhasCarteiras.length > 0 ? (
                  <>
                    <Input placeholder={`Buscar ${minhasCarteiras.length > 1 ? "nas suas carteiras" : "na carteira"} ${minhasCarteiras.join(", ")}`} value={filtroCarteira}
                      onChange={(e) => setFiltroCarteira(e.target.value)} />
                    <ul className="max-h-48 overflow-y-auto rounded-md border border-border divide-y divide-border">
                      {filtrados.length === 0 ? (
                        <li className="px-3 py-2 text-[12px] text-muted-foreground">
                          {daCarteira.length === 0
                            ? 'Sua carteira ainda não tem clientes. Procure na base e traga do Histórico.'
                            : 'Nenhum cliente da sua carteira com esse nome.'}
                        </li>
                      ) : filtrados.map((c) => (
                        <li key={c.codigo}>
                          <button type="button" onClick={() => escolher(c)}
                            className="w-full text-left px-3 py-2 hover:bg-muted/60 text-[12px]">
                            <span className="font-medium">{c.razao_social}</span>
                            {c.cidade && <span className="text-muted-foreground"> · {c.cidade}{c.estado ? `/${c.estado}` : ''}</span>}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <p className="text-[12px] rounded-md badge-warning px-2 py-1.5">
                    Você ainda não está em nenhuma carteira. Peça ao gestor para colocá-la em uma em
                    Comercial › Configurações › Carteiras. Enquanto isso, dá para registrar ações sem cliente
                    e atender cliente de outra carteira.
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => setProcurandoFora(true)}>
                    Cliente do Histórico ou de outra carteira…
                  </Button>
                  <span className="text-[11px] text-muted-foreground self-center">
                    Sem cliente, só as ações do FAROL contam (campanha, treinamento…).
                  </span>
                </div>
              </div>
            )}
          </section>

          {/* ── Checklist de pedidos (LEVA S) ───────────────────────────────── */}
          {!semCliente && (
            <section className="space-y-2 rounded-lg border border-border p-3">
              <label className="flex items-center gap-2 text-[13px] font-semibold cursor-pointer">
                <Checkbox checked={temPedido} disabled={!!gravado || deOutraPessoa} onCheckedChange={(v) => ligarPedido(v === true)} />
                <ClipboardCheck className="w-4 h-4 text-primary" aria-hidden="true" />
                Fechou pedido — enviar o checklist ao Financeiro
              </label>
              {!temPedido && (
                <p className="text-[11px] text-muted-foreground">
                  Marque quando a venda virou pedido no Forteplus. O Financeiro confere o checklist, aprova ou devolve
                  com o motivo, e acompanha o pagamento.
                </p>
              )}
              {gravado && (
                <div className={`rounded-md px-2 py-1.5 text-[12px] ${situacao === 'Recusado' ? 'badge-danger' : 'badge-info'}`}>
                  <p>
                    <strong>{gravado.resumo.protocolo}</strong> · {situacao}
                    {gravado.resumo.pagamento_status && <> · pagamento: {gravado.resumo.pagamento_status}</>}
                    {gravado.resumo.recusas > 0 && <> · {gravado.resumo.recusas} {gravado.resumo.recusas === 1 ? 'recusa' : 'recusas'}</>}
                  </p>
                  {situacao === 'Recusado' && (
                    <p className="pt-1">
                      O Financeiro devolveu: <strong>{(gravado.resumo.retorno_motivos ?? []).join(', ')}</strong>
                      {gravado.resumo.retorno_observacao && <> — {gravado.resumo.retorno_observacao}</>}.
                      Corrija no Forteplus, ajuste abaixo e salve para reenviar.
                    </p>
                  )}
                  {situacao === 'Em análise' && <p className="pt-1">Enviado ao Financeiro: só pode ser alterado se for devolvido.</p>}
                  {(situacao === 'Aprovado' || situacao === 'Finalizado') && <p className="pt-1">Checklist aprovado não se altera.</p>}
                </div>
              )}
              {temPedido && (
                <ChecklistDoLancamento valor={checklist} onChange={(v) => { setChecklist(v); setProblemas([]); }}
                  itens={itens} travado={checklistTravado} clienteCodigo={form.cliente?.codigo ?? null} />
              )}
              {problemas.length > 0 && (
                <ul className="rounded-md badge-danger px-3 py-2 text-[12px] list-disc list-inside space-y-0.5">
                  {problemas.map((p) => <li key={p}>{p}</li>)}
                </ul>
              )}
            </section>
          )}

          {/* ── Data e status ───────────────────────────────────────────────── */}
          <section className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="lanc-data">Data da atividade</Label>
              {/* A data real — ela define o mês e a semana do painel (§3.1). */}
              <Input id="lanc-data" type="date" value={form.data} disabled={travadoParaMim} onChange={(e) => setForm((f) => ({ ...f, data: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lanc-status">Status</Label>
              <Select value={form.status} disabled={temPedido || concluidoTravado}
                onValueChange={(v) => setForm((f) => ({ ...f, status: v as StatusInteracao }))}>
                <SelectTrigger id="lanc-status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_INTERACAO.map((s) => <SelectItem key={s.valor} value={s.valor}>{s.rotulo}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </section>

          {/* ── Indicadores ─────────────────────────────────────────────────── */}
          <section className="space-y-2">
            <div>
              <Label>Indicadores comerciais</Label>
              <p className="text-[11px] text-muted-foreground">
                Marque só o que aconteceu. Vários na mesma linha, se foi na mesma interação e no mesmo dia.
                {semCliente && ' Indicador exige cliente — escolha o cliente acima para marcar.'}
              </p>
            </div>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {indicadores.map((i) => (
                <label key={i.id} className={`flex items-center gap-2 text-[12px] ${semCliente ? 'opacity-50' : 'cursor-pointer'}`}>
                  <Checkbox checked={form.marcas.has(i.id)} disabled={travadoParaMim || (semCliente && !form.marcas.has(i.id))}
                    onCheckedChange={() => alternarMarca(i.id)} />
                  {i.nome}
                </label>
              ))}
            </div>
            {indicadorSemCliente && (
              <p className="text-[12px] badge-danger rounded-md px-2 py-1">
                Há indicador marcado sem cliente. Escolha o cliente ou desmarque o indicador.
              </p>
            )}
          </section>

          {/* ── Ações do FAROL ──────────────────────────────────────────────── */}
          <section className="space-y-2">
            <div>
              <Label>Ações realizadas (FAROL)</Label>
              <p className="text-[11px] text-muted-foreground">Contam mesmo sem cliente — campanha e treinamento podem ser internos.</p>
            </div>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {acoes.map((a) => (
                <label key={a.id} className="flex items-center gap-2 text-[12px] cursor-pointer">
                  <Checkbox checked={form.marcas.has(a.id)} disabled={travadoParaMim} onCheckedChange={() => alternarMarca(a.id)} />
                  {a.nome}
                </label>
              ))}
            </div>
          </section>

          {/* ── Venda, prazo e observações ──────────────────────────────────── */}
          <section className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="lanc-valor">Valor da venda (R$)</Label>
              <Input id="lanc-valor" inputMode="decimal" placeholder="0,00" readOnly={temPedido || concluidoTravado}
                value={temPedido ? (valorNumero ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : form.valor}
                onChange={(e) => setForm((f) => ({ ...f, valor: e.target.value }))} />
              {temPedido && <p className="text-[11px] text-muted-foreground">Soma dos pedidos tipo Venda do checklist.</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lanc-prazo">Próximo prazo <span className="font-normal text-muted-foreground">(opcional)</span></Label>
              <Input id="lanc-prazo" type="date" value={form.prazo} disabled={concluidoTravado} aria-describedby="lanc-prazo-ajuda"
                onChange={(e) => setForm((f) => ({ ...f, prazo: e.target.value }))} />
              {/* O dono, 2026-09-29: a tela "não especifica o que seria o próximo prazo, quando
                  preencher e por quê". O manual (§3.1) diz: próximo prazo combinado; vencido e não
                  concluído recebe alerta. */}
              <p id="lanc-prazo-ajuda" className="text-[11px] text-muted-foreground">
                A data do próximo passo combinado com o cliente — retornar a ligação, mandar a proposta,
                fechar o pedido. Preencha quando o assunto <strong>ainda não terminou</strong>. Se a data passar
                e o lançamento não estiver Concluído, ele fica marcado como <strong>vencido</strong> na lista, para
                ninguém esquecer o cliente.
              </p>
            </div>
            {valorInvalido && (
              <p className="sm:col-span-2 text-[12px] badge-danger rounded-md px-2 py-1">Valor inválido.</p>
            )}
            {valorQueNaoSoma && (
              <p className="sm:col-span-2 flex items-center gap-1.5 text-[12px] badge-warning rounded-md px-2 py-1">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                Com status "{STATUS_INTERACAO.find((s) => s.valor === form.status)?.rotulo}", este valor fica guardado mas
                <strong>&nbsp;não soma</strong>&nbsp;nas vendas. Venda só soma quando está Concluída.
              </p>
            )}
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="lanc-obs">Observações</Label>
              <Textarea id="lanc-obs" rows={3} readOnly={concluidoTravado} placeholder="Contexto, próximo passo, informação útil — evite só “falado”."
                value={form.observacoes} onChange={(e) => setForm((f) => ({ ...f, observacoes: e.target.value }))} />
            </div>
          </section>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{concluidoTravado && !enviaChecklist ? 'Fechar' : 'Cancelar'}</Button>
          {!(concluidoTravado && !enviaChecklist) && <Button onClick={confirmar}
            disabled={!form.data || valorInvalido || indicadorSemCliente || salvar.isPending || salvarChecklist.isPending}>
            {salvar.isPending || salvarChecklist.isPending
              ? 'Salvando…'
              : enviaChecklist ? 'Salvar e enviar ao Financeiro' : 'Salvar lançamento'}
          </Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
