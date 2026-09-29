// Configurações da TI — a aba Chamados do molde de todo setor (LEVA P), mais o que é só da TI:
// as categorias do inventário, contratos, licenças e manutenções, os checklists e os alertas.
//
// Até a LEVA P esta tela tinha uma CÓPIA inteira do gerenciador de categorias (300 linhas),
// com o botão "Formulário" só em chamados, e uma aba "SLA e Prazos" que misturava a tabela de
// prazos da empresa com os alertas da TI. As categorias agora são o `CategoryManager` de todo
// setor; os prazos, o `PrazosDeAtendimento`; os alertas, `AlertasTab`.
import { useState } from 'react';
import { Bell, Boxes, CheckSquare, Monitor } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ConfiguracaoDoSetor } from '@/components/configuracoes/ConfiguracaoDoSetor';
import { CategoryManager } from '@/components/ti/CategoryManager';
import { ChecklistTemplatesTab } from '@/components/ti/ChecklistTemplatesTab';
import { AlertasTab } from '@/components/ti/AlertasTab';

const CADASTROS = [
  { modulo: 'inventory', rotulo: 'Inventário' },
  { modulo: 'contracts', rotulo: 'Contratos' },
  { modulo: 'licenses', rotulo: 'Licenças' },
  { modulo: 'maintenances', rotulo: 'Manutenções' },
] as const;

// As sub-abas (Inventário, Contratos…) são navegação: esta aba se trava sozinha, pelo
// `readOnly` do gerenciador, em vez do fieldset do molde (que desligaria as sub-abas também).
function CategoriasDosCadastros({ podeEditar }: { podeEditar: boolean }) {
  const [qual, setQual] = useState<(typeof CADASTROS)[number]['modulo']>('inventory');
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Categorias do inventário e dos cadastros</CardTitle>
        <CardDescription>Como a TI agrupa equipamentos, contratos, licenças e manutenções.</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={qual} onValueChange={(v) => setQual(v as typeof qual)}>
          <TabsList className="mb-4">
            {CADASTROS.map((c) => <TabsTrigger key={c.modulo} value={c.modulo}>{c.rotulo}</TabsTrigger>)}
          </TabsList>
          {CADASTROS.map((c) => (
            <TabsContent key={c.modulo} value={c.modulo}>
              <CategoryManager module={c.modulo} readOnly={!podeEditar} emptyLabel={c.rotulo.toLowerCase()} />
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  );
}

export default function TIConfiguracoes() {
  return (
    <ConfiguracaoDoSetor
      label="TI"
      icon={Monitor}
      modulo="tickets"
      nomeNaFrase="a TI"
      abas={[
        {
          valor: 'cadastros', permissao: 'cadastros', rotulo: 'Inventário e cadastros', icone: Boxes,
          conteudo: (pode) => <CategoriasDosCadastros podeEditar={pode} />,
        },
        { valor: 'checklists', permissao: 'checklists', rotulo: 'Checklists', icone: CheckSquare, conteudo: <ChecklistTemplatesTab /> },
        { valor: 'alertas', permissao: 'alertas', rotulo: 'Alertas', icone: Bell, conteudo: <AlertasTab /> },
      ]}
    />
  );
}
