// Motivos e dores (Raio-X do Cliente, dono, 2026-11-05): por que os clientes não estão comprando, o que foi proposto e o
// que funcionou, para a reunião com o gestor e a diretoria. Cada linha é uma dor; os clientes a recuperar vêm da leitura
// da Carteira, sem conta nova.
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileDown, SearchCheck } from 'lucide-react';
import { toast } from 'sonner';
import { ModeloDeRelatorio, type ColunaDoRelatorio } from '@/components/relatorios/ModeloDeRelatorio';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCarteiras } from '@/hooks/useComercialCarteirasMetas';
import { useMinhasCarteiras } from '@/hooks/useComercialLancamentos';
import { usePodeGerirCarteiras } from '@/hooks/useAccessProfiles';
import { useAcompanhamentoDasCarteiras, useDoresEmAberto, useRelatorioRaioX } from '@/hooks/useRaioX';
import { useTenantPath } from '@/hooks/useTenantPath';
import { useQueryState } from '@/hooks/useQueryState';
import { useDepartmentPermissions } from '@/hooks/useAccessProfiles';
import { casaBusca } from '@/lib/tabela';
import { linkRaioX } from '@/config/comercial-insights';
import { competenciaAtual } from '@/lib/competencia-comercial';
import { todayISO } from '@/lib/dates';
import { gerarRelatorioPdf } from '@/lib/relatorio-pdf';
import {
  STATUS_DA_DOR, alertaDoCliente, descreverPerfil, descreverPropostas, rotuloDoMotivo, rotuloDoStatus, somarMotivos, somarPropostas,
  type LinhaDoRelatorio,
} from '@/lib/raio-x';
import { formatBRL, formatDateBR } from '@/types/financeiro';

const TODAS = 'todas';
const MOSTRA = 20;

