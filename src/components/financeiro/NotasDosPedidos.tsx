// A nota de cada pedido (dono, 2026-11-11; migration 20270212721100). Série 1 emite NF-e: o Financeiro sobe o XML e o PDF
// assim que emite, e o banco confere tipo × CFOP, série e cliente na hora, ainda dentro das 24 h para cancelar. Séries 75 e
// 76 não emitem nota: o Financeiro faz a conferência guiada. A vendedora não digita mais nada: vê a nota, baixa o PDF e
// acompanha a saída. Sem todos os pedidos conferidos, o Financeiro não finaliza.
import { useRef, useState } from 'react';
import { AlertTriangle, FileText, Truck, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { lerValor } from '@/lib/checklist-de-pedidos';
import { todayISO } from '@/lib/dates';
import { formatBRL, formatDateBR } from '@/types/financeiro';
import {
  ROTULO_DA_SAIDA, abrirArquivoDaNota, useInformarNota, useRegistrarNotaXml, useSaidaDoChecklist, useSituacaoDasNotas,
  type NotaDoPedido, type PedidoGravado, type SituacaoDaNota,
} from '@/hooks/usePedidosChecklist';

const SELO: Record<SituacaoDaNota, { rotulo: string; classe: string }> = {
  sem_nota: { rotulo: 'Falta a nota', classe: 'badge-warning' },
  conferida: { rotulo: 'Conferida', classe: 'badge-success' },
  divergente: { rotulo: 'Nota errada', classe: 'badge-danger' },
  ok: { rotulo: 'Confirmada no Forteplus', classe: 'badge-success' },
};

export function NotasDosPedidos({ checklistId, pedidos, podeEditar }: {
  checklistId: string; pedidos: PedidoGravado[]; podeEditar: boolean;
}) {
  const { data: situacoes = [] } = useSituacaoDasNotas(checklistId);
  const { data: saida } = useSaidaDoChecklist(checklistId);
  const comSerie = pedidos.filter((p) => p.serie);
  if (comSerie.length === 0) return null;

  return (
    <div className="rounded-lg border border-border p-3 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[14px] font-semibold">Notas dos pedidos</p>
        {saida?.expedicao_situacao && (
          <Badge variant="outline" className="text-[12px] badge-info gap-1">
            <Truck className="w-3.5 h-3.5" aria-hidden="true" />
            {ROTULO_DA_SAIDA[saida.expedicao_situacao]}
            {saida.expedicao_transportadora ? ` · ${saida.expedicao_transportadora}` : ''}
            {saida.expedicao_rastreio ? ` · rastreio ${saida.expedicao_rastreio}` : ''}
          </Badge>
        )}
      </div>
      <p className="text-[12px] text-muted-foreground">
        {podeEditar
          ? 'Série 1: suba o XML e o PDF assim que emitir. O sistema confere na hora e preenche nº, valor e data. Séries 75 e 76 não têm nota fiscal: faça a conferência guiada. Sem tudo conferido, o checklist não finaliza.'
          : 'O Financeiro sobe a nota de cada pedido. Quando ela chega, você é avisada e pode baixar o PDF aqui.'}
      </p>
      <ul className="divide-y divide-border">
        {comSerie.map((p) => (
          <PedidoComNota key={p.id} pedido={p} checklistId={checklistId} podeEditar={podeEditar}
            situacao={situacoes.find((x) => x.pedido_id === p.id)} />
        ))}
      </ul>
    </div>
  );
}

function PedidoComNota({ pedido: p, checklistId, podeEditar, situacao: s }: {
  pedido: PedidoGravado; checklistId: string; podeEditar: boolean; situacao: NotaDoPedido | undefined;
}) {
  const semNotaFiscal = p.serie !== '1';
  const selo = s && (s.situacao === 'sem_nota' && semNotaFiscal ? { rotulo: 'Falta conferir', classe: 'badge-warning' } : SELO[s.situacao]);
  return (
    <li className="py-2 space-y-1.5">
      <div className="flex flex-wrap items-center gap-2 text-[13px]">
        <span className="font-medium">Pedido {p.ordem}</span>
        <span className="text-muted-foreground">{p.tipo} · série {p.serie} · {p.filial} · nº {p.numero} · {formatBRL(Number(p.valor))}</span>
        {selo && <Badge variant="outline" className={`text-[12px] ${selo.classe}`}>{selo.rotulo}</Badge>}
      </div>
      {p.nota_fiscal && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
          <span>
            {semNotaFiscal ? 'Documento' : 'Nota'} <span className="font-mono">{p.nota_fiscal}</span>
            {p.nota_cfops?.length ? <> · CFOP <span className="font-mono">{p.nota_cfops.join('/')}</span></> : null}
            {p.nota_valor !== null && <> · {formatBRL(Number(p.nota_valor))}</>}
            {p.nota_em && <> · {formatDateBR(p.nota_em)}</>}
            {p.nota_transportadora && <span className="text-muted-foreground"> · {p.nota_transportadora}</span>}
          </span>
          {p.nota_pdf_path && (
            <Button size="sm" variant="outline" className="h-7" onClick={() => abrirArquivoDaNota(p.nota_pdf_path!)}>
              <FileText className="w-3.5 h-3.5 mr-1" aria-hidden="true" /> Baixar PDF
            </Button>
          )}
          {p.nota_xml_path && (
            <Button size="sm" variant="ghost" className="h-7" onClick={() => abrirArquivoDaNota(p.nota_xml_path!)}>XML</Button>
          )}
        </div>
      )}
      {s?.situacao === 'divergente' && (
        <p className="text-[13px] text-status-danger flex gap-1.5"><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />{s.mensagem}</p>
      )}
      {s?.aviso && <p className="text-[12px] text-status-warning">{s.aviso}</p>}
      {podeEditar && s?.situacao !== 'ok' && (
        semNotaFiscal
          ? s?.situacao === 'sem_nota' && <ConferenciaGuiada pedido={p} />
          : <SubirNota checklistId={checklistId} temNota={!!p.nota_fiscal} />
      )}
    </li>
  );
}

