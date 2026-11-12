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
import { useColaboradores } from '@/hooks/useColaboradores';
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
  STATUS_INTERACAO, useAcompanhamentoDaCarteira, useAtribuirCarteiraEmLote, useBuscarClienteParaLancar, useClientesDaCarteira,
  useSalvarInteracao, useMeusIndicadoresMaisUsados,
  type ClienteParaLancar, type IndicadorCatalogo, type Interacao, type StatusInteracao,
} from '@/hooks/useComercialLancamentos';
import {
  pedidoDoFormulario, useChecklistDoLancamento, useItensDoChecklist, useSalvarChecklist,
} from '@/hooks/usePedidosChecklist';
import {
  lerValor,
  checklistVazio, dadosParaOBanco, problemasDoChecklist, valorDaVenda, type ChecklistEmEdicao,
} from '@/lib/checklist-de-pedidos';
import { ChecklistDoLancamento } from '@/components/comercial/ChecklistDoLancamento';
import { NotasDosPedidos } from '@/components/financeiro/NotasDosPedidos';
import { useAuth } from '@/contexts/AuthContext';
import { usePodeGerirCarteiras, usePodeNoLancamento } from '@/hooks/useAccessProfiles';
import { PedidoDeReajuste } from '@/components/comercial/PedidoDeReajuste';
import { PerguntaDoRaioX } from '@/components/comercial/PerguntaDoRaioX';
import { useRegistrarContato } from '@/hooks/useRaioX';
import { alertaDoCliente, faltaNaResposta, pedeRaioX, respostaVazia, type RespostaDoLancamento } from '@/lib/raio-x';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** As carteiras de quem lança — uma, duas ou mais (2026-10-01). Vazia = sem carteira. */
  minhasCarteiras: string[];
  catalogo: IndicadorCatalogo[];
  /** Nulo = lançamento novo. */
  editando: Interacao | null;
  /** Lançamento novo que já chega com o cliente escolhido (a janela do cliente na Carteira). */
  clienteInicial?: ClienteParaLancar | null;
}

interface Form {
  cliente: ClienteParaLancar | null;
  /** Lançamento com alguém da empresa, no lugar do cliente (dono, 2026-11-05). */
  comPessoa: boolean;
  pessoaId: string;
  data: string;
  status: StatusInteracao;
  valor: string;
  /** Nº e data da nota (dono, 2026-10-15): o valor só existe com eles. */
  nota: string;
  notaEm: string;
  notaFilial: string;
  prazo: string;
  observacoes: string;
  foraDaCarteira: boolean;
  marcas: Set<string>;
}

function formVazio(): Form {
  return {
    cliente: null, comPessoa: false, pessoaId: '', data: todayISO(), status: 'em_andamento', valor: '', nota: '', notaEm: todayISO(), notaFilial: '', prazo: '', observacoes: '',
    foraDaCarteira: false, marcas: new Set(),
  };
}

// Fora da minha carteira é TODO cliente que não está nela — o de outra carteira E o do Histórico (sem carteira). Só quem
// gere carteiras lança esse cliente (dono, 2026-11-06); a vendedora traz o do Histórico para a carteira dela antes.
const foraDaMinha = (c: ClienteParaLancar, minhas: string[]) => !c.carteira || !minhas.includes(c.carteira);

