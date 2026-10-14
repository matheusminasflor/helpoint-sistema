// O que cada caixinha do perfil de acesso libera, em linguagem de quem usa (dono, 2026-10-13: "a matriz de
// permissões ter como informativo do que seria as permissões"). As de chamado têm texto próprio (são as
// mesmas em todo setor); as outras são montadas pelo tipo da ação e o nome da tela.

const DE_CHAMADO: Record<string, string> = {
  view_all: 'Vê TODOS os chamados do setor na fila, de qualquer atendente. Sem ela, a pessoa vê só os dela e os que ainda não têm atendente.',
  assume: 'Pega um chamado sem atendente para si e atende. Responder um chamado sem atendente também assume.',
  change_status: 'Muda o status do chamado (Em andamento, Pendente…). Resolver e reabrir são caixinhas à parte.',
  close: 'Resolve o chamado (e cancela). Quem pediu é avisado e pode avaliar o atendimento.',
  reopen: 'Reabre um chamado que já foi resolvido.',
  transfer: 'Passa o chamado para outra pessoa — inclusive de outro setor. O prazo recomeça para quem recebe.',
  change_priority: 'Muda a urgência e o prazo do chamado, e agenda (quando tratar).',
  change_category: 'Troca a categoria do chamado por outra do mesmo setor.',
  internal_notes: 'Escreve nota interna: só a equipe vê, quem pediu não.',
  delete: 'Apaga o chamado de vez, com a conversa e os anexos. Não tem volta.',
  repassar_ausencias: 'Recebe o aviso quando alguém do setor fica fora 2 dias ou mais (férias, atestado) e escolhe quem assume as demandas dessa pessoa.',
};

export function explicacaoDaPermissao(modulo: { key: string; label: string }, acao: { key: string; label: string }): string {
  const tela = modulo.label;
  if (modulo.key === 'tickets' && DE_CHAMADO[acao.key]) return DE_CHAMADO[acao.key];
  if (tela.startsWith('Configurações ›')) {
    return acao.key === 'view'
      ? 'Abre esta aba da configuração do setor, só para olhar.'
      : 'Muda as configurações desta aba. Vale para o setor todo.';
  }
  switch (acao.key) {
    case 'view': return `Abre a tela "${tela}" e vê o que tem nela.`;
    case 'create': return `Cria novos registros em "${tela}".`;
    case 'edit':
      return /criar/i.test(acao.label) ? `Cria e altera o que está em "${tela}".` : `${acao.label} em "${tela}".`;
    case 'delete': return `Apaga registros de "${tela}". Não tem volta.`;
    case 'export': return `Baixa os dados de "${tela}" (planilha ou PDF).`;
    case 'import': case 'importar': return `Sobe uma planilha para "${tela}".`;
    case 'approve': return `Aprova ou recusa em "${tela}" — é a decisão que libera o próximo passo.`;
    case 'publish': return `${acao.label}: põe no ar (ou tira) o que está em "${tela}" para a empresa ver.`;
    case 'assign_users': return 'Diz quem usa cada perfil de acesso — dá ou tira acesso das pessoas.';
    case 'view_team_metrics': return 'Vê os números de cada pessoa da equipe, não só os próprios.';
    default: return `Libera "${acao.label}" em "${tela}".`;
  }
}
