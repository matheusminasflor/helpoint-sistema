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
// UMA PORTA PARA CADA COISA (2026-10-01, decisão do dono, que achou confuso ter importar, novo
// cliente e pedidos de cliente novo aqui): esta tela é para CONSULTAR e COMPLETAR os clientes.
// Criar cliente é Configurações › Cadastro de clientes (com permissão); cliente novo se pede por
// chamado. A aba "Pedidos de cliente novo" (a fila) saiu.
import { IdCard } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { ListaDeCadastro } from '@/components/comercial/ListaDeCadastro';

export default function ComercialCadastroClientes() {
  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title="Cadastro de clientes"
        description="Consulte e complete CNPJ, contato, endereço e carteira. O que o Forteplus manda volta a cada importação."
        icon={IdCard}
      />
      <div className="p-4 sm:p-6">
        <ListaDeCadastro />
      </div>
    </div>
  );
}
