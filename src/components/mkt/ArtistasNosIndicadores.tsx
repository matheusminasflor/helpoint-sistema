// Os blocos novos dos Indicadores do Marketing (dono, 2026-11-03; projeto aprovado, versão 2):
//   · Artistas na Visão Geral, pelas semanas do mês dos artistas, como na planilha (dono: "fechamos o mês dos artistas
//     sempre dia 31"; `lib/semanas-dos-artistas`): o que entrou na semana, o acumulado do mês até ela, a bonificação em
//     andamento, o anterior e o comparativo;
//   · Artistas mês a mês no Analítico: a parte do teto paga em cada mês;
//   · o cartão que espera as chaves do Kommo, da Meta e do Bling (dono: "esperar as chaves").
import { Link } from 'react-router-dom';
import { CalendarRange, ChevronLeft, ChevronRight, PlugZap, Star } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DicaDoGrafico } from '@/components/dashboard/DicaDoGrafico';
import { COR, EIXO } from '@/config/cores-dos-graficos';
import { useTenantPath } from '@/hooks/useTenantPath';
import type { LigacaoMeta } from '@/hooks/useLigacaoMeta';
import { MetaConnectButton } from '@/components/mkt/MetaConnectButton';
import { formatBRL } from '@/lib/crm';
import { cn } from '@/lib/utils';
import { STATUS_DO_ARTISTA, mesEAno, nomeDoMes, type MesDosArtistas } from '@/lib/artistas-nos-indicadores';
import {
  mesAnterior, periodosDoRecorte, rotuloDoRecorte, type ArtistaNoRecorte, type Contagem, type Recorte, type SemanaDoMes,
} from '@/lib/semanas-dos-artistas';

const pct = (n: number) => `${Math.round(n * 100)}%`;
const n = (v: number) => (v ? String(v) : '—');
const ddmm = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
const proximoMes = (mes: string) => {
  const d = new Date(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
};
const SEMANAS: { s: SemanaDoMes; rotulo: string }[] = [
  { s: 1, rotulo: 'S1' }, { s: 2, rotulo: 'S2' }, { s: 3, rotulo: 'S3' }, { s: 4, rotulo: 'S4' }, { s: 0, rotulo: 'Mês inteiro' },
];
const SETA = { acima: { s: '▲', classe: 'text-status-success', texto: 'acima' }, abaixo: { s: '▼', classe: 'text-status-danger', texto: 'abaixo' }, igual: { s: '=', classe: 'text-muted-foreground', texto: 'igual' } };

function Numero({ v, rotulo }: { v: string | number; rotulo: string }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="text-xl sm:text-2xl font-bold font-mono text-foreground tabular-nums whitespace-nowrap">{v}</div>
      <div className="text-[12px] uppercase tracking-wider text-muted-foreground">{rotulo}</div>
    </div>
  );
}

