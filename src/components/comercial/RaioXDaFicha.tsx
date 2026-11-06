// A aba Raio-X da ficha do cliente (proposta aprovada pelo dono em 2026-11-05): "Antes de ligar", o perfil, as dores e as
// propostas. Vermelho é dor aberta, laranja em tratamento, verde resolvida; dor aberta fica à vista até alguém fechar.
// O status e o resultado são de quem atende; o texto escrito, só o gestor corrige (o banco cobra as duas regras).
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { useDepartmentPermissions, usePodeNoLancamento } from '@/hooks/useAccessProfiles';
import { toLocalISODate, todayISO } from '@/lib/dates';
import { gerarRelatorioPdf } from '@/lib/relatorio-pdf';
import { mensagemDeErro } from '@/lib/supabase-result';
import {
  useMudarDor, useMudarProposta, useRaioXDoCliente, useRegistrarDor, useRegistrarProposta, useSalvarPerfil, type PerfilEmEdicao,
} from '@/hooks/useRaioX';
import { Opcao } from '@/components/comercial/PerguntaDoRaioX';
import {
  MOTIVOS, O_QUE_PESA, RESULTADOS_DA_PROPOSTA, SITUACOES, STATUS_DA_DOR, TIPOS_DE_NEGOCIO, TIPOS_DE_PROPOSTA, TOTAL_DE_CAMPOS,
  camposPreenchidos, rotuloDaSituacao, rotuloDoMotivo, rotuloDoResultado, rotuloDoStatus, rotuloDoTipoDeProposta, situacaoAnterior,
  type DorDoCliente, type Motivo, type PerfilDoCliente, type RaioXDoCliente, type ResultadoDaProposta, type Situacao, type StatusDaDor, type TipoDeProposta,
} from '@/lib/raio-x';
import { formatBRL, formatDateBR } from '@/types/financeiro';

const COR_DA_DOR: Record<StatusDaDor, string> = {
  aberta: 'border-l-status-danger', em_tratamento: 'border-l-status-warning', resolvida: 'border-l-status-success', sem_solucao: 'border-l-border',
};

export function RaioXDaFicha({ codigo, nome }: { codigo: string; nome: string }) {
  const { can } = useDepartmentPermissions('comercial');
  const { data, isLoading, isError } = useRaioXDoCliente(codigo);
  const [perfilAberto, setPerfilAberto] = useState(false);
  const [novaDor, setNovaDor] = useState(false);
  if (isLoading) return <p className="text-[13px] text-muted-foreground">Carregando…</p>;
  if (isError || !data) return <p className="text-[13px] text-status-danger">Não consegui carregar o Raio-X deste cliente.</p>;

  const perfil = data.perfis[0];
  const anterior = situacaoAnterior(data.perfis);
  const abertas = data.dores.filter((d) => d.status === 'aberta' || d.status === 'em_tratamento');
  const resolvida = data.dores.find((d) => d.status === 'resolvida');
  const funcionou = resolvida?.propostas.find((p) => p.resultado === 'funcionou');

  return (
    <div className="space-y-4">
      <section className="rounded-lg badge-info p-3 space-y-1">
        <h3 className="text-sm font-semibold">Antes de ligar</h3>
        <p className="text-[14px]">
          {data.ultima_compra
            ? <>Última compra em {formatDateBR(data.ultima_compra)}{data.valor_ultima_compra ? `: ${formatBRL(data.valor_ultima_compra)}` : ''}.</>
            : 'Nenhuma compra registrada no sistema.'}
          {abertas.length > 0 && <> Dor em aberto: <strong>{abertas.map(rotuloDoMotivo).join(', ')}</strong>.</>}
          {resolvida && <> Resolvido antes: {rotuloDoMotivo(resolvida)}{funcionou ? ` com ${funcionou.proposta}` : ''}.</>}
          {data.tentativas_sem_falar > 0 && <> {data.tentativas_sem_falar} {data.tentativas_sem_falar === 1 ? 'tentativa' : 'tentativas'} sem falar com o cliente.</>}
        </p>
      </section>

      <section className="rounded-lg border border-border p-3 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">
            Perfil <span className="font-normal text-[12px] text-muted-foreground">
              {perfil ? `atualizado em ${formatDateBR(toLocalISODate(new Date(perfil.created_at)))}${perfil.autor ? ` por ${perfil.autor}` : ''} · ` : ''}{camposPreenchidos(perfil)} de {TOTAL_DE_CAMPOS} preenchidos
            </span>
          </h3>
          <Button variant="outline" size="sm" onClick={() => setPerfilAberto(true)}>{perfil ? 'Atualizar perfil' : 'Preencher perfil'}</Button>
        </div>
        <dl className="grid gap-x-4 gap-y-2 grid-cols-2 lg:grid-cols-3 text-[14px]">
          <Campo nome="Tipo de negócio" valor={perfil?.tipo_negocio} />
          <Campo nome="Quem decide" valor={perfil?.quem_decide} />
          <Campo nome="Melhor contato" valor={perfil?.melhor_contato} />
          <Campo nome="O que mais pesa" valor={perfil?.o_que_pesa} />
          <Campo nome="Situação hoje" valor={rotuloDaSituacao(perfil?.situacao ?? null)} />
          <Campo nome="Situação antes" valor={anterior ? `${rotuloDaSituacao(anterior.situacao)}, até ${formatDateBR(toLocalISODate(new Date(anterior.ate)))}` : null} />
        </dl>
      </section>

      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Dores e propostas</h3>
          <span className="flex gap-2">
            {can('reports', 'export') && <Button variant="outline" size="sm" className="max-[860px]:hidden" onClick={() => exportarCliente(nome, data)}>Exportar este cliente</Button>}
            <Button size="sm" onClick={() => setNovaDor(true)}>Registrar dor</Button>
          </span>
        </div>
        {data.dores.length === 0
          ? <p className="text-[13px] text-muted-foreground">Nenhuma dor registrada. Depois de falar com o cliente, registre aqui o que ele contou.</p>
          : data.dores.map((d) => <CartaoDaDor key={d.id} dor={d} />)}
      </section>

      {perfilAberto && <DialogoDoPerfil codigo={codigo} perfil={perfil} onClose={() => setPerfilAberto(false)} />}
      {novaDor && <DialogoDaDor codigo={codigo} onClose={() => setNovaDor(false)} />}
    </div>
  );
}

