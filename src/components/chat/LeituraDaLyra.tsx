// A leitura da Lyra sobre o canal (dono, 2026-11-07): complemento por clique, com as datas para conferir no texto do
// Google. Aponta assuntos e não dá nota para a reunião.
import { Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ErroDeCarga } from '@/components/ui/ErroDeCarga';
import { useIALigada } from '@/hooks/useAssistantName';
import { useGerarLeitura, useLeituraDaSerie, type AssuntoDaLeitura, type Reuniao } from '@/hooks/useReunioes';
import { dataHora, diaCurto } from '@/lib/dates';

const GRUPOS = [
  ['avancou', 'Avançou', 'badge-success'],
  ['voltou', 'Voltou à pauta', 'badge-warning'],
  ['sem_definicao', 'Sem definição', 'badge-neutral'],
] as const;

export function LeituraDaLyra({ serieId, encontros, onAbrir }: { serieId: string; encontros: Reuniao[]; onAbrir: (dia: string) => void }) {
  const ligada = useIALigada();
  const { data: leitura, isError, refetch } = useLeituraDaSerie(serieId);
  const gerar = useGerarLeitura(serieId);
  const comPauta = encontros.filter((r) => r.pauta);
  if (!ligada || comPauta.length < 2) return null;
  if (isError) return <ErroDeCarga mensagem="Não consegui ler a análise guardada." onTentar={() => void refetch()} />;

  const atualizada = leitura?.ate_reuniao === comPauta[0]?.id;
  const botao = (
    <Button size="sm" variant={leitura ? 'outline' : 'default'} disabled={gerar.isPending} onClick={() => gerar.mutate()}>
      <Sparkles className="w-4 h-4 mr-1.5" aria-hidden="true" />
      {gerar.isPending ? 'Lendo as pautas…' : leitura ? 'Atualizar leitura' : 'Gerar leitura com a Lyra'}
    </Button>
  );

  const linha = (a: AssuntoDaLeitura, i: number) => (
    <li key={i} className="text-[14px] space-y-1">
      <span className="block">{a.assunto}</span>
      <span className="flex flex-wrap gap-1">
        {a.datas.map((d) => <button key={d} type="button" className="text-[13px] text-primary underline min-h-6" onClick={() => onAbrir(d)}>{diaCurto(d)}</button>)}
      </span>
    </li>
  );

  return (
    <section className="rounded-md border border-border p-3 space-y-3" aria-label="Leitura da Lyra">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[15px] font-semibold">Leitura da Lyra</h3>
        {(!leitura || !atualizada) && botao}
      </div>
      {!leitura && <p className="text-[13px] text-muted-foreground">Compara as pautas e separa o que avançou, o que voltou e o que ficou sem definição. Só roda neste clique.</p>}
      {gerar.isError && <p className="text-[13px] text-status-danger">Não consegui gerar a leitura. Tente de novo.</p>}
      {leitura && (
        <>
          <p className="text-[14px]">{leitura.conteudo.resumo}</p>
          <div className="grid gap-3 md:grid-cols-3">
            {GRUPOS.map(([chave, titulo, cor]) => (
              <div key={chave} className="space-y-2 min-w-0">
                <Badge variant="outline" className={cor}>{titulo}</Badge>
                {leitura.conteudo[chave].length === 0
                  ? <p className="text-[13px] text-muted-foreground">Nenhum assunto.</p>
                  : <ul className="space-y-2">{leitura.conteudo[chave].map(linha)}</ul>}
              </div>
            ))}
          </div>
          <p className="text-[13px] text-muted-foreground">
            Gerada em {dataHora(leitura.gerado_em)}{!atualizada && ', antes da pauta mais recente'}. Clique na data para conferir o texto do Google.
          </p>
        </>
      )}
    </section>
  );
}
