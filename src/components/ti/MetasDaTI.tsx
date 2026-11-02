// Configurações de TI › Metas (dono, 2026-11-02): UMA meta por indicador, com o padrão de mercado ao lado. O gestor muda
// quando quiser ("esse mês vou querer subir para tanto"); a nova vale a partir do mês da mudança e os meses anteriores
// continuam com a que valia (`degrausAoMudar`; `ti_metas_degraus`, 20270212190000). Quem altera a aba Chamados da
// configuração da TI, ou define metas na Diretoria, muda aqui; o banco confere o mesmo.
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { METAS_DA_TI, degrausAoMudar, metaNoDia } from '@/config/metas-da-ti';
import { useConfiguracaoDosSetores } from '@/hooks/useAccessProfiles';
import { useMetasDaTI, useSalvarEscadaDaTI } from '@/hooks/useMetasDaTI';
import { todayISO } from '@/lib/dates';
import { mensagemDeErro } from '@/lib/supabase-result';

const texto = (v: number | undefined) => (v === undefined ? '' : String(v).replace('.', ','));

export function MetasDaTI({ podeAlterarAba }: { podeAlterarAba: boolean }) {
  const metas = useMetasDaTI();
  const perfil = useConfiguracaoDosSetores();
  const pode = podeAlterarAba || perfil.pode('diretoria', 'indicadores', 'definir_metas');
  const salvar = useSalvarEscadaDaTI();
  const hoje = todayISO();
  const [valores, setValores] = useState<Record<string, string>>({});
  const vigente = (chave: string) => metaNoDia(metas.data, chave, hoje);

  useEffect(() => {
    if (metas.data) setValores(Object.fromEntries(METAS_DA_TI.map((m) => [m.chave, texto(metaNoDia(metas.data, m.chave, hoje))])));
  }, [metas.data, hoje]);

  const enviar = async () => {
    try {
      let mudou = 0;
      for (const m of METAS_DA_TI) {
        const t = (valores[m.chave] ?? '').trim();
        const nova = Number(t.replace(',', '.'));
        if (t === '' || Number.isNaN(nova) || nova < 0 || (m.percentual && nova > 100)) {
          toast.error(`${m.rotulo}: escreva um número${m.percentual ? ' de 0 a 100' : ''}.`);
          return;
        }
        if (nova === vigente(m.chave)) continue;
        await salvar.mutateAsync({ indicador: m.chave, degraus: degrausAoMudar(metas.data?.get(m.chave) ?? [], m.padrao, nova, hoje) });
        mudou++;
      }
      toast.success(mudou ? 'Metas salvas. Valem a partir deste mês.' : 'Nada mudou.');
    } catch (e) {
      toast.error(mensagemDeErro(e));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Metas dos Indicadores da TI</CardTitle>
        <CardDescription>
          Uma meta por indicador. Quando mudar, a nova vale a partir deste mês; os meses anteriores continuam com a meta
          que valia, para o histórico não mudar de cor.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Indicador</TableHead><TableHead>Mercado</TableHead><TableHead className="w-[170px]">Meta</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {METAS_DA_TI.map((m) => (
                <TableRow key={m.chave}>
                  <TableCell className="font-medium align-top">{m.rotulo}</TableCell>
                  <TableCell className="text-sm text-muted-foreground align-top max-w-[420px]">{m.mercado}</TableCell>
                  <TableCell className="align-top">
                    <div className="flex items-center gap-1.5">
                      <Input id={`meta-ti-${m.chave}`} inputMode="decimal" className="h-8 w-24 text-right tabular-nums"
                        aria-label={`Meta: ${m.rotulo}`} disabled={!pode}
                        value={valores[m.chave] ?? ''} onChange={(e) => setValores({ ...valores, [m.chave]: e.target.value })} />
                      <span className="text-xs text-muted-foreground whitespace-nowrap">{m.unidade.trim()}</span>
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