export function ArtistasDoMes({ recorte, onRecorte, linhas, total, hoje }: {
  recorte: Recorte;
  onRecorte: (r: Recorte) => void;
  linhas: ArtistaNoRecorte[];
  total: { semana: Contagem; mes: Contagem; valor: number; anterior: number | null; teto: number };
  hoje: string;
}) {
  const tenantPath = useTenantPath();
  const p = periodosDoRecorte(recorte);
  const { titulo, situacao } = rotuloDoRecorte(recorte, hoje);
  const comSemana = recorte.semana !== 0;
  const rotuloAnterior = recorte.semana >= 2 ? `Até a S${recorte.semana - 1}` : `${nomeDoMes(mesAnterior(recorte.mes))[0].toUpperCase()}${nomeDoMes(mesAnterior(recorte.mes)).slice(1)}`;
  const th = 'px-3 py-2 font-semibold text-right whitespace-nowrap';
  const td = 'px-3 py-2 text-right font-mono tabular-nums';
  const contagem = (c: Contagem) => <><td className={td}>{n(c.stories)}</td><td className={td}>{n(c.reels)}</td><td className={cn(td, 'border-r border-border')}>{n(c.feed)}</td></>;
  const destaque = comSemana ? total.semana : total.mes;
  return (
    <Card id="artistas-do-marketing" className="p-5 space-y-4 scroll-mt-20">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold flex flex-wrap items-center gap-2">
          <Star className="h-4 w-4 text-primary" aria-hidden="true" />Artistas · {titulo}
          <Badge className={situacao === 'em andamento' ? 'badge-warning' : 'badge-neutral'}>{situacao}</Badge>
        </h3>
        <Link to={tenantPath(`/mkt/artistas?mes=${recorte.mes.slice(0, 7)}`)} className="text-xs text-primary hover:underline">Abrir Artistas →</Link>
      </div>
      {/* As semanas do mês dos artistas, como na planilha: o período da tela escolhe sozinho; aqui se troca. */}
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Semana do mês dos artistas">
        <Button size="icon" variant="outline" className="h-8 w-8" aria-label="Mês anterior" onClick={() => onRecorte({ ...recorte, mes: mesAnterior(recorte.mes) })}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-semibold min-w-[110px] text-center">{mesEAno(recorte.mes)}</span>
        <Button size="icon" variant="outline" className="h-8 w-8" aria-label="Próximo mês" disabled={proximoMes(recorte.mes) > hoje}
          onClick={() => onRecorte({ ...recorte, mes: proximoMes(recorte.mes) })}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        {SEMANAS.map(({ s, rotulo }) => (
          <Button key={s} size="sm" variant={recorte.semana === s ? 'default' : 'outline'} className="h-8"
            aria-pressed={recorte.semana === s} onClick={() => onRecorte({ ...recorte, semana: s })}>{rotulo}</Button>
        ))}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
        <Numero v={destaque.stories} rotulo={comSemana ? 'Stories na semana' : 'Stories no mês'} />
        <Numero v={destaque.reels} rotulo={comSemana ? 'Reels na semana' : 'Reels no mês'} />
        <Numero v={destaque.feed} rotulo={comSemana ? 'Feed na semana' : 'Feed no mês'} />
        <Numero v={destaque.pecas} rotulo={`Peças · ${destaque.naCampanha} na campanha`} />
        <Numero v={formatBRL(total.valor)} rotulo={comSemana && situacao !== 'mês fechado' ? `Bonificação até ${ddmm(p.acumulado.ate)}` : `Bonificação de ${nomeDoMes(recorte.mes)}`} />
        <Numero v={total.teto ? pct(total.valor / total.teto) : '—'} rotulo={`do teto (${formatBRL(total.teto)})`} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[14px]">
          <thead>
            <tr className="text-muted-foreground text-[12px]">
              <th />
              {comSemana && <th colSpan={3} className="px-3 pt-2 font-semibold text-center border-r border-border">Na semana</th>}
              <th colSpan={3} className="px-3 pt-2 font-semibold text-center border-r border-border">No mês ({ddmm(p.acumulado.de)} a {ddmm(p.acumulado.ate)})</th>
              <th colSpan={5} />
            </tr>
            <tr className="border-b border-border bg-secondary/60 text-muted-foreground">
              <th className="px-3 py-2 font-semibold text-left">Artista</th>
              {comSemana && <><th className={th}>Stories</th><th className={th}>Reels</th><th className={cn(th, 'border-r border-border')}>Feed</th></>}
              <th className={th}>Stories</th><th className={th}>Reels</th><th className={cn(th, 'border-r border-border')}>Feed</th>
              <th className="px-3 py-2 font-semibold text-left">Reunião</th>
              <th className={th}>Bonificação</th>
              <th className={th}>{rotuloAnterior}</th>
              <th className="px-3 py-2 font-semibold text-left">Comparativo</th>
              <th className="px-3 py-2 font-semibold text-left">Situação</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.id} className="border-b border-border">
                <td className="px-3 py-2 font-medium whitespace-nowrap">{l.nome}</td>
                {comSemana && contagem(l.semana)}
                {contagem(l.mes)}
                <td className="px-3 py-2">{l.reuniao ? 'Presente' : 'Ausente'}</td>
                <td className={td}>{formatBRL(l.b.valor)}</td>
                <td className={cn(td, 'text-muted-foreground')}>{l.anterior === null ? '—' : formatBRL(l.anterior)}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {l.comparativo ? <span className={SETA[l.comparativo].classe}>{SETA[l.comparativo].s} {SETA[l.comparativo].texto}</span> : '—'}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <Badge className={STATUS_DO_ARTISTA[l.b.status].classe}>{STATUS_DO_ARTISTA[l.b.status].texto} · {pct(l.b.parteDoTeto)}</Badge>
                </td>
              </tr>
            ))}
            <tr className="font-bold">
              <td className="px-3 py-2">Total</td>
              {comSemana && contagem(total.semana)}
              {contagem(total.mes)}
              <td />
              <td className={td}>{formatBRL(total.valor)}</td>
              <td className={cn(td, 'text-muted-foreground')}>{total.anterior === null ? '—' : formatBRL(total.anterior)}</td>
              <td colSpan={2} className="px-3 py-2 text-muted-foreground font-normal">{total.teto ? `${pct(total.valor / total.teto)} do teto` : ''}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        As semanas são as do mês dos artistas: S1 de 1 a 7, S2 de 8 a 14, S3 de 15 a 21, S4 de 22 ao último dia, quando o mês
        fecha. A bonificação é a do mês até o fim da semana escolhida e se compara com {p.comparaCom}. Um terço pelos stories,
        um pelos reels e posts, um pela reunião; peça na campanha vale inteira, aprovada fora dela vale metade.
      </p>
    </Card>
  );
}

