// O canal de uma reunião no Chat (dono, 2026-11-07): as pautas de cada encontro, o texto do Google como veio, a
// transcrição, a presença e a conversa. Nada aqui cria chamado, tarefa ou projeto.
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Download, ExternalLink, Search, UserRound } from 'lucide-react';
import { ConversaCanal } from '@/components/chat/ConversaCanal';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ErroDeCarga } from '@/components/ui/ErroDeCarga';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useEntrarNoCanal, type ChatCanalRow } from '@/hooks/useChat';
import { useProfiles } from '@/hooks/useInventory';
import {
  useLigarNome, useNomesSemPessoa, usePresenca, useReunioesDaSerie, useTranscricao,
  type PresencaNaReuniao, type Reuniao, type SerieDeReuniao,
} from '@/hooks/useReunioes';
import { dataHora, toLocalISODate } from '@/lib/dates';
import { falasCom, lerCsv, mediaDeMinutos, minutosEntre, secaoDaPauta } from '@/lib/reunioes';

const dia = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
const hora = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—');

async function baixarExcel(arquivo: string, linhas: (string | number)[][]) {
  const XLSX = await import('xlsx');
  const livro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(livro, XLSX.utils.aoa_to_sheet(linhas), 'Presença');
  XLSX.writeFile(livro, arquivo);
}

function Texto({ children }: { children: string }) {
  return <p className="text-[14px] whitespace-pre-wrap break-words max-w-[75ch]">{children}</p>;
}

function PautaDoEncontro({ reuniao }: { reuniao: Reuniao }) {
  if (!reuniao.pauta) return <p className="text-[14px] text-muted-foreground">Esta reunião não teve anotações do Google.</p>;
  return <Texto>{reuniao.pauta}</Texto>;
}

function TranscricaoDoEncontro({ reuniao }: { reuniao: Reuniao }) {
  const { data: texto, isLoading, isError, refetch } = useTranscricao(reuniao.id);
  const [busca, setBusca] = useState('');
  const falas = useMemo(() => falasCom(texto ?? '', busca), [texto, busca]);
  if (isError) return <ErroDeCarga mensagem="Não consegui ler a transcrição." onTentar={() => void refetch()} />;
  if (isLoading) return <Skeleton className="h-40 w-full" />;
  if (!texto) return <p className="text-[14px] text-muted-foreground">A transcrição fica com quem participou deste encontro e com a Diretoria. Se você participou, este encontro não teve transcrição.</p>;
  return (
    <div className="space-y-3">
      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
        <Input className="pl-8" aria-label="Buscar na transcrição" placeholder="Buscar na transcrição" value={busca} onChange={(e) => setBusca(e.target.value)} />
      </div>
      {busca.trim() && <p className="text-[13px] text-muted-foreground">{falas.length} {falas.length === 1 ? 'trecho' : 'trechos'}</p>}
      <Texto>{falas.join('\n')}</Texto>
    </div>
  );
}

