import { ModuloRelatorios } from '@/telas/modulo/ModuloRelatorios';

// Os indicadores dos chamados internos da Qualidade, iguais aos dos outros setores (dono, 2026-10-06).
// O painel dos SACs de clientes é outro (`QualidadeDashboard`).
export default function QualidadeRelatorios() {
  return (
    <ModuloRelatorios
      module="qualidade"
      label="Qualidade"
      titulo="Indicadores da Qualidade"
      subtitle="Chamados que os outros setores abrem para a Qualidade: laudos, análises, não conformidades e dúvidas."
      tutorial="qualidade-atendimento"
    />
  );
}