export function ArtistasMesAMes({ meses }: { meses: MesDosArtistas[] }) {
  const dados = meses.map((m) => ({ ...m, rotulo: nomeDoMes(m.mes).slice(0, 3), parte: Math.round(m.parteDoTeto * 100) }));
  return (
    <Card id="analitico-artistas" className="p-5 space-y-3 scroll-mt-20">
      <h3 className="text-sm font-semibold flex items-center gap-2"><CalendarRange className="h-4 w-4 text-primary" aria-hidden="true" />Artistas mês a mês<span className="text-xs font-normal text-muted-foreground">· últimos 12 meses, não segue o período</span></h3>
      {dados.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma entrega lançada.</p> : (
        <>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={dados} margin={{ top: 18 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={COR.grade} vertical={false} />
              <XAxis dataKey="rotulo" tick={EIXO} />
              <YAxis tick={EIXO} width={36} domain={[0, 100]} unit="%" />
              <Tooltip content={<DicaDoGrafico />} />
              <Bar dataKey="parte" name="Parte do teto paga (%)" fill={COR.azul} radius={[4, 4, 0, 0]}>
                <LabelList dataKey="parte" position="top" formatter={(v: number) => `${v}%`} className="fill-foreground text-xs" />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="overflow-x-auto">
            <table className="w-full text-[14px]">
              <thead>
                <tr className="border-b border-border bg-secondary/60 text-muted-foreground">
                  <th className="px-3 py-2 font-semibold text-left">Mês</th>
                  <th className="px-3 py-2 font-semibold text-right">Peças</th>
                  <th className="px-3 py-2 font-semibold text-right">Na campanha</th>
                  <th className="px-3 py-2 font-semibold text-right">Bonificação</th>
                </tr>
              </thead>
              <tbody>
                {meses.map((m) => (
                  <tr key={m.mes} className="border-b border-border">
                    <td className="px-3 py-2">{mesEAno(m.mes)}</td>
                    <td className="px-3 py-2 text-right font-mono">{m.pecas}</td>
                    <td className="px-3 py-2 text-right font-mono">{m.naCampanha} <span className="text-muted-foreground">({m.pecas ? pct(m.naCampanha / m.pecas) : '—'})</span></td>
                    <td className="px-3 py-2 text-right font-mono whitespace-nowrap">{formatBRL(m.valor)} <span className="text-muted-foreground">de {formatBRL(m.teto)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Card>
  );
}

// Um cartão só enquanto as chaves não entram (revisão de UX de 2026-11-03): quatro blocos vazios no meio da Visão Geral
// empurravam os números reais para baixo. Cada fonte diz o que vai mostrar; ligada, vira o bloco dela.
const LIGACOES = [
  { fonte: 'Kommo', titulo: 'Leads que chegaram', texto: 'Consumidor final, Salão, Distribuidor e Sem triagem (funil Entrada)' },
  { fonte: 'Meta', titulo: 'Tráfego pago', texto: 'investimento, pessoas alcançadas, visitas ao perfil, custo por visita' },
  { fonte: 'Meta', titulo: 'Redes sociais', texto: '@minasflor, @by.mf e @mf.professional: posts, reels, stories, seguidores' },
  { fonte: 'Bling', titulo: 'Vendas', texto: 'faturado pelas notas fiscais' },
];

const NOME_DO_TIPO = { instagram: 'Instagram', pagina: 'Página', anuncios: 'Anúncios' } as const;

/**
 * As fontes de fora: o que ainda espera a ligação e, a Meta, o botão de conectar (2026-11-03: "o intuito é ter os
 * indicadores do MKT após conectar") — aqui, e não no Cronograma Social. Conectar é de gestor para cima (a função confere).
 */
export function EsperandoAsLigacoes({ meta, podeConectarMeta, onConectou }: {
  meta: LigacaoMeta | null | undefined;
  podeConectarMeta: boolean;
  onConectou: () => void;
}) {
  const esperando = LIGACOES.filter((l) => l.fonte !== 'Meta' || !meta);
  return (
    <Card className="p-5 space-y-3 border-dashed">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <PlugZap className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          {meta ? 'Esperando a ligação com o Kommo e o Bling' : 'Esperando a ligação com o Kommo, a Meta e o Bling'}
        </h3>
        {!meta && podeConectarMeta && <MetaConnectButton platform="indicadores" onSuccess={onConectou} />}
      </div>
      {meta && (
        <div className="rounded-lg border border-border bg-card p-3 text-sm space-y-1">
          <p>
            <span className="font-semibold">Meta conectada</span>
            <span className="text-muted-foreground"> em {new Date(meta.conectado_em).toLocaleDateString('pt-BR')}: </span>
            {meta.contas.map((c) => `${c.nome} (${NOME_DO_TIPO[c.tipo]})`).join(' · ')}
          </p>
          <p className="text-xs text-muted-foreground">
            {meta.ultimo_erro ? `A última busca dos números falhou: ${meta.ultimo_erro}`
              : 'Tráfego pago e redes sociais entram aqui a partir da primeira busca dos números.'}
          </p>
        </div>
      )}
      <ul className="grid gap-x-6 gap-y-2 sm:grid-cols-2 text-sm">
        {esperando.map((l) => (
          <li key={l.titulo}>
            <span className="font-semibold">{l.titulo}</span> <span className="text-muted-foreground">({l.fonte}): {l.texto}.</span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        {!meta && !podeConectarMeta ? 'Quem conecta a Meta é o gestor do Marketing ou a Diretoria. ' : ''}
        Os números entram sozinhos depois de cada ligação.
      </p>
    </Card>
  );
}