function PresencaDoEncontro({ reuniao }: { reuniao: Reuniao }) {
  const { data: pessoas = [], isLoading, isError, refetch } = usePresenca(reuniao.id);
  if (isError) return <ErroDeCarga mensagem="Não consegui ler a presença." onTentar={() => void refetch()} />;
  if (isLoading) return <Skeleton className="h-40 w-full" />;
  if (pessoas.length === 0 && !reuniao.lista_google) {
    return <p className="text-[14px] text-muted-foreground">A presença fica com quem participou deste encontro e com a Diretoria.</p>;
  }
  const arquivo = `presenca-${reuniao.titulo.replace(/[^\p{L}\p{N}]+/gu, '-').toLowerCase()}-${toLocalISODate(new Date(reuniao.inicio))}.xlsx`;
  if (reuniao.lista_google) {
    const linhas = lerCsv(reuniao.lista_google);
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[13px] text-muted-foreground">Lista gerada pelo Google.</p>
          <Button size="sm" variant="outline" onClick={() => void baixarExcel(arquivo, linhas)}><Download className="w-4 h-4 mr-1.5" aria-hidden="true" />Baixar lista</Button>
        </div>
        <div className="overflow-x-auto rounded-md border border-border" data-celular="tabela">
          <table className="w-full text-[13px]">
            <thead><tr className="bg-secondary/60 text-left">{linhas[0]?.map((c, i) => <th key={i} className="px-3 py-2">{c}</th>)}</tr></thead>
            <tbody>{linhas.slice(1).map((l, i) => <tr key={i} className="border-t">{l.map((c, j) => <td key={j} className="px-3 py-2">{c}</td>)}</tr>)}</tbody>
          </table>
        </div>
      </div>
    );
  }
  const situacao = (p: PresencaNaReuniao) => (!p.entrou ? 'Convidada, não entrou' : p.convidado ? 'Convidada' : 'Entrou sem convite');
  const linhas: (string | number)[][] = [
    ['Pessoa', 'Entrou', 'Saiu', 'Minutos', 'Convite'],
    ...pessoas.map((p) => [p.nome, hora(p.entrada), hora(p.saida), minutosEntre(p.entrada, p.saida) ?? '', situacao(p)]),
  ];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-muted-foreground">Gerada a partir do Meet.</p>
        <Button size="sm" variant="outline" onClick={() => void baixarExcel(arquivo, linhas)}><Download className="w-4 h-4 mr-1.5" aria-hidden="true" />Baixar lista</Button>
      </div>
      <div className="overflow-x-auto rounded-md border border-border" data-celular="tabela">
        <table className="w-full text-[13px]">
          <thead><tr className="bg-secondary/60 text-left"><th className="px-3 py-2">Pessoa</th><th className="px-3 py-2">Entrou</th><th className="px-3 py-2">Saiu</th><th className="px-3 py-2">Tempo</th><th className="px-3 py-2">Convite</th></tr></thead>
          <tbody>
            {pessoas.map((p) => {
              const tempo = minutosEntre(p.entrada, p.saida);
              return (
                <tr key={p.id} className="border-t">
                  <td className="px-3 py-2 font-medium">{p.nome}</td>
                  <td className="px-3 py-2 tabular-nums">{hora(p.entrada)}</td>
                  <td className="px-3 py-2 tabular-nums">{hora(p.saida)}</td>
                  <td className="px-3 py-2 tabular-nums">{tempo === null ? '—' : `${tempo} min`}</td>
                  <td className="px-3 py-2"><Badge variant="outline" className={!p.convidado ? 'badge-info' : !p.entrou ? 'badge-warning' : ''}>{situacao(p)}</Badge></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Encontro({ reuniao }: { reuniao: Reuniao }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[16px] font-semibold">{dia(reuniao.inicio)}, {hora(reuniao.inicio)}</h3>
        <div className="flex flex-wrap gap-2">
          {reuniao.link_documento && <Button asChild size="sm" variant="ghost"><a href={reuniao.link_documento} target="_blank" rel="noreferrer"><ExternalLink className="w-4 h-4 mr-1.5" aria-hidden="true" />Abrir o original</a></Button>}
          {reuniao.link_gravacao && <Button asChild size="sm" variant="ghost"><a href={reuniao.link_gravacao} target="_blank" rel="noreferrer"><ExternalLink className="w-4 h-4 mr-1.5" aria-hidden="true" />Abrir a gravação</a></Button>}
        </div>
      </div>
      <Tabs defaultValue="pauta">
        <TabsList>
          <TabsTrigger value="pauta">Pauta</TabsTrigger>
          <TabsTrigger value="transcricao">Transcrição</TabsTrigger>
          <TabsTrigger value="presenca">Presença</TabsTrigger>
        </TabsList>
        <TabsContent value="pauta" className="mt-3"><PautaDoEncontro reuniao={reuniao} /></TabsContent>
        <TabsContent value="transcricao" className="mt-3"><TranscricaoDoEncontro reuniao={reuniao} /></TabsContent>
        <TabsContent value="presenca" className="mt-3"><PresencaDoEncontro reuniao={reuniao} /></TabsContent>
      </Tabs>
    </div>
  );
}

function DoInicioAoFim({ reunioes }: { reunioes: Reuniao[] }) {
  const comPauta = reunioes.filter((r) => r.pauta);
  const media = mediaDeMinutos(reunioes);
  const numeros: [string, string][] = [
    ['Reuniões', String(reunioes.length)],
    ['Com pauta', String(comPauta.length)],
    ['Duração média', media === null ? '—' : `${media} min`],
  ];
  return (
    <div className="space-y-5">
      <dl className="grid grid-cols-3 gap-2 max-w-md">
        {numeros.map(([rotulo, valor]) => (
          <div key={rotulo} className="rounded-md border border-border p-2"><dt className="text-[13px] text-muted-foreground">{rotulo}</dt><dd className="text-[20px] font-semibold tabular-nums">{valor}</dd></div>
        ))}
      </dl>
      <p className="text-[13px] text-muted-foreground">Texto do Google, do primeiro encontro ao mais recente.</p>
      {[...comPauta].reverse().map((r) => {
        const resumo = secaoDaPauta(r.pauta!, 'Resumo');
        const decisoes = secaoDaPauta(r.pauta!, 'Decisões');
        return (
          <article key={r.id} className="border-t border-border pt-3 space-y-2">
            <h3 className="text-[15px] font-semibold">{dia(r.inicio)}</h3>
            {resumo && <><h4 className="text-[13px] font-semibold text-muted-foreground">Resumo</h4><Texto>{resumo}</Texto></>}
            {decisoes && <><h4 className="text-[13px] font-semibold text-muted-foreground">Decisões</h4><Texto>{decisoes}</Texto></>}
            {!resumo && !decisoes && <p className="text-[14px] text-muted-foreground">Este encontro não tem Resumo nem Decisões no documento.</p>}
          </article>
        );
      })}
    </div>
  );
}

function NomesDoGoogle() {
  const { data: nomes = [] } = useNomesSemPessoa();
  const { profiles: pessoas = [] } = useProfiles();
  const ligar = useLigarNome();
  const [aberto, setAberto] = useState(false);
  if (nomes.length === 0) return null;
  return (
    <>
      <button type="button" onClick={() => setAberto(true)}
        className="w-full text-left rounded-md border border-status-warning bg-status-warning/5 px-3 py-2 text-[14px] font-medium">
        <UserRound className="inline w-4 h-4 mr-1.5" aria-hidden="true" />
        {nomes.length} {nomes.length === 1 ? 'nome do Google sem pessoa' : 'nomes do Google sem pessoa'}. Ligar
      </button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Ligar nomes do Google</DialogTitle></DialogHeader>
          <ul className="space-y-3">
            {nomes.map((n) => (
              <li key={n} className="space-y-1">
                <p className="text-[14px] font-medium">{n}</p>
                <Select disabled={ligar.isPending} onValueChange={(v) => ligar.mutate({ nome: n, pessoa: v === 'fora' ? null : v })}>
                  <SelectTrigger aria-label={`Pessoa de ${n}`}><SelectValue placeholder="Escolha a pessoa" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fora">Não tem login no Helpoint</SelectItem>
                    {pessoas.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function CanalDeReuniao({ serie, canal, onVoltar }: { serie: SerieDeReuniao; canal: ChatCanalRow | null; onVoltar: () => void }) {
  const { data: reunioes = [], isLoading, isError, refetch } = useReunioesDaSerie(serie.id);
  const entrar = useEntrarNoCanal();
  const [escolhida, setEscolhida] = useState<string | null>(null);
  const atual = reunioes.find((r) => r.id === escolhida) ?? reunioes[0] ?? null;
  const marcarLido = entrar.mutate;
  // Abrir o canal é ler o aviso da pauta nova. A Diretoria que não participou não é do canal.
  useEffect(() => { if (canal?.id) marcarLido(canal.id); }, [canal?.id, marcarLido]);

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4 min-w-0">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="min-[861px]:hidden" aria-label="Voltar para as reuniões" onClick={onVoltar}><ArrowLeft className="w-4 h-4" aria-hidden="true" /></Button>
        <div className="min-w-0">
          <h2 className="text-[18px] font-bold break-words">{serie.titulo}</h2>
          {serie.avulsa ? <p className="text-[13px] text-muted-foreground">Reunião avulsa</p> : <p className="text-[13px] text-muted-foreground">Reunião repetida · {reunioes.length} {reunioes.length === 1 ? 'encontro' : 'encontros'}</p>}
        </div>
      </div>
      <NomesDoGoogle />
      {isError ? <ErroDeCarga mensagem="Não consegui ler as reuniões." onTentar={() => void refetch()} />
        : isLoading ? <Skeleton className="h-64 w-full" />
          : (
            <Tabs defaultValue="pautas">
              <TabsList>
                <TabsTrigger value="pautas">Pautas</TabsTrigger>
                <TabsTrigger value="fio">Do início ao fim</TabsTrigger>
                {canal && <TabsTrigger value="conversa">Conversa</TabsTrigger>}
              </TabsList>
              <TabsContent value="pautas" className="mt-3 space-y-4">
                {reunioes.length > 1 && (
                  <div className="flex flex-wrap gap-2" role="group" aria-label="Encontros">
                    {reunioes.map((r) => (
                      <Button key={r.id} size="sm" variant={r.id === atual?.id ? 'default' : 'outline'} aria-pressed={r.id === atual?.id} onClick={() => setEscolhida(r.id)}>
                        {new Date(r.inicio).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                      </Button>
                    ))}
                  </div>
                )}
                {atual ? <Encontro key={atual.id} reuniao={atual} /> : <p className="text-[14px] text-muted-foreground">Nenhuma reunião guardada ainda.</p>}
              </TabsContent>
              <TabsContent value="fio" className="mt-3"><DoInicioAoFim reunioes={reunioes} /></TabsContent>
              {canal && (
                <TabsContent value="conversa" className="mt-3">
                  <div className="h-[60dvh] flex flex-col border border-border rounded-md overflow-hidden"><ConversaCanal canal={{ ...canal, nome: serie.titulo }} souAdmin={false} /></div>
                </TabsContent>
              )}
            </Tabs>
          )}
    </div>
  );
}