/** Um seletor só: o Financeiro escolhe o XML e o PDF juntos. O banco acha o pedido certo pelo XML. */
function SubirNota({ checklistId, temNota }: { checklistId: string; temNota: boolean }) {
  const registrar = useRegistrarNotaXml();
  const entrada = useRef<HTMLInputElement>(null);
  const escolher = (arquivos: FileList | null) => {
    const lista = Array.from(arquivos ?? []);
    const xml = lista.find((a) => /\.xml$/i.test(a.name));
    const pdf = lista.find((a) => /\.pdf$/i.test(a.name));
    if (entrada.current) entrada.current.value = '';
    if (!xml || !pdf || lista.length !== 2) {
      toast.error('Escolha os dois arquivos da nota juntos: o XML e o PDF (DANFE).');
      return;
    }
    registrar.mutate({ checklistId, xml, pdf });
  };
  return (
    <div>
      <input ref={entrada} type="file" accept=".xml,.pdf,application/xml,text/xml,application/pdf" multiple className="sr-only"
        aria-label="XML e PDF da nota" onChange={(e) => escolher(e.target.files)} />
      <Button size="sm" variant={temNota ? 'outline' : 'default'} className="h-8" disabled={registrar.isPending}
        onClick={() => entrada.current?.click()}>
        <Upload className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />
        {registrar.isPending ? 'Conferindo a nota…' : temNota ? 'Trocar pela nota corrigida' : 'Subir XML e PDF'}
      </Button>
    </div>
  );
}

/** Séries 75 e 76: não há nota fiscal. O Financeiro confere no Forteplus os três pontos e informa o nº do documento. */
function ConferenciaGuiada({ pedido: p }: { pedido: PedidoGravado }) {
  const informar = useInformarNota();
  const venda = p.tipo === 'Venda';
  const [documento, setDocumento] = useState('');
  const [valor, setValor] = useState(String(p.valor).replace('.', ','));
  const [emissao, setEmissao] = useState(todayISO());
  const [marcados, setMarcados] = useState<boolean[]>([false, false, false]);
  const pontos = [
    `Série ${p.serie} no Forteplus (${p.tipo === 'Cashback' ? 'cashback' : p.tipo === 'Bonificação' ? 'bonificação' : 'venda sem nota'})`,
    venda ? 'Natureza de venda' : 'Natureza de remessa (5910 ou 6910), nunca de venda',
    `Cliente e valor iguais aos do checklist (${formatBRL(Number(p.valor))})`,
  ];
  const valorNumero = lerValor(valor);
  const pronto = marcados.every(Boolean) && !!documento.trim() && (!venda || (!!valorNumero && !!emissao && emissao <= todayISO()));
  return (
    <div className="rounded-md border border-status-warning/50 bg-status-warning/5 p-2.5 space-y-2">
      <p className="text-[13px] font-semibold">Conferência no Forteplus</p>
      <p className="text-[12px] flex gap-1.5">
        <AlertTriangle className="w-4 h-4 shrink-0 text-status-warning" aria-hidden="true" />
        Confira com cuidado: se estiver errado, a venda e o cashback da vendedora saem errados nos indicadores. A importação do
        Forteplus confere de novo e avisa o Financeiro se achar erro.
      </p>
      <div className="space-y-1">
        {pontos.map((ponto, i) => (
          <label key={ponto} className="flex items-center gap-2 text-[13px] cursor-pointer">
            <Checkbox checked={marcados[i]} onCheckedChange={(v) => setMarcados((m) => m.map((x, j) => (j === i ? v === true : x)))} />
            {ponto}
          </label>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Input className="h-8 w-36 font-mono" inputMode="numeric" placeholder="Nº do documento" aria-label={`Nº do documento do pedido ${p.ordem}`}
          value={documento} onChange={(e) => setDocumento(e.target.value)} />
        {venda && (
          <>
            <Input className="h-8 w-32 font-mono" inputMode="decimal" aria-label={`Valor do pedido ${p.ordem}`}
              value={valor} onChange={(e) => setValor(e.target.value)} />
            <Input className="h-8 w-40" type="date" max={todayISO()} aria-label={`Data do documento do pedido ${p.ordem}`}
              value={emissao} onChange={(e) => setEmissao(e.target.value)} />
          </>
        )}
        <Button size="sm" className="h-8" disabled={!pronto || informar.isPending}
          onClick={() => informar.mutate({ pedidoId: p.id, nota: documento, valor: venda ? valorNumero : null, emissao: venda ? emissao : null })}>
          Confirmar conferência
        </Button>
      </div>
    </div>
  );
}
