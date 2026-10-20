import { useEffect, useState } from 'react';
import { Gift, Megaphone } from 'lucide-react';
import { ConfiguracaoDoSetor } from '@/components/configuracoes/ConfiguracaoDoSetor';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { usePessoasDaEmpresa } from '@/hooks/useProjetos';
import { useConfigDoBeneficio, useSalvarConfigDoBeneficio } from '@/hooks/useBeneficioDeSexta';

export default function MKTConfiguracoes() {
  return (
    <ConfiguracaoDoSetor label="Marketing" icon={Megaphone} modulo="marketing" nomeNaFrase="o Marketing"
      abas={[
        // 2026-10-20 (dono): quem libera a retirada de quem atrasou 2 vezes, além do gestor do Marketing. A aba é
        // `config_beneficio` na matriz: o Gestor tem, o Operador não.
        { valor: 'beneficio', permissao: 'beneficio', rotulo: 'Benefício de sexta', icone: Gift,
          conteudo: (pode: boolean) => <QuemLiberaOBeneficio podeEditar={pode} /> },
      ]} />
  );
}

function QuemLiberaOBeneficio({ podeEditar }: { podeEditar: boolean }) {
  const { data: config } = useConfigDoBeneficio();
  const { data: pessoas = [] } = usePessoasDaEmpresa();
  const salvar = useSalvarConfigDoBeneficio();
  const [liberador, setLiberador] = useState<string>('');
  useEffect(() => { setLiberador(config?.liberador_id ?? ''); }, [config?.liberador_id]);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Benefício de sexta</CardTitle>
        <CardDescription>
          Quem atrasou a devolução 2 vezes nos últimos 6 meses só leva de novo com liberação. Liberam o gestor do Marketing e a
          pessoa escolhida aqui. Quem registra retiradas e cadastra produtos se marca no perfil (Marketing › Benefício de sexta).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="beneficio-liberador">Quem libera, além do gestor do Marketing</Label>
          <select id="beneficio-liberador" value={liberador} disabled={!podeEditar} onChange={(e) => setLiberador(e.target.value)}
            className="h-9 w-full max-w-sm rounded-md border border-border bg-background px-2 text-sm">
            <option value="">Ninguém</option>
            {[...pessoas].sort((a, b) => a.nome.localeCompare(b.nome)).map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
        </div>
        {podeEditar && (
          <Button disabled={salvar.isPending} onClick={() => salvar.mutate({ liberador_id: liberador || null })}>Salvar</Button>
        )}
      </CardContent>
    </Card>
  );
}
