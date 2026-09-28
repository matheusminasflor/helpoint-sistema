// Cadastro de clientes do Comercial — tela própria desde 2026-09-28.
//
// POR QUE SAIU DO INSIGHTS. Ela nasceu como uma aba dentro de
// `ComercialClientes` (a visão "Clientes" do Insights), e o dono apontou:
// *"Cadastro de Cliente não deve ficar no Insights."* Ele está certo, e o motivo é o
// mesmo que separou Compras do Financeiro: **Insights é o que o Comercial MEDE** —
// quem parou de comprar, curva ABC, tendência, cashback. Completar o CNPJ e o
// telefone de 450 clientes é trabalho de CADASTRO. São duas perguntas diferentes,
// feitas por pessoas diferentes, em momentos diferentes; na mesma tela, as duas viram
// "a tela do Comercial" e nenhuma fica boa.
//
// DUAS ABAS (LEVA O, parte 3): os clientes que já existem, e os pedidos de cadastro de
// cliente NOVO — que precisa passar pelo Forteplus antes de existir aqui. A aba vive em
// `?aba=`, para o aviso do sino levar direto aos pedidos.
import { IdCard } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ListaDeCadastro } from '@/components/comercial/ListaDeCadastro';
import { SolicitacoesDeCadastro } from '@/components/comercial/SolicitacoesDeCadastro';
import { useQueryState } from '@/hooks/useQueryState';

export default function ComercialCadastroClientes() {
  const [aba, setAba] = useQueryState('aba', 'clientes');
  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title="Cadastro de clientes"
        description="CNPJ, contato, endereço e carteira. O que o Forteplus manda volta a cada importação; o que está aqui nasce nesta tela."
        icon={IdCard}
      />
      <div className="p-4 sm:p-6">
        <Tabs value={aba} onValueChange={setAba}>
          <TabsList>
            <TabsTrigger value="clientes">Clientes</TabsTrigger>
            <TabsTrigger value="solicitacoes">Pedidos de cliente novo</TabsTrigger>
          </TabsList>
          <TabsContent value="clientes" className="pt-3"><ListaDeCadastro /></TabsContent>
          <TabsContent value="solicitacoes" className="pt-3"><SolicitacoesDeCadastro /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
