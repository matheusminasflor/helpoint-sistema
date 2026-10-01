// Configurações › Cadastro de clientes (2026-10-01, decisão do dono).
//
// O único lugar onde se cria cliente: a mesma lista do Comercial (`ListaDeCadastro`), com o botão
// "Novo cliente". Quem entra é dono/admin ou quem tem `comercial.clientes.cadastrar` no perfil — a
// mesma regra que o banco aplica no INSERT de `com_clientes`
// (migration 20261119050000_cadastrar_cliente_com_permissao).
import { IdCard } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { ListaDeCadastro } from '@/components/comercial/ListaDeCadastro';

export default function ConfiguracoesClientes() {
  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title="Cadastro de clientes"
        description="Cadastre cliente novo e complete os que existem. Cliente novo que a equipe pede chega por chamado do Comercial."
        icon={IdCard}
      />
      <div className="p-4 sm:p-6">
        <ListaDeCadastro podeCriar />
      </div>
    </div>
  );
}
