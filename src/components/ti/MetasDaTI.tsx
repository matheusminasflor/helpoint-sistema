// Configurações de TI › Metas. Rodada 2 (dono, 2026-11-02): cada indicador com o padrão de mercado ao lado. Rodada 3
// (mesmo dia): a meta sobe em DEGRAUS — "a partir de tal mês, tal meta" (`ti_metas_degraus`, 20270212190000). Cada
// indicador já vem com a escada padrão (`config/metas-da-ti`); mudar grava a escada inteira, e "Voltar ao padrão"
// apaga a gravada. Quem altera a aba Chamados da configuração da TI, ou define metas na Diretoria, muda aqui; o banco
// confere o mesmo.
import { useEffect, useState } from 'react';
import { Plus, RotateCcw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { METAS_DA_TI, escadaDe, nomeDoMes, type Degrau } from '@/config/metas-da-ti';
import { useConfiguracaoDosSetores } from '@/hooks/useAccessProfiles';
import { useMetasDaTI, useSalvarEscadaDaTI } from '@/hooks/useMetasDaTI';
import { mensagemDeErro } from '@/lib/supabase-result';

// O degrau na tela: o mês ("2026-11", o `<input type="month">`) e a meta como a pessoa digitou ("80" ou "12,5").
interface DegrauNaTela { mes: string; meta: string }
const paraTela = (d: Degrau): DegrauNaTela => ({ mes: d.a_partir_de.slice(0, 7), meta: String(d.meta).replace('.', ',') });
const iguais = (a: DegrauNaTela[], b: DegrauNaTela[]) => JSON.stringify(a) === JSON.stringify(b);

export function MetasDaTI({ podeAlterarAba }: { podeAlterarAba: boolean }) {
  const metas = useMetasDaTI();
  const perfil = useConfiguracaoDosSetores();
  const pode = podeAlterarAba || perfil.pode('diretoria', 'indicadores', 'definir_metas');
  const salvar = useSalvarEscadaDaTI();
  const [escadas, setEscadas] = useState<Record<string, DegrauNaTela[]>>({});

  useEffect(() => {
    if (metas.data) setEscadas(Object.fromEntries(METAS_DA_TI.map((m) => [m.chave, escadaDe(metas.data, m.chave).map(paraTela)])));
  }, [metas.data]);

  const mudar = (chave: string, i: number, campo: keyof DegrauNaTela, valor: string) =>
    setEscadas((e) => ({ ...e, [chave]: e[chave].map((d, j) => (j === i ? { ...d, [campo]: valor } : d)) }));

  const enviar = async () => {
    try {
      let mudou = 0;
      for (const m of METAS_DA_TI) {
        const tela = escadas[m.chave] ?? [];
        const gravada = metas.data?.get(m.chave) ?? [];
        const padrao = m.escada.map(paraTela);
        // Igual ao que já vale: nada a gravar. Igual ao padrão: apaga a gravada (volta a seguir o padrão).
        if (iguais(tela, (gravada.length ? gravada : m.escada).map(paraTela))) continue;
        const degraus: Degrau[] = [];
        for (const d of tela) {
          const n = Number(d.meta.replace(',', '.'));
          if (!d.mes || d.meta.trim() === '' || Number.isNaN(n) || n < 0 || (m.percentual && n > 100)) {
            toast.error(`${m.rotulo}: cada degrau precisa do mês e de um número${m.percentual ? ' de 0 a 100' : ''}.`);
            return;
          }
          degraus.push({ a_partir_de: `${d.mes}-01`, meta: n });
        }
        if (new Set(degraus.map((d) => d.a_partir_de)).size !== degraus.length) {
          toast.error(`${m.rotulo}: dois degraus no mesmo mês.`);
          return;
        }
        await salvar.mutateAsync({ indicador: m.chave, degraus: iguais(tela, padrao) ? [] : degraus });
        mudou++;
      }
      toast.success(mudou ? 'Metas salvas. Já valem nos Indicadores da TI.' : 'Nada mudou.');
    } catch (e) {
      toast.error(mensagemDeErro(e));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Metas dos Indicadores da TI</CardTitle>
        <CardDescription>
          A meta sobe em degraus: a partir de cada mês, uma meta. Cada indicador já vem com uma escada (a média de hoje
          primeiro, o padrão de mercado no fim). Mude os degraus quando quiser; um período usa o degrau do último dia dele.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {METAS_DA_TI.map((m) => {
          const lista = escadas[m.chave] ?? [];
          const ePadrao = iguais(lista, m.escada.map(paraTela));
          return (
            <div key={m.chave} className="rounded-lg border p-4 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 space-y-0.5">
                  <h4 className="font-medium">{m.rotulo}</h4>
                  <p className="text-sm text-muted-foreground max-w-[70ch]">{m.mercado}</p>
                </div>
                {pode && !ePadrao && (
                  <Button variant="ghost" size="sm" onClick={() => setEscadas((e) => ({ ...e, [m.chave]: m.escada.map(paraTela) }))}>
                    <RotateCcw className="h-3.5 w-3.5 mr-1.5" />Voltar ao padrão
                  </Button>
                )}
              </div>
              <ol className="flex flex-wrap gap-2">
                {lista.map((d, i) => (
                  <li key={i} className="flex items-center gap-1.5 rounded-md bg-muted/50 px-2 py-1.5">
                    <span className="text-xs text-muted-foreground">a partir de</span>
                    <Input type="month" value={d.mes} disabled={!pode} className="h-8 w-[150px]" aria-label={`${m.rotulo}: mês do degrau ${i + 1}`}
                      id={`meta-${m.chave}-${i}-mes`} onChange={(e) => mudar(m.chave, i, 'mes', e.target.value)} />
                    <Input inputMode="decimal" value={d.meta} disabled={!pode} className="h-8 w-20 text-right tabular-nums"
                      aria-label={`${m.rotulo}: meta do degrau ${i + 1}`} id={`meta-${m.chave}-${i}-valor`}
                      onChange={(e) => mudar(m.chave, i, 'meta', e.target.value)} />
                    <span className="text-xs text-muted-foreground whitespace-nowrap">{m.unidade.trim()}</span>
                    {pode && lista.length > 1 && (
                      <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Tirar o degrau de ${d.mes ? nomeDoMes(`${d.mes}-01`) : 'mês vazio'}`}
                        onClick={() => setEscadas((e) => ({ ...e, [m.chave]: e[m.chave].filter((_, j) => j !== i) }))}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </li>
                ))}
                {pode && (
                  <li>
                    <Button variant="outline" size="sm" className="h-11"
                      onClick={() => setEscadas((e) => ({ ...e, [m.chave]: [...(e[m.chave] ?? []), { mes: '', meta: '' }] }))}>
                      <Plus className="h-3.5 w-3.5 mr-1" />Degrau
                    </Button>
                  </li>
                )}
              </ol>
            </div>
          );
        })}
        {pode ? (
          <div className="flex justify-end"><Button onClick={enviar} disabled={salvar.isPending || metas.isLoading}>Salvar metas</Button></div>
        ) : (
          <p className="text-sm text-muted-foreground">Você pode ver as metas, mas não mudar. Quem muda é quem altera a configuração de Chamados da TI, ou a Diretoria.</p>
        )}
        <p className="text-xs text-muted-foreground">
          Cor nos indicadores: verde na meta; amarelo perto dela (em percentual, até 10 pontos; em tempo e quantidade, até
          30%); vermelho fora.
        </p>
      </CardContent>
    </Card>
  );
}
