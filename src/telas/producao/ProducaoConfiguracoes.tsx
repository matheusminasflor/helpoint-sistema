import { Factory } from 'lucide-react';
import { ConfiguracaoDoSetor } from '@/components/configuracoes/ConfiguracaoDoSetor';

// Produção: setor de atendimento (decisão do dono, 2026-10-02) — categorias, prazos e automações
// dos chamados.
export default function ProducaoConfiguracoes() {
  return <ConfiguracaoDoSetor label="Produção" icon={Factory} modulo="producao" nomeNaFrase="a Produção" />;
}