function exportarCliente(nome: string, r: RaioXDoCliente) {
  const p = r.perfis[0];
  gerarRelatorioPdf({
    titulo: `Raio-X de ${nome}`,
    linhasDoCabecalho: [
      p ? [p.tipo_negocio, p.quem_decide, p.melhor_contato, p.o_que_pesa, rotuloDaSituacao(p.situacao)].filter(Boolean).join(' · ') : 'Perfil não preenchido',
      r.ultima_compra ? `Última compra em ${formatDateBR(r.ultima_compra)}` : 'Nenhuma compra registrada',
    ],
    colunas: [
      { titulo: 'Data', largura: 18 }, { titulo: 'Motivo', largura: 30 }, { titulo: 'O que contou', largura: 70 },
      { titulo: 'Situação', largura: 22 }, { titulo: 'Propostas', largura: 80 },
    ],
    linhas: r.dores.map((d) => [
      formatDateBR(d.registrada_em), rotuloDoMotivo(d), d.descricao ?? '', rotuloDoStatus(d.status),
      d.propostas.map((o) => `${o.proposta} (${rotuloDoResultado(o.resultado)})`).join('; '),
    ]),
    totais: [`${r.dores.length} dores`, '', '', '', ''],
    baixar: async () => null,
    nomeDoArquivo: `raio-x-${todayISO()}.pdf`,
  }).catch((e: unknown) => toast.error(mensagemDeErro(e)));
}

function Campo({ nome, valor }: { nome: string; valor?: string | null }) {
  return <div><dt className="text-[12px] text-muted-foreground">{nome}</dt><dd>{valor || '—'}</dd></div>;
}

