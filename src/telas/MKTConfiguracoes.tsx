import { Megaphone } from 'lucide-react';
import { ConfiguracaoDoSetor } from '@/components/configuracoes/ConfiguracaoDoSetor';

export default function MKTConfiguracoes() {
  return <ConfiguracaoDoSetor label="Marketing" icon={Megaphone} modulo="marketing" nomeNaFrase="o Marketing" />;
}
