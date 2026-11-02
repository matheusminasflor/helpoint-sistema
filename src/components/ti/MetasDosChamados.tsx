// As metas dos números do topo de TI › Indicadores (revisão de 2026-11-01): moram em `dir_metas_dos_setores` (setor 'ti'),
// como as dos outros setores, e quem define é a Diretoria. Sem meta, o número fica sem farol.
import { useState } from 'react';
import { Target } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useSalvarMetaDoSetor } from '@/hooks/useDiretoria';
import { mensagemDeErro } from '@/lib/supabase-result';

const METAS_DOS_CHAMADOS = [
  { chave: 'sla_cumprido', rotulo: 'SLA cumprido (%)', sentido: 'mais' },
  { chave: 'primeira_resposta', rotulo: '1ª resposta no prazo (%)', sentido: 'mais' },
  { chave: 'tempo_medio_horas', rotulo: 'Tempo médio de resolução (horas, no máximo)', sentido: 'menos' },
] as const;

export function DefinirMetasDosChamados({ metas }: { metas: Map<string, number> | undefined }) {
  const [aberto, setAberto] = useState(false);
  const [valores, setValores] = useState<Record<string, string>>({});
  const salvar = useSalvarMetaDoSetor();

  const abrir = () => {
    setValores(Object.fromEntries(METAS_DOS_CHAMADOS.map((m) => [m.chave, String(metas?.get(`ti.${m.chave}`) ?? '').replace('.', ',')])));
    setAberto(true);
  };
  const enviar = async () => {
    try {
      for (const m of METAS_DOS_CHAMADOS) {
        const texto = (valores[m.chave] ?? '').trim();
        const atual = metas?.get(`ti.${m.chave}`);
        const novo = texto === '' ? null : Number(texto.replace(',', '.'));
        if (novo !== null && (Number.isNaN(novo) || novo < 0)) { toast.error(`${m.rotulo}: escreva um número.`); return; }
        if ((novo ?? undefined) === atual) continue;
        if (novo === null && atual === undefined) continue;
        await salvar.mutateAsync({ setor: 'ti', indicador: m.chave, meta: novo });
      }
      toast.success('Metas salvas.');
      setAberto(false);
    } catch (e) {
      toast.error(mensagemDeErro(e));
    }
  };

  return (
    <>
      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={abrir}><Target className="h-3.5 w-3.5 mr-1" />Metas</Button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Metas dos chamados da TI</DialogTitle>
            <DialogDescription>Valem para qualquer período até alguém mudar. Em branco, o número fica sem farol.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {METAS_DOS_CHAMADOS.map((m) => (
              <div key={m.chave} className="space-y-1">
                <Label htmlFor={`meta-${m.chave}`}>{m.rotulo}</Label>
                <Input id={`meta-${m.chave}`} inputMode="decimal" value={valores[m.chave] ?? ''}
                  onChange={(e) => setValores({ ...valores, [m.chave]: e.target.value })} />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAberto(false)}>Cancelar</Button>
            <Button onClick={enviar} disabled={salvar.isPending}>Salvar metas</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
