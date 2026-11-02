// Configurações de TI › Metas (dono, 2026-11-02, rodada 2): cada indicador da TI com o padrão de mercado ao lado e a
// meta em vigor. Quem altera a aba Chamados da configuração da TI, ou define metas na Diretoria, muda aqui; o banco
// confere o mesmo (`dir_metas_ti_configura`, 20270212180000). Em branco = volta ao padrão.
import { useEffect, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { METAS_DA_TI } from '@/config/metas-da-ti';
import { useConfiguracaoDosSetores } from '@/hooks/useAccessProfiles';
import { useMetasDosSetores, useSalvarMetaDoSetor } from '@/hooks/useDiretoria';
import { mensagemDeErro } from '@/lib/supabase-result';

const texto = (v: number | undefined) => (v === undefined ? '' : String(v).replace('.', ','));
const mostrar = (v: number, unidade: string) => `${v.toLocaleString('pt-BR')}${unidade}`;

export function MetasDaTI({ podeAlterarAba }: { podeAlterarAba: boolean }) {
  const metas = useMetasDosSetores();
  const perfil = useConfiguracaoDosSetores();
  const pode = podeAlterarAba || perfil.pode('diretoria', 'indicadores', 'definir_metas');
  const salvar = useSalvarMetaDoSetor();
  const [valores, setValores] = useState<Record<string, string>>({});
  const gravada = (chave: string) => metas.data?.get(`ti.${chave}`);

  useEffect(() => {
    if (metas.data) setValores(Object.fromEntries(METAS_DA_TI.map((m) => [m.chave, texto(gravada(m.chave))])));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recarrega só quando o banco responde
  }, [metas.data]);

  const enviar = async () => {
    try {
      let mudou = 0;
      for (const m of METAS_DA_TI) {
        const t = (valores[m.chave] ?? '').trim();
        const novo = t === '' ? null : Number(t.replace(',', '.'));
        if (novo !== null && (Number.isNaN(novo) || novo < 0 || (m.percentual && novo > 100))) {
          toast.error(`${m.rotulo}: escreva um número${m.percentual ? ' de 0 a 100' : ''}.`);
          return;
        }
        const atual = gravada(m.chave);
        if ((novo ?? undefined) === atual) continue;
        await salvar.mutateAsync({ setor: 'ti', indicador: m.chave, meta: novo });
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
          Cada indicador já nasce com uma meta padrão (o mercado e o histórico da empresa). Escreva outra para mudar; em
          branco, vale o padrão. Valem para qualquer período; a de interrupções é por mês e o período leva a parte dele.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Indicador</TableHead><TableHead>Mercado</TableHead>
                <TableHead className="text-right">Padrão</TableHead><TableHead className="w-[170px]">Meta da empresa</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {METAS_DA_TI.map((m) => (
                <TableRow key={m.chave}>
                  <TableCell className="font-medium align-top">{m.rotulo}</TableCell>
                  <TableCell className="text-sm text-muted-foreground align-top max-w-[380px]">{m.mercado}</TableCell>
                  <TableCell className="text-right tabular-nums align-top whitespace-nowrap">{mostrar(m.padrao, m.unidade)}</TableCell>
                  <TableCell className="align-top">
                    <div className="flex items-center gap-1">
                      <Input id={`meta-ti-${m.chave}`} inputMode="decimal" className="h-8 w-24 text-right tabular-nums"
                        aria-label={`Meta da empresa: ${m.rotulo}`} placeholder={texto(m.padrao)} disabled={!pode}
                        value={valores[m.chave] ?? ''} onChange={(e) => setValores({ ...valores, [m.chave]: e.target.value })} />
                      <span className="text-xs text-muted-foreground whitespace-nowrap">{m.unidade.trim()}</span>
                      {pode && (valores[m.chave] ?? '') !== '' && (
                        <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Voltar ${m.rotulo} ao padrão`}
                          onClick={() => setValores({ ...valores, [m.chave]: '' })}><RotateCcw className="h-3.5 w-3.5" /></Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
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
