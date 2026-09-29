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
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowDownToLine, Search, X } from 'lucide-react';
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

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  minhaCarteira: string | null;
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

export function LancamentoDialog({ open, onOpenChange, minhaCarteira, catalogo, editando }: Props) {
  const [form, setForm] = useState<Form>(formVazio);
  const [buscaFora, setBuscaFora] = useState('');
  const [procurandoFora, setProcurandoFora] = useState(false);
  const salvar = useSalvarInteracao();
  const trazer = useAtribuirCarteiraEmLote();
  const { data: daCarteira = [] } = useClientesDaCarteira(minhaCarteira);
  const { data: achados = [] } = useBuscarClienteParaLancar(procurandoFora ? buscaFora : '');
  const [filtroCarteira, setFiltroCarteira] = useState('');

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
            carteira: editando.fora_da_carteira ? null : minhaCarteira,
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
  }, [open, editando, minhaCarteira]);

  const indicadores = useMemo(() => catalogo.filter((c) => c.tipo === 'indicador' && (c.ativo || form.marcas.has(c.id))), [catalogo, form.marcas]);
  const acoes = useMemo(() => catalogo.filter((c) => c.tipo === 'acao' && (c.ativo || form.marcas.has(c.id))), [catalogo, form.marcas]);

  const semCliente = form.cliente === null;
  const valorNumero = form.valor.trim() === '' ? null : Number(form.valor.replace(',', '.'));
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
    const foraDaMinha = !minhaCarteira || c.carteira !== minhaCarteira;
    setForm((f) => ({ ...f, cliente: c, foraDaCarteira: foraDaMinha }));
    setProcurandoFora(false);
  };

  const alternarMarca = (id: string) => setForm((f) => {
    const marcas = new Set(f.marcas);
    if (marcas.has(id)) marcas.delete(id); else marcas.add(id);
    return { ...f, marcas };
  });

  const confirmar = async () => {
    if (!form.data || valorInvalido || indicadorSemCliente) return;
    await salvar.mutateAsync({
      id: editando?.id,
      cliente_codigo: form.cliente?.codigo ?? null,
      data: form.data,
      status: form.status,
      valor_venda: valorNumero,
      prazo: form.prazo || null,
      observacoes: form.observacoes.trim() || null,
      fora_da_carteira: form.foraDaCarteira,
      marcas: [...form.marcas],
    });
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
                  <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" aria-label="Trocar cliente"
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
                {noHistorico && minhaCarteira && (
                  <div className="flex flex-wrap items-center gap-2 rounded-md badge-info px-2 py-1.5 text-[12px]">
                    <span>Este cliente está no <strong>Histórico</strong> — ainda não é de ninguém.</span>
                    <Button size="sm" variant="secondary" className="h-7" disabled={trazer.isPending}
                      onClick={() => trazer.mutate(
                        { codigos: [form.cliente!.codigo], carteira: minhaCarteira },
                        { onSuccess: () => setForm((f) => (f.cliente ? { ...f, cliente: { ...f.cliente, carteira: minhaCarteira }, foraDaCarteira: false } : f)) },
                      )}>
                      <ArrowDownToLine className="w-3.5 h-3.5 mr-1" aria-hidden="true" />
                      Trazer para a carteira {minhaCarteira}
                    </Button>
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
                {minhaCarteira ? (
                  <>
                    <Input placeholder={`Buscar na carteira ${minhaCarteira}`} value={filtroCarteira}
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

          {/* ── Data e status ───────────────────────────────────────────────── */}
          <section className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="lanc-data">Data da atividade</Label>
              {/* A data real — ela define o mês e a semana do painel (§3.1). */}
              <Input id="lanc-data" type="date" value={form.data} onChange={(e) => setForm((f) => ({ ...f, data: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lanc-status">Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v as StatusInteracao }))}>
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
                  <Checkbox checked={form.marcas.has(i.id)} disabled={semCliente && !form.marcas.has(i.id)}
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
                  <Checkbox checked={form.marcas.has(a.id)} onCheckedChange={() => alternarMarca(a.id)} />
                  {a.nome}
                </label>
              ))}
            </div>
          </section>

          {/* ── Venda, prazo e observações ──────────────────────────────────── */}
          <section className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="lanc-valor">Valor da venda (R$)</Label>
              <Input id="lanc-valor" inputMode="decimal" placeholder="0,00" value={form.valor}
                onChange={(e) => setForm((f) => ({ ...f, valor: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lanc-prazo">Próximo prazo <span className="font-normal text-muted-foreground">(opcional)</span></Label>
              <Input id="lanc-prazo" type="date" value={form.prazo} aria-describedby="lanc-prazo-ajuda"
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
              <Textarea id="lanc-obs" rows={3} placeholder="Contexto, próximo passo, informação útil — evite só “falado”."
                value={form.observacoes} onChange={(e) => setForm((f) => ({ ...f, observacoes: e.target.value }))} />
            </div>
          </section>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={confirmar} disabled={!form.data || valorInvalido || indicadorSemCliente || salvar.isPending}>
            {salvar.isPending ? 'Salvando…' : 'Salvar lançamento'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