function CartaoDaDor({ dor }: { dor: DorDoCliente }) {
  const { corrigir } = usePodeNoLancamento();
  const mudarDor = useMudarDor();
  const mudarProposta = useMudarProposta();
  const registrar = useRegistrarProposta();
  const [escrevendo, setEscrevendo] = useState(false);
  const [corrigindo, setCorrigindo] = useState(false);
  const [corrigindoProposta, setCorrigindoProposta] = useState<string | null>(null);
  const [textoCorrigido, setTextoCorrigido] = useState('');
  const [tipo, setTipo] = useState<TipoDeProposta>('campanha');
  const [texto, setTexto] = useState('');
  return (
    <article className={`rounded-lg border border-border border-l-4 p-3 space-y-2 ${COR_DA_DOR[dor.status]}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[14px] font-semibold">
          {rotuloDoMotivo(dor)} <span className="font-normal text-[12px] text-muted-foreground">· {formatDateBR(dor.registrada_em)}{dor.autor ? ` · ${dor.autor}` : ''}</span>
        </p>
        <Select value={dor.status} onValueChange={(v) => mudarDor.mutate({ id: dor.id, status: v as StatusDaDor })}>
          <SelectTrigger className="w-40 h-8" aria-label="Situação da dor"><SelectValue /></SelectTrigger>
          <SelectContent>{STATUS_DA_DOR.map((s) => <SelectItem key={s.valor} value={s.valor}>{s.rotulo}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      {dor.descricao && <p className="text-[14px]">{dor.descricao}</p>}
      {dor.propostas.map((p) => (
        <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/50 px-2 py-1.5 text-[13px]">
          <span>
            <strong>{rotuloDoTipoDeProposta(p.tipo)}:</strong> {p.proposta}{' '}
            <span className="text-[12px] text-muted-foreground">{formatDateBR(toLocalISODate(new Date(p.created_at)))}{p.autor ? ` · ${p.autor}` : ''}</span>
            {corrigir && <button type="button" className="ml-2 text-[12px] text-primary underline" onClick={() => { setTextoCorrigido(p.proposta); setCorrigindoProposta(p.id); }}>Corrigir</button>}
          </span>
          <Select value={p.resultado} onValueChange={(v) => mudarProposta.mutate({ id: p.id, resultado: v as ResultadoDaProposta })}>
            <SelectTrigger className="w-52 h-8" aria-label="Resultado da proposta"><SelectValue /></SelectTrigger>
            <SelectContent>{RESULTADOS_DA_PROPOSTA.map((r) => <SelectItem key={r.valor} value={r.valor}>{r.rotulo}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      ))}
      {escrevendo ? (
        <div className="grid gap-2 sm:grid-cols-[180px_1fr_auto]">
          <Select value={tipo} onValueChange={(v) => setTipo(v as TipoDeProposta)}>
            <SelectTrigger aria-label="Tipo de proposta"><SelectValue /></SelectTrigger>
            <SelectContent>{TIPOS_DE_PROPOSTA.map((t) => <SelectItem key={t.valor} value={t.valor}>{t.rotulo}</SelectItem>)}</SelectContent>
          </Select>
          <Input aria-label="O que foi proposto" placeholder="O que foi proposto?" value={texto} onChange={(e) => setTexto(e.target.value)} />
          <Button size="sm" disabled={!texto.trim() || registrar.isPending}
            onClick={() => registrar.mutate({ dor_id: dor.id, tipo, proposta: texto.trim() }, { onSuccess: () => { setTexto(''); setEscrevendo(false); } })}>Salvar</Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" size="sm" onClick={() => setEscrevendo(true)}>Registrar proposta</Button>
          {corrigir && <Button variant="ghost" size="sm" onClick={() => setCorrigindo(true)}>Corrigir</Button>}
        </div>
      )}
      {corrigindoProposta && (
        <Dialog open onOpenChange={(v) => { if (!v) setCorrigindoProposta(null); }}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Corrigir proposta</DialogTitle></DialogHeader>
            <Textarea aria-label="Proposta" rows={3} value={textoCorrigido} onChange={(e) => setTextoCorrigido(e.target.value)} />
            <DialogFooter>
              <Button variant="outline" onClick={() => setCorrigindoProposta(null)}>Cancelar</Button>
              <Button disabled={!textoCorrigido.trim() || mudarProposta.isPending}
                onClick={() => mudarProposta.mutate({ id: corrigindoProposta, proposta: textoCorrigido.trim() }, { onSuccess: () => setCorrigindoProposta(null) })}>Salvar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      {corrigindo && <DialogoDaDor dor={dor} onClose={() => setCorrigindo(false)} />}
    </article>
  );
}

function CamposDaDor({ motivo, outros, descricao, onMotivo, onOutros, onDescricao }: {
  motivo: Motivo | null; outros: string; descricao: string;
  onMotivo: (m: Motivo) => void; onOutros: (t: string) => void; onDescricao: (t: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {MOTIVOS.map((o) => <Opcao key={o.valor} cor="danger" ativa={motivo === o.valor} onClick={() => onMotivo(o.valor)}>{o.rotulo}</Opcao>)}
      </div>
      {motivo === 'outros' && <Input aria-label="Qual é o motivo" placeholder="Qual é o motivo?" value={outros} onChange={(e) => onOutros(e.target.value)} />}
      <div className="space-y-1.5">
        <Label htmlFor="dor-descricao">O que o cliente contou</Label>
        <Textarea id="dor-descricao" rows={3} value={descricao} onChange={(e) => onDescricao(e.target.value)} />
      </div>
    </div>
  );
}

/** Com `dor`, corrige (só o gestor chega aqui); sem ela, registra uma nova. */
function DialogoDaDor({ codigo, dor, onClose }: { codigo?: string; dor?: DorDoCliente; onClose: () => void }) {
  const registrar = useRegistrarDor(codigo ?? '');
  const mudar = useMudarDor();
  const [motivo, setMotivo] = useState<Motivo | null>(dor?.motivo ?? null);
  const [outros, setOutros] = useState(dor?.motivo_outros ?? '');
  const [descricao, setDescricao] = useState(dor?.descricao ?? '');
  const invalido = !motivo || (motivo === 'outros' && !outros.trim());
  const salvar = () => {
    const campos = { motivo: motivo!, motivo_outros: motivo === 'outros' ? outros.trim() : null, descricao: descricao.trim() || null };
    if (dor) mudar.mutate({ id: dor.id, ...campos }, { onSuccess: onClose });
    else registrar.mutate(campos, { onSuccess: onClose });
  };
  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{dor ? 'Corrigir dor' : 'Registrar dor'}</DialogTitle></DialogHeader>
        <CamposDaDor motivo={motivo} outros={outros} descricao={descricao} onMotivo={setMotivo} onOutros={setOutros} onDescricao={setDescricao} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={invalido || registrar.isPending || mudar.isPending} onClick={salvar}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Uma lista curta com "Outros" para escrever. O que foi escrito antes volta no campo de texto. */
function ListaComOutros({ id, rotulo, opcoes, valor, onChange }: {
  id: string; rotulo: string; opcoes: string[]; valor: string; onChange: (v: string) => void;
}) {
  const [escrevendo, setEscrevendo] = useState(!!valor && !opcoes.includes(valor));
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{rotulo}</Label>
      <Select value={escrevendo ? 'Outros' : valor} onValueChange={(v) => { setEscrevendo(v === 'Outros'); onChange(v === 'Outros' ? '' : v); }}>
        <SelectTrigger id={id}><SelectValue placeholder="Escolha" /></SelectTrigger>
        <SelectContent>{opcoes.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
      </Select>
      {escrevendo && <Input aria-label={`${rotulo}: escreva`} placeholder="Escreva" value={valor} onChange={(e) => onChange(e.target.value)} />}
    </div>
  );
}

function DialogoDoPerfil({ codigo, perfil, onClose }: { codigo: string; perfil?: PerfilDoCliente; onClose: () => void }) {
  const salvar = useSalvarPerfil(codigo);
  const [tipo, setTipo] = useState(perfil?.tipo_negocio ?? '');
  const [decide, setDecide] = useState(perfil?.quem_decide ?? '');
  const [contato, setContato] = useState(perfil?.melhor_contato ?? '');
  const [pesa, setPesa] = useState(perfil?.o_que_pesa ?? '');
  const [situacao, setSituacao] = useState<Situacao | null>(perfil?.situacao ?? null);
  const dados: PerfilEmEdicao = {
    tipo_negocio: tipo.trim() || null, quem_decide: decide.trim() || null, melhor_contato: contato.trim() || null,
    o_que_pesa: pesa.trim() || null, situacao,
  };
  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Perfil do cliente</DialogTitle></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <ListaComOutros id="perfil-tipo" rotulo="Tipo de negócio" opcoes={TIPOS_DE_NEGOCIO} valor={tipo} onChange={setTipo} />
          <ListaComOutros id="perfil-pesa" rotulo="O que mais pesa" opcoes={O_QUE_PESA} valor={pesa} onChange={setPesa} />
          <div className="space-y-1.5">
            <Label htmlFor="perfil-decide">Quem decide</Label>
            <Input id="perfil-decide" placeholder="Nome e função" value={decide} onChange={(e) => setDecide(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="perfil-contato">Melhor contato</Label>
            <Input id="perfil-contato" placeholder="Canal e horário" value={contato} onChange={(e) => setContato(e.target.value)} />
          </div>
        </div>
        <div className="space-y-1.5">
          <p className="text-[14px] font-medium">Situação hoje</p>
          <div className="flex flex-wrap gap-2">
            {SITUACOES.map((s) => <Opcao key={s.valor} ativa={situacao === s.valor} onClick={() => setSituacao(s.valor)}>{s.rotulo}</Opcao>)}
          </div>
        </div>
        <p className="text-[13px] text-muted-foreground">O perfil anterior continua guardado no histórico.</p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={salvar.isPending} onClick={() => salvar.mutate(dados, { onSuccess: onClose })}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
