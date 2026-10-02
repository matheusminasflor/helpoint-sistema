import { PackageCheck } from 'lucide-react';
import { ConfiguracaoDoSetor } from '@/components/configuracoes/ConfiguracaoDoSetor';

// Expedição é setor de atendimento desde 2026-10-02 (decisão do dono): a separação de lotes e a
// etiqueta saíram; ficam as configurações dos chamados (categorias, prazos e automações).
export default function ExpedicaoConfiguracoes() {
  return <ConfiguracaoDoSetor label="Expedição" icon={PackageCheck} modulo="expedicao" nomeNaFrase="a Expedição" />;
}