export function LancamentoDialog({ open, onOpenChange, minhasCarteiras, catalogo, editando, clienteInicial = null }: Props) {
  const [form, setForm] = useState<Form>(formVazio);
  const [buscaFora, setBuscaFora] = useState('');
  const [procurandoFora, setProcurandoFora] = useState(false);
  const salvar = useSalvarInteracao();
  const { data: colaboradores = [] } = useColaboradores();
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
  // Raio-X (dono, 2026-11-05): cliente parado ou em queda, em contato sem venda, responde por que não está comprando.
  // ponytail: a obrigação mora só nesta tela, porque "parado ou em queda" é conta da Carteira. Se surgir outra porta de
  // lançamento, a regra vai para `com_salvar_interacao`.
  const [resposta, setResposta] = useState<RespostaDoLancamento>(respostaVazia);
  const registrarContato = useRegistrarContato();
  const { data: itens = [] } = useItensDoChecklist();
  // DOIS PASSOS (proposta "Helpoint no dia a dia", etapa 4 · Comercial, 2026-10-24): eram ~35 controles numa janela,
  // 26 deles caixinhas. Passo 1: o cliente e o que aconteceu (data, status, pedido); passo 2: indicadores, ações e
  // venda, com os cinco indicadores que ela mais usa em cima. Editar um lançamento continua mostrando tudo de uma vez.
  const [passo, setPasso] = useState<1 | 2>(1);
  const [verTodos, setVerTodos] = useState(false);
  const { data: maisUsados = [] } = useMeusIndicadoresMaisUsados();
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
  // A nota e o valor se completam depois, uma vez, mesmo concluído (dono, 2026-10-15; 20270123010000).
  const notaPosta = !!editando?.nota_fiscal && !podeCorrigir;
  const completandoNota = concluidoTravado && !editando?.nota_fiscal;
  // O checklist é de quem lançou (o banco só aceita ela ou o administrador).
  const deOutraPessoa = !!editando && editando.vendedor_id !== user?.id;
  const podeGerirCarteiras = usePodeGerirCarteiras();
  // Enviado, o checklist fica com o Financeiro: só a recusa devolve (decisão do dono, 2026-10-02).
  const checklistTravado = (situacao !== null && situacao !== 'Recusado') || deOutraPessoa;

  useEffect(() => {
    if (!open) return;
    setIdGravado(null);
    setResposta(respostaVazia());
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
    setPasso(1);
    setVerTodos(false);
    if (!editando) {
      setForm({ ...formVazio(), cliente: clienteInicial, foraDaCarteira: !!clienteInicial && foraDaMinha(clienteInicial, minhasCarteiras) });
      return;
    }
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
      comPessoa: false,
      pessoaId: editando.pessoa_interna_id ?? '',
      data: editando.data,
      status: editando.status,
      valor: editando.valor_venda === null ? '' : String(editando.valor_venda).replace('.', ','),
      nota: editando.nota_fiscal ?? '',
      notaEm: editando.nota_em ?? todayISO(),
      notaFilial: editando.nota_filial ?? '',
      prazo: editando.prazo ?? '',
      observacoes: editando.observacoes ?? '',
      foraDaCarteira: editando.fora_da_carteira,
      marcas: new Set(editando.marcas),
    });
  }, [open, editando, minhasCarteiras, clienteInicial]);

  const indicadores = useMemo(() => catalogo.filter((c) => c.tipo === 'indicador' && (c.ativo || form.marcas.has(c.id))), [catalogo, form.marcas]);
  const acoes = useMemo(() => catalogo.filter((c) => c.tipo === 'acao' && (c.ativo || form.marcas.has(c.id))), [catalogo, form.marcas]);
  // Os cinco que ela mais usa em cima (completa com os primeiros do catálogo); o que já está marcado nunca se esconde.
  const emCima = useMemo(() => {
    const ids = new Set(indicadores.map((i) => i.id));
    const ordem = [...maisUsados.filter((id) => ids.has(id)), ...indicadores.map((i) => i.id)];
    return new Set([...new Set(ordem)].slice(0, 5));
  }, [indicadores, maisUsados]);
  const indicadoresVisiveis = useMemo(() => (editando || verTodos
    ? indicadores
    : indicadores.filter((i) => emCima.has(i.id) || form.marcas.has(i.id))
        .sort((a, b) => Number(emCima.has(b.id)) - Number(emCima.has(a.id)))), [editando, verTodos, indicadores, emCima, form.marcas]);
  const escondidos = indicadores.length - indicadoresVisiveis.length;
  const mostra = (p: 1 | 2) => !!editando || passo === p;

  const semCliente = form.cliente === null;
  // Lançamento novo diz com quem foi: cliente ou pessoa da empresa (dono, 2026-11-05). O banco recusa o mesmo.
  const clienteBloqueado = !editando && !podeGerirCarteiras && !!form.cliente && foraDaMinha(form.cliente, minhasCarteiras);
  const faltaCliente = !editando && ((semCliente && !form.pessoaId) || clienteBloqueado);
  const faltaAcaoInterna = !editando && form.comPessoa && !acoes.some((a) => form.marcas.has(a.id));
  // O valor da venda só com a nota fiscal (dono, 2026-10-15): o pedido fechado é "A faturar" — o valor dele fica
  // no checklist e aparece na Carteira, mas não é venda até a nota.
  const valorNumero = form.valor.trim() === '' ? null : lerValor(form.valor) ?? NaN;
  const valorInvalido = valorNumero !== null && (!Number.isFinite(valorNumero) || valorNumero <= 0);
  const notaIncompleta = (valorNumero !== null) !== (form.nota.trim() !== '') || (form.nota.trim() !== '' && (!form.notaEm || !form.notaFilial));
  // A data da nota nem no futuro nem antes do contato (dono, 2026-10-15): o banco recusa o mesmo (`com_nota_em_confere`).
  const dataDaNotaInvalida = !notaPosta && form.nota.trim() !== '' && !!form.notaEm && (form.notaEm > todayISO() || (!!form.data && form.notaEm < form.data));
  const valorDoPedido = temPedido ? valorDaVenda(checklist.pedidos) : null;
  const indicadorSemCliente = semCliente && indicadores.some((i) => form.marcas.has(i.id));

  const filtrados = useMemo(() => {
    const t = filtroCarteira.trim().toLowerCase();
    if (!t) return daCarteira;
    return daCarteira.filter((c) =>
      c.razao_social.toLowerCase().includes(t) || (c.fantasia ?? '').toLowerCase().includes(t) || c.codigo.includes(t));
  }, [daCarteira, filtroCarteira]);

  const escolher = (c: ClienteParaLancar) => {
    setForm((f) => ({ ...f, cliente: c, foraDaCarteira: foraDaMinha(c, minhasCarteiras) }));
    setProcurandoFora(false);
  };

  const alternarMarca = (id: string) => setForm((f) => {
    const marcas = new Set(f.marcas);
    if (marcas.has(id)) marcas.delete(id); else marcas.add(id);
    return { ...f, marcas };
  });

  const enviaChecklist = temPedido && !checklistTravado;
  // A vendedora não lê a carteira de outra pessoa: sem isto, a conta recusaria o cliente que ela acabou de ver bloqueado.
  const carteiraDoAlerta = open && !editando && (!form.foraDaCarteira || podeGerirCarteiras) ? form.cliente?.carteira ?? null : null;
  const { data: daCarteiraDoCliente = [], isLoading: lendoAlerta } = useAcompanhamentoDaCarteira(carteiraDoAlerta, `${todayISO().slice(0, 7)}-01`);
  const linhaDoCliente = daCarteiraDoCliente.find((l) => form.cliente && l.codigos.includes(form.cliente.codigo));
  const alerta = linhaDoCliente ? alertaDoCliente(linhaDoCliente) : null;
  // Só no "Contato para venda" sem venda (dono, 2026-11-10); a situação do cliente só muda o aviso.
  const comRaioX = pedeRaioX({ editando: !!editando, temPedido, valor: valorNumero,
    indicadoresMarcados: indicadores.filter((i) => form.marcas.has(i.id)).map((i) => i.nome) });
  const faltaRaioX = comRaioX && (lendoAlerta || faltaNaResposta(resposta));
  // O botão diz o que falta (revisão do Comercial, 2026-11-12: o "Salvar" ficava apagado sem dizer por quê).
  const oQueFalta = !form.data ? 'a data do contato'
    : faltaCliente ? (clienteBloqueado ? 'um cliente da sua carteira' : 'o cliente')
    : faltaAcaoInterna ? 'marcar uma ação (contato com pessoa da equipe)'
    : indicadorSemCliente ? 'o cliente, porque indicador só conta com cliente'
    : valorInvalido ? 'um valor de venda maior que zero'
    : notaIncompleta ? 'a nota completa: número, valor, data e filial'
    : dataDaNotaInvalida ? 'uma data da nota entre o contato e hoje'
    : faltaRaioX ? (lendoAlerta ? null : 'a resposta do Raio-X do cliente')
    : null;

  const ligarPedido = (ligado: boolean) => {
    setTemPedido(ligado);
    setProblemas([]);
    // Pedido fechado é venda concluída: é o status em que o valor soma (§3.1).
    if (ligado) setForm((f) => ({ ...f, status: 'concluido' }));
  };

  const confirmar = async () => {
    if (!form.data || faltaCliente || faltaAcaoInterna || valorInvalido || notaIncompleta || dataDaNotaInvalida || indicadorSemCliente || faltaRaioX) return;
    if (enviaChecklist) {
      const achados = problemasDoChecklist(checklist.contato, checklist.pedidos, itens);
      setProblemas(achados);
      if (achados.length > 0) return;
    }
    // Concluído e travado, só o checklist devolvido e a nota que falta ainda se completam.
    const vaiAoBanco = !concluidoTravado || (completandoNota && form.nota.trim() !== '');
    const id = !vaiAoBanco && editando ? editando.id : await salvar.mutateAsync({
      id: editando?.id ?? idGravado ?? undefined,
      cliente_codigo: form.cliente?.codigo ?? null,
      pessoa_interna_id: form.pessoaId || null,
      data: form.data,
      status: form.status,
      valor_venda: valorNumero,
      nota_fiscal: form.nota.trim() || null,
      nota_em: form.nota.trim() ? form.notaEm : null,
      nota_filial: form.nota.trim() ? form.notaFilial : null,
      prazo: form.prazo || null,
      observacoes: form.observacoes.trim() || null,
      fora_da_carteira: form.foraDaCarteira,
      marcas: [...form.marcas],
    });
    setIdGravado(id);
    if (comRaioX) await registrarContato.mutateAsync({ interacaoId: id, r: resposta });
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
          {!editando && (
            <p className="text-[13px] text-muted-foreground">
              Passo {passo} de 2 · {passo === 1 ? 'o cliente e o que aconteceu' : 'indicadores, ações e venda'}
            </p>
          )}
        </DialogHeader>

        <div className="space-y-5">
          {situacao === 'Recusado' && !deOutraPessoa && (
            <p className="text-[13px] rounded-md badge-warning px-2 py-1.5">
              <strong>Pedido devolvido pelo Financeiro.</strong> O checklist abaixo está liberado: corrija e clique em Salvar e enviar ao Financeiro.
            </p>
          )}
          {travadoParaMim && situacao !== 'Recusado' && (
            <p className="text-[13px] rounded-md badge-info px-2 py-1.5">
              {concluidoTravado
                ? <>Lançamento <strong>concluído</strong>: nada nele muda mais.</>
                : <>Lançamento salvo: <strong>indicadores, ações, cliente e data não mudam</strong>. Dá para avançar o status até Concluído, com valor, prazo e observação.</>}
              {' '}Entrou em contato de novo? Faça um <strong>lançamento novo</strong> — cada contato conta. Erro? Peça ao gestor para corrigir.
            </p>
          )}
          {mostra(1) && (<>
          {/* ── Cliente ─────────────────────────────────────────────────────── */}
          <section className="space-y-2">
            {editando?.pessoa_interna_id ? (
              <p className="text-[14px]">Ação interna com <strong>{editando.pessoa?.full_name ?? 'pessoa da empresa'}</strong></p>
            ) : (
              <>
            {editando ? <Label>Cliente</Label> : (
              <div className="flex h-9 w-full max-w-xs rounded-md border border-input bg-card overflow-hidden" role="group" aria-label="Com quem foi">
                {([[false, 'Cliente'], [true, 'Pessoa da empresa']] as const).map(([comPessoa, rotulo]) => (
                  <button key={rotulo} type="button" aria-pressed={form.comPessoa === comPessoa}
                    onClick={() => setForm((f) => (f.comPessoa === comPessoa ? f : { ...f, comPessoa, pessoaId: '', cliente: null, foraDaCarteira: false, marcas: new Set() }))}
                    className={`flex-1 text-[13px] font-semibold ${form.comPessoa === comPessoa ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-muted'}`}>
                    {rotulo}
                  </button>
                ))}
              </div>
            )}
            {form.comPessoa ? (
              <div className="space-y-1.5">
                <select id="lanc-pessoa" aria-label="Pessoa da empresa" value={form.pessoaId} onChange={(e) => setForm((f) => ({ ...f, pessoaId: e.target.value }))}
                  className="flex h-9 w-full rounded-md border border-input bg-card px-3 text-[14px]">
                  <option value="">Escolha a pessoa…</option>
                  {colaboradores.map((c) => <option key={c.id} value={c.id}>{c.full_name || c.email}</option>)}
                </select>
                <p className="text-[12px] text-muted-foreground">Para campanha, evento, treinamento ou reunião interna. Venda e demais indicadores precisam de cliente.</p>
              </div>
            ) : form.cliente ? (
              <div className="rounded-lg border border-border p-3 space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[14px] font-semibold truncate">{form.cliente.razao_social}</p>
                    {/* Cidade/UF e telefone "não se digitam" (§3.1): vêm do cadastro. */}
                    <p className="text-[13px] text-muted-foreground">
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
                {clienteBloqueado && form.cliente.carteira && (
                  <p className="text-[13px] rounded-md badge-warning px-2 py-1">
                    Este cliente é da carteira <strong>{form.cliente.carteira}</strong>. Peça ao gestor para mudá-lo de carteira, se for atender.
                  </p>
                )}
                {clienteBloqueado && !form.cliente.carteira && minhasCarteiras.length === 0 && (
                  <p className="text-[13px] rounded-md badge-warning px-2 py-1">
                    Este cliente está no <strong>Histórico</strong>. Peça ao gestor para colocar você em uma carteira.
                  </p>
                )}
                {form.foraDaCarteira && !clienteBloqueado && (
                  <p className="text-[13px] rounded-md badge-warning px-2 py-1">
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
                  <div className="flex flex-wrap items-center gap-2 rounded-md badge-info px-2 py-1.5 text-[13px]">
                    <span>Este cliente está no <strong>Histórico</strong> — ainda não é de ninguém.{clienteBloqueado && ' Traga para a sua carteira para lançar.'}</span>
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
                    <li className="px-3 py-2 text-[13px] text-muted-foreground">Digite pelo menos duas letras.</li>
                  ) : achados.length === 0 ? (
                    <li className="px-3 py-2 text-[13px] text-muted-foreground">Nenhum cliente encontrado.</li>
                  ) : achados.map((c) => {
                    const deOutraCarteira = !podeGerirCarteiras && !!c.carteira && !minhasCarteiras.includes(c.carteira);
                    return (
                      <li key={c.codigo}>
                        <button type="button" disabled={deOutraCarteira} onClick={() => escolher(c)}
                          className="w-full text-left px-3 py-2 enabled:hover:bg-muted/60 text-[13px]">
                          <span className="font-medium">{c.razao_social}</span>
                          <span className="text-muted-foreground"> · {c.carteira ?? 'Histórico'}</span>
                          {deOutraCarteira && <span className="block text-muted-foreground">De outra carteira. Peça ao gestor para mudá-lo de carteira, se for atender.</span>}
                        </button>
                      </li>
                    );
                  })}
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
                        <li className="px-3 py-2 text-[13px] text-muted-foreground">
                          {daCarteira.length === 0
                            ? 'Sua carteira ainda não tem clientes. Procure na base e traga do Histórico.'
                            : 'Nenhum cliente da sua carteira com esse nome.'}
                        </li>
                      ) : filtrados.map((c) => (
                        <li key={c.codigo}>
                          <button type="button" onClick={() => escolher(c)}
                            className="w-full text-left px-3 py-2 hover:bg-muted/60 text-[13px]">
                            <span className="font-medium">{c.razao_social}</span>
                            {c.cidade && <span className="text-muted-foreground"> · {c.cidade}{c.estado ? `/${c.estado}` : ''}</span>}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <p className="text-[13px] rounded-md badge-warning px-2 py-1.5">
                    Você ainda não está em nenhuma carteira. Peça ao gestor para colocá-la em uma em
                    Comercial › Configurações › Equipe e carteiras.
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => setProcurandoFora(true)}>
                    {podeGerirCarteiras ? 'Cliente do Histórico ou de outra carteira…' : 'Cliente do Histórico…'}
                  </Button>
                  <span className="text-[12px] text-muted-foreground self-center">
                    Campanha, evento, treinamento ou reunião interna? Use Pessoa da empresa, acima.
                  </span>
                </div>
              </div>
            )}
              </>
            )}
          </section>

          {/* ── Checklist de pedidos (LEVA S) ───────────────────────────────── */}
          {!semCliente && (
            <section className="space-y-2 rounded-lg border border-border p-3">
              <label className="flex items-center gap-2 text-[14px] font-semibold cursor-pointer">
                <Checkbox checked={temPedido} disabled={!!gravado || deOutraPessoa} onCheckedChange={(v) => ligarPedido(v === true)} />
                <ClipboardCheck className="w-4 h-4 text-primary" aria-hidden="true" />
                Fechou pedido — enviar o checklist ao Financeiro
              </label>
              {!temPedido && (
                <p className="text-[12px] text-muted-foreground">
                  Marque quando a venda virou pedido no Forteplus. O Financeiro confere o checklist, aprova ou devolve
                  com o motivo, e acompanha o pagamento.
                </p>
              )}
              {gravado && (
                <div className={`rounded-md px-2 py-1.5 text-[13px] ${situacao === 'Recusado' || situacao === 'Cancelado' ? 'badge-danger' : 'badge-info'}`}>
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
                  {situacao === 'Cancelado' && (
                    <p className="pt-1">
                      O Financeiro cancelou este pedido{gravado.resumo.cancelado_por ? ` (${gravado.resumo.cancelado_por})` : ''}: <strong>{gravado.resumo.cancelamento_motivo}</strong>.
                      É definitivo, e o lançamento sai dos indicadores. Pedido novo é um lançamento novo.
                    </p>
                  )}
                  {(situacao === 'Aprovado' || situacao === 'Finalizado') && <p className="pt-1">Checklist aprovado não se altera. A nota de cada pedido vem do Financeiro, abaixo. Para corrigir, peça reajuste ao Financeiro.</p>}
                </div>
              )}
              {gravado && (situacao === 'Aprovado' || situacao === 'Finalizado') && (
                <NotasDosPedidos checklistId={gravado.resumo.id} pedidos={gravado.pedidos} podeEditar={false} />
              )}
              {gravado && <PedidoDeReajuste resumo={gravado.resumo} podePedir={!deOutraPessoa || podeGerirCarteiras} />}
              {temPedido && (
                <ChecklistDoLancamento valor={checklist} onChange={(v) => { setChecklist(v); setProblemas([]); }}
                  itens={itens} travado={checklistTravado} clienteCodigo={form.cliente?.codigo ?? null} />
              )}
              {problemas.length > 0 && (
                <ul className="rounded-md badge-danger px-3 py-2 text-[13px] list-disc list-inside space-y-0.5">
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

          </>)}

          {mostra(2) && (<>
          {/* ── Indicadores ─────────────────────────────────────────────────── */}
          <section className="space-y-2">
            <div>
              <Label>Indicadores comerciais</Label>
              <p className="text-[12px] text-muted-foreground">
                Marque só o que aconteceu. Vários na mesma linha, se foi na mesma interação e no mesmo dia.
                {semCliente && ' Indicador exige cliente — escolha o cliente acima para marcar.'}
              </p>
            </div>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {indicadoresVisiveis.map((i) => (
                <label key={i.id} className={`flex items-center gap-2 text-[13px] ${semCliente ? 'opacity-50' : 'cursor-pointer'}`}>
                  <Checkbox checked={form.marcas.has(i.id)} disabled={travadoParaMim || (semCliente && !form.marcas.has(i.id))}
                    onCheckedChange={() => alternarMarca(i.id)} />
                  {i.nome}
                </label>
              ))}
            </div>
            {escondidos > 0 && (
              <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-[13px]" onClick={() => setVerTodos(true)}>
                Ver os outros {escondidos}
              </Button>
            )}
            {indicadorSemCliente && (
              <p className="text-[13px] badge-danger rounded-md px-2 py-1">
                Há indicador marcado sem cliente. Escolha o cliente ou desmarque o indicador.
              </p>
            )}
          </section>

          {/* ── Ações do FAROL ──────────────────────────────────────────────── */}
          <section className="space-y-2">
            <div>
              <Label>Ações realizadas (FAROL)</Label>
              <p className="text-[12px] text-muted-foreground">{form.comPessoa ? 'Com pessoa da empresa: marque pelo menos uma das ações liberadas.' : 'Campanha, treinamento e demais ações do atendimento ao cliente.'}</p>
            </div>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {acoes.map((a) => (
                <label key={a.id} className="flex items-center gap-2 text-[13px] cursor-pointer">
                  <Checkbox checked={form.marcas.has(a.id)} disabled={travadoParaMim || (form.comPessoa && !a.aceita_pessoa_interna)} onCheckedChange={() => alternarMarca(a.id)} />
                  {a.nome}
                </label>
              ))}
            </div>
          </section>

          {/* ── Venda, prazo e observações ──────────────────────────────────── */}
          <section className="grid gap-3 sm:grid-cols-2">
            {/* Nota e valor andam juntos (dono, 2026-10-15): preenche quando o pedido for FATURADO. Até lá o pedido
                fechado aparece na Carteira como "A faturar". Sem nota, o lançamento não conta nas vendas. */}
            <div className="space-y-1.5 sm:col-span-2 rounded-lg border border-border p-3">
              <p className="text-[14px] font-medium">Faturado? Nota fiscal e valor</p>
              <p className="text-[12px] text-muted-foreground">
                Preencha quando o pedido for faturado — pode voltar depois e completar, mesmo com o lançamento concluído.
                Sem a nota, o lançamento não conta nas vendas.
                {valorDoPedido !== null && valorDoPedido > 0 && <> Pedido fechado: <strong>{valorDoPedido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong> a faturar.</>}
              </p>
              <div className="grid gap-3 sm:grid-cols-4">
                <div className="space-y-1">
                  {/* A filial da nota (2026-10-15): o mesmo número existe nas duas, e o filtro da Carteira é por filial. */}
                  <Label htmlFor="lanc-nota-filial">Filial da nota</Label>
                  <Select value={form.notaFilial || undefined} disabled={notaPosta || (concluidoTravado && !completandoNota)}
                    onValueChange={(v) => setForm((f) => ({ ...f, notaFilial: v }))}>
                    <SelectTrigger id="lanc-nota-filial"><SelectValue placeholder="Escolha" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="INBRAS">INBRAS</SelectItem>
                      <SelectItem value="MF">MF</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="lanc-nota">Nº da nota fiscal</Label>
                  <Input id="lanc-nota" value={form.nota} readOnly={notaPosta || (concluidoTravado && !completandoNota)}
                    onChange={(e) => setForm((f) => ({ ...f, nota: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="lanc-nota-em">Data da nota</Label>
                  <Input id="lanc-nota-em" type="date" value={form.notaEm} min={form.data || undefined} max={todayISO()} readOnly={notaPosta || (concluidoTravado && !completandoNota)}
                    onChange={(e) => setForm((f) => ({ ...f, notaEm: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="lanc-valor">Valor da venda (R$)</Label>
                  <Input id="lanc-valor" inputMode="decimal" placeholder="0,00" readOnly={notaPosta || (concluidoTravado && !completandoNota)}
                    value={form.valor} onChange={(e) => setForm((f) => ({ ...f, valor: e.target.value }))} />
                </div>
              </div>
              {notaIncompleta && (
                <p className="text-[12px] text-status-danger">Nota e valor andam juntos: preencha a filial, o Nº da nota, a data e o valor.</p>
              )}
              {dataDaNotaInvalida && (
                <p className="text-[12px] text-status-danger">A data da nota não pode ser depois de hoje nem antes da data do contato.</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lanc-prazo">Próximo prazo <span className="font-normal text-muted-foreground">(opcional)</span></Label>
              <Input id="lanc-prazo" type="date" value={form.prazo} disabled={concluidoTravado} aria-describedby="lanc-prazo-ajuda"
                onChange={(e) => setForm((f) => ({ ...f, prazo: e.target.value }))} />
              {/* O dono, 2026-09-29: a tela "não especifica o que seria o próximo prazo, quando
                  preencher e por quê". O manual (§3.1) diz: próximo prazo combinado; vencido e não
                  concluído recebe alerta. */}
              <p id="lanc-prazo-ajuda" className="text-[12px] text-muted-foreground">
                A data do próximo passo combinado com o cliente — retornar a ligação, mandar a proposta,
                fechar o pedido. Preencha quando o assunto <strong>ainda não terminou</strong>. Se a data passar
                e o lançamento não estiver Concluído, ele fica marcado como <strong>vencido</strong> na lista, para
                ninguém esquecer o cliente.
              </p>
            </div>
            {valorInvalido && (
              <p className="sm:col-span-2 text-[13px] badge-danger rounded-md px-2 py-1">Valor inválido.</p>
            )}
            {comRaioX && !lendoAlerta && <div className="sm:col-span-2"><PerguntaDoRaioX alerta={alerta} resposta={resposta} onChange={setResposta} /></div>}
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="lanc-obs">Observações</Label>
              <Textarea id="lanc-obs" rows={3} readOnly={concluidoTravado} placeholder="Contexto, próximo passo, informação útil — evite só “falado”."
                value={form.observacoes} onChange={(e) => setForm((f) => ({ ...f, observacoes: e.target.value }))} />
            </div>
          </section>
          </>)}
        </div>

        <DialogFooter className="items-center">
          {oQueFalta && (!!editando || passo === 2) && !(concluidoTravado && !enviaChecklist && !completandoNota) && (
            <p role="status" className="text-[13px] text-status-warning sm:mr-auto">Para salvar, falta {oQueFalta}.</p>
          )}
          {!editando && passo === 2
            ? <Button variant="outline" onClick={() => setPasso(1)}>Voltar</Button>
            : <Button variant="outline" onClick={() => onOpenChange(false)}>{concluidoTravado && !enviaChecklist && !completandoNota ? 'Fechar' : 'Cancelar'}</Button>}
          {!editando && passo === 1 && <Button onClick={() => setPasso(2)} disabled={!form.data || faltaCliente}>Continuar</Button>}
          {(!!editando || passo === 2) && !(concluidoTravado && !enviaChecklist && !completandoNota) && <Button onClick={confirmar}
            disabled={!form.data || faltaCliente || faltaAcaoInterna || valorInvalido || notaIncompleta || dataDaNotaInvalida || indicadorSemCliente || faltaRaioX || salvar.isPending || salvarChecklist.isPending || registrarContato.isPending}>
            {salvar.isPending || salvarChecklist.isPending || registrarContato.isPending
              ? 'Salvando…'
              : enviaChecklist ? 'Salvar e enviar ao Financeiro' : 'Salvar lançamento'}
          </Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
