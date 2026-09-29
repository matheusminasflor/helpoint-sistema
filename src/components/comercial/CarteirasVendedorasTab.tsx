// Comercial › Configurações › Carteiras e vendedoras — os PARÂMETROS que o dono pediu em
// 2026-09-28: "crie os parâmetros para que sejam atribuídos nas carteiras e vendedores, assim
// quando o sistema for para produção eu configuro os vendedores, suas carteiras e seus
// clientes sem problema."
//
// Três passos, na ordem em que se monta: criar a carteira com quem responde por ela; e
// atribuir os clientes (em Comercial › Cadastro de clientes, em lote). Nenhum nome de carteira
// vem semeado — semente é exemplo, nunca regra, e aqui nem exemplo o dono quis.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FileSpreadsheet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { QuemRespondePorCarteira } from '@/components/comercial/QuemRespondePorCarteira';
import { ImportarCarteirasDialog } from '@/components/comercial/ImportarCarteirasDialog';
import { useCarteiras } from '@/hooks/useComercialCarteirasMetas';
import { useLacunasDoCadastro } from '@/hooks/useComercialCliente';
import { usePodeGerirCarteiras } from '@/hooks/useAccessProfiles';

export function CarteirasVendedorasTab() {
  const podeGerir = usePodeGerirCarteiras();
  const [importando, setImportando] = useState(false);
  const { data: carteiras = [] } = useCarteiras();
  const { data: lacunas } = useLacunasDoCadastro();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Carteiras e vendedoras</CardTitle>
        <CardDescription>
          Quem está numa carteira é vendedora: lança para os clientes dela e ganha os indicadores no Painel do Gestor
          sozinha — sem outro cadastro. Cliente sem carteira fica no <strong>Histórico</strong>.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {podeGerir ? (
          <QuemRespondePorCarteira carteiras={carteiras} permiteCriar />
        ) : (
          <p className="text-[12px] text-muted-foreground">
            Montar carteiras exige a permissão "Carteiras" no perfil de acesso do Comercial.
          </p>
        )}

        <div className="rounded-lg border border-border p-3 text-[12px] space-y-2">
          <p className="font-medium">Clientes das carteiras</p>
          <p className="text-muted-foreground">
            {lacunas ? <><strong className="text-foreground">{lacunas.semCarteira}</strong> de {lacunas.total} clientes estão no Histórico. </> : null}
            Atribua em lote em{' '}
            <Link to="/comercial/clientes" className="underline">Cadastro de clientes</Link>
            {' '}(filtro "Sem carteira"). A vendedora também pode trazer para a própria carteira um cliente do Histórico
            na hora de lançar — tirar cliente da carteira de outra pessoa é só do gestor.
          </p>
          {/* A organização inicial (2026-09-29): a planilha de carteiras que a equipe usava fora do
              sistema, de uma vez, com a vendedora de cada carteira. */}
          {podeGerir && (
            <Button size="sm" variant="outline" onClick={() => setImportando(true)}>
              <FileSpreadsheet className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />
              Importar carteiras de planilha
            </Button>
          )}
        </div>
        <ImportarCarteirasDialog open={importando} onOpenChange={setImportando} />
      </CardContent>
    </Card>
  );
}