export default function MotivosEDores() {
  const tenantPath = useTenantPath();
  const [carteira, setCarteira] = useState(TODAS);
  // As datas ficam no endereço (revisão de 2026-11-12): recarregar ou mandar o link não perde o recorte.
  const [de, setDe] = useQueryState<string>('de', '');
  const [ate, setAte] = useQueryState<string>('ate', '');
  const podeTudo = usePodeGerirCarteiras();
  const { data: conhecidas = [] } = useCarteiras();
  const { data: minhas = [] } = useMinhasCarteiras();
  const opcoes = podeTudo ? conhecidas : minhas;
  const filtro = carteira === TODAS ? '' : carteira;
  const { data: todas = [], isLoading, error } = useRelatorioRaioX(de, ate, filtro);
  const [autor, setAutor] = useState(TODAS);
  const [busca, setBusca] = useQueryState<string>('q', '');
  const { can } = useDepartmentPermissions('comercial');
  const podeExportar = can('reports', 'export');
  const autores = [...new Set(todas.map((l) => l.autor).filter((a): a is string => !!a))].sort();
  const data = autor === TODAS ? todas : todas.filter((l) => l.autor === autor);
  const { data: abertas = [] } = useDoresEmAberto();
  const consultas = useAcompanhamentoDasCarteiras(filtro ? [filtro] : opcoes, competenciaAtual());

  const recuperar = useMemo(() => consultas.flatMap((c) => c.data ?? [])
    .map((l) => ({ ...l, alerta: alertaDoCliente(l), dor: abertas.find((d) => l.codigos.includes(d.cliente_codigo)) }))
    .filter((l) => l.alerta)
    .sort((a, b) => b.media_12m - a.media_12m), [consultas, abertas]);
  const comMotivo = recuperar.filter((l) => l.dor).length;
  const motivos = somarMotivos(data);
  const maior = Math.max(1, ...motivos.map((m) => m.compravam));
  const propostas = somarPropostas(data);
  const aguardando = data.flatMap((l) => l.propostas).filter((p) => p.resultado === 'aguardando').length;
  const voltaram = new Set(data.filter((l) => l.voltou_em).map((l) => l.cliente)).size;

  const colunas: ColunaDoRelatorio<LinhaDoRelatorio>[] = [
    { chave: 'cliente', rotulo: 'Cliente', valor: (l) => l.cliente,
      mostrar: (l) => <Link to={tenantPath(linkRaioX(l.cliente_codigo))} className="text-primary underline">{l.cliente}</Link> },
    { chave: 'carteira', rotulo: 'Carteira', valor: (l) => l.carteira },
    { chave: 'perfil', rotulo: 'Perfil', valor: (l) => descreverPerfil(l.perfil) },
    { chave: 'motivo', rotulo: 'Motivo', valor: (l) => rotuloDoMotivo(l) },
    { chave: 'dor', rotulo: 'O que o cliente contou', valor: (l) => l.descricao },
    { chave: 'status', rotulo: 'Situação', valor: (l) => rotuloDoStatus(l.status),
      mostrar: (l) => <span className={`rounded px-1.5 ${STATUS_DA_DOR.find((s) => s.valor === l.status)?.classe}`}>{rotuloDoStatus(l.status)}</span> },
    { chave: 'propostas', rotulo: 'Propostas', valor: descreverPropostas },
    { chave: 'data', rotulo: 'Registrada em', valor: (l) => l.registrada_em, mostrar: (l) => formatDateBR(l.registrada_em) },
    { chave: 'autor', rotulo: 'Quem registrou', valor: (l) => l.autor },
    { chave: 'compravam', rotulo: 'Compravam', valor: (l) => l.compravam, mostrar: (l) => formatBRL(l.compravam), direita: true },
    { chave: 'voltou', rotulo: 'Voltou a comprar', valor: (l) => l.voltou_em, mostrar: (l) => (l.voltou_em ? formatDateBR(l.voltou_em) : '—') },
  ];

  const paraExportar = data.filter((l) => casaBusca(colunas.map((c) => c.valor(l)), busca));
  const exportarPdf = async () => {
    try {
      await gerarRelatorioPdf({
        titulo: 'Motivos e dores',
        linhasDoCabecalho: [`${filtro || 'Todas as carteiras'} · ${de || ate ? `${de ? formatDateBR(de) : 'início'} a ${ate ? formatDateBR(ate) : 'hoje'}` : 'todo o histórico'}`],
        colunas: [
          { titulo: 'Cliente', largura: 34 }, { titulo: 'Perfil', largura: 34 }, { titulo: 'Motivo', largura: 20 }, { titulo: 'O que contou', largura: 44 },
          { titulo: 'Situação', largura: 17 }, { titulo: 'Propostas', largura: 44 }, { titulo: 'Compravam', largura: 20, direita: true },
        ],
        linhas: paraExportar.map((l) => [l.cliente, descreverPerfil(l.perfil), rotuloDoMotivo(l), l.descricao ?? '', rotuloDoStatus(l.status), descreverPropostas(l), formatBRL(l.compravam)]),
        totais: [`${paraExportar.length} dores`, '', '', '', '', '', ''],
        baixar: async () => null,
        nomeDoArquivo: `motivos-e-dores-${todayISO()}.pdf`,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não gerou o PDF.');
    }
  };

  return (
    <ModeloDeRelatorio titulo="Motivos e dores" icone={SearchCheck} arquivo="motivos-e-dores"
      descricao="Por que os clientes não estão comprando, o que foi proposto e o que funcionou." exportavel={podeExportar}
      linhas={data} colunas={colunas} chave={(l) => l.dor_id} carregando={isLoading} erro={error}
      vazio="Nenhuma dor registrada neste recorte."
      controles={(
        <>
          <Select value={carteira} onValueChange={setCarteira}>
            <SelectTrigger className="w-52" aria-label="Carteira"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={TODAS}>{podeTudo ? 'Todas as carteiras' : 'Minhas carteiras'}</SelectItem>
              {opcoes.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={autor} onValueChange={setAutor}>
            <SelectTrigger className="w-52" aria-label="Quem registrou"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={TODAS}>Todos os vendedores</SelectItem>
              {autores.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input type="date" className="w-40" aria-label="De" value={de} onChange={(e) => setDe(e.target.value)} />
          <Input type="date" className="w-40" aria-label="Até" value={ate} onChange={(e) => setAte(e.target.value)} />
          {podeExportar && (
            <Button variant="outline" size="sm" className="max-[860px]:hidden" disabled={paraExportar.length === 0} onClick={exportarPdf}>
              <FileDown className="w-4 h-4 mr-1.5" aria-hidden="true" />PDF
            </Button>
          )}
        </>
      )}
      resumo={[
        { rotulo: 'Clientes para recuperar', valor: recuperar.length, formatar: String, nota: 'Parados ou comprando menos' },
        { rotulo: 'Com motivo conhecido', valor: comMotivo, formatar: (n) => `${n} de ${recuperar.length}`, ruim: comMotivo < recuperar.length },
        { rotulo: 'Propostas aguardando', valor: aguardando, formatar: String },
        { rotulo: 'Voltaram a comprar', valor: voltaram, formatar: String, nota: 'Compraram depois da dor registrada' },
      ]}
      acima={(
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-lg border border-border p-3 space-y-2">
            <h2 className="text-sm font-semibold">Por que não estão comprando</h2>
            {motivos.length === 0 ? <p className="text-[13px] text-muted-foreground">Os motivos aparecem aqui conforme a equipe registra.</p> : motivos.map((m) => (
              <button key={m.rotulo} type="button" title="Ver estes clientes na lista" onClick={() => setBusca(busca === m.rotulo ? '' : m.rotulo)}
                className="w-full text-left grid grid-cols-[120px_1fr_auto] items-center gap-2 text-[13px] hover:bg-muted/50 rounded">
                <span className={busca === m.rotulo ? 'font-semibold' : undefined}>{m.rotulo}</span>
                <span className="h-3 rounded bg-muted overflow-hidden"><span className="block h-full bg-status-danger" style={{ width: `${(m.compravam / maior) * 100}%` }} /></span>
                <span className="tabular-nums">{m.clientes} · {formatBRL(m.compravam)}</span>
              </button>
            ))}
            {propostas.length > 0 && (
              <table className="w-full text-[13px] mt-2">
                <thead><tr className="text-left text-muted-foreground"><th className="font-medium">O que funcionou</th><th className="font-medium text-right">Oferecidas</th><th className="font-medium text-right">Funcionaram</th><th className="font-medium text-right">Taxa</th></tr></thead>
                <tbody>
                  {propostas.map((p) => (
                    <tr key={p.rotulo} className="border-t border-border">
                      <td className="py-1">{p.rotulo}</td><td className="text-right">{p.oferecidas}</td><td className="text-right">{p.funcionaram}</td>
                      <td className="text-right">{p.taxa === null ? '—' : `${Math.round(p.taxa * 100)}%`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
          <section className="rounded-lg border border-border p-3 space-y-2">
            {/* É a situação de HOJE (parado ou comprando menos agora), não o período escolhido: o título diz. */}
            <h2 className="text-sm font-semibold">Quem ligar primeiro <span className="font-normal text-muted-foreground">· situação de hoje, maiores compradores primeiro</span></h2>
            {recuperar.length === 0 ? <p className="text-[13px] text-muted-foreground">Nenhum cliente parado ou comprando menos.</p> : (
              <ul className="divide-y divide-border">
                {recuperar.slice(0, MOSTRA).map((l) => (
                  <li key={l.grupo_chave} className="py-1.5 text-[13px] flex flex-wrap justify-between gap-x-3">
                    <Link to={tenantPath(linkRaioX(l.codigos[0]))} className="text-primary underline">{l.grupo_nome}</Link>
                    <span className={l.dor ? '' : 'text-status-danger'}>
                      {l.alerta === 'parado' ? 'Parado' : 'Em queda'} · {formatBRL(l.media_12m)}/mês · {l.dor ? rotuloDoMotivo(l.dor) : 'sem motivo'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {recuperar.length > MOSTRA && <p className="text-[12px] text-muted-foreground">Mostrando os {MOSTRA} maiores de {recuperar.length}. O restante está na Carteira.</p>}
          </section>
        </div>
      )} />
  );
}
