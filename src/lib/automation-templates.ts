import type { FlowStep, FlowTrigger } from '@/lib/automation-flow';

/**
 * Modelos de fluxo prontos (CRM-1d): a empresa responde três ou quatro
 * perguntas e o fluxo nasce montado, editável como qualquer outro. É só
 * configuração — quem executa é o motor no banco (migration 20260915010000
 * deu ao motor o `refresh`, o `requester_target`, o `lost_reason` e o passo
 * `create_receivable` de que estes modelos precisam).
 *
 * Decisões do dono (docs/proposta-fluxo-comercial.md, seção 6): chamado no
 * ERP automático pelo fluxo, mas o fluxo é personalizável; conta a receber
 * ligada ou desligada conforme a empresa tenha ERP; prazos do "sem resposta"
 * são da empresa.
 */

export interface TemplateFlow {
  name: string;
  description: string;
  trigger: FlowTrigger;
  steps: FlowStep[];
}

/** Modelo "proposta aceita → cadastro no ERP e cobrança": dois fluxos. */
export interface ErpHandoffParams {
  /** Módulo em que o chamado de cadastro nasce (a TI, normalmente). */
  ticketModule: string;
  /** Categoria do chamado nesse módulo — é por ela que o segundo fluxo reconhece o chamado ao ser resolvido. */
  categoryId: string;
  /** Quem cobra: recebe a tarefa quando o cadastro é concluído. */
  financeUserId: string;
  /** Criar a conta a receber no Financeiro do Helpoint (empresa sem ERP, ou que quer o espelho). */
  createReceivable: boolean;
  /** Vencimento da conta a receber, em dias. */
  receivableDueDays: number;
}

const FICHA = [
  'Cliente: {{trigger.contact.name}}',
  'Empresa: {{trigger.contact.company}}',
  'CPF/CNPJ: {{trigger.contact.document}}',
  'E-mail: {{trigger.contact.email}} · WhatsApp: {{trigger.contact.whatsapp}} · Telefone: {{trigger.contact.phone}}',
  'Cidade/UF: {{trigger.contact.city}}/{{trigger.contact.state}} · Segmento: {{trigger.contact.segment}}',
  '',
  'Pedido #{{trigger.after.number}} — total R$ {{trigger.total_text}}',
  '{{trigger.items_text}}',
  '',
  'Observações do pedido: {{trigger.after.notes}}',
].join('\n');

export function erpHandoffFlows(p: ErpHandoffParams): TemplateFlow[] {
  const steps: FlowStep[] = [
    {
      id: 's1', kind: 'create_ticket', name: 'Chamado de cadastro',
      config: {
        module: p.ticketModule, category_id: p.categoryId, priority: 'medium', requester_target: 'created_by',
        title: 'Cadastrar cliente {{trigger.contact.name}} — pedido #{{trigger.after.number}}',
        description: FICHA,
      },
      next: p.createReceivable ? ['s2'] : ['s3'],
    },
    ...(p.createReceivable
      ? [{ id: 's2', kind: 'create_receivable' as const, name: 'Conta a receber', config: { due_in_days: p.receivableDueDays }, next: ['s3'] }]
      : []),
    {
      id: 's3', kind: 'notify', name: 'Avisar o vendedor',
      config: { target: 'created_by', title: 'Cadastro do cliente pedido à TI', message: 'Pedido #{{trigger.after.number}} de {{trigger.contact.name}}: o chamado de cadastro foi aberto.' },
      next: [],
    },
  ];
  const accepted: TemplateFlow = {
    name: 'Proposta aceita → cadastro do cliente',
    description: 'Quando a proposta é aceita, abre o chamado de cadastro com a ficha do cliente e os itens do pedido' + (p.createReceivable ? ', lança a conta a receber' : '') + ' e avisa o vendedor.',
    trigger: {
      kind: 'record_updated', entity: 'crm_order', fields: ['status'], next: ['s1'],
      filter: { op: 'and', rules: [{ path: 'trigger.after.status', cmp: 'eq', value: 'accepted' }] },
    },
    steps,
  };
  const resolved: TemplateFlow = {
    name: 'Cadastro concluído → cobrar',
    description: 'Quando o chamado de cadastro é resolvido, avisa o vendedor e cria a tarefa de cobrança para o financeiro.',
    trigger: {
      // O fluxo vive no Comercial mas observa o chamado do módulo que faz o cadastro (`ticket_module`).
      kind: 'record_updated', entity: 'ticket', ticket_module: p.ticketModule, fields: ['status'], next: ['s1'],
      filter: { op: 'and', rules: [
        { path: 'trigger.after.status', cmp: 'in', value: ['resolved', 'closed'] },
        { path: 'trigger.after.category_id', cmp: 'eq', value: p.categoryId },
      ] },
    },
    steps: [
      { id: 's1', kind: 'notify', name: 'Avisar o vendedor', config: { target: 'requester', title: 'Cliente cadastrado', message: '{{trigger.after.title}} — pode gerar o pedido.' }, next: ['s2'] },
      { id: 's2', kind: 'create_task', name: 'Tarefa de cobrança', config: { user_id: p.financeUserId, title: 'Cobrar: {{trigger.after.title}}', description: 'Cadastro concluído pela TI. Combine o pagamento com o cliente e marque o pedido como pago no Comercial.', due_in_days: 2, priority: 2 }, next: [] },
    ],
  };
  return [accepted, resolved];
}

/** Modelo "sem resposta": parado na primeira etapa → tarefa; segue parado → perdido. */
export interface NoReplyParams {
  /** Primeira etapa (aberta) do funil escolhido. */
  firstStageId: string;
  /** Etapa "perdido" do mesmo funil. */
  lostStageId: string;
  hoursToFollowUp: number;
  hoursToLose: number;
}

export function noReplyFlow(p: NoReplyParams): TemplateFlow {
  const stillNew = { op: 'and' as const, rules: [{ path: 'trigger.after.stage_id', cmp: 'eq' as const, value: p.firstStageId }] };
  return {
    name: 'Sem resposta → follow-up e perdido',
    description: `Negócio parado na primeira etapa: depois de ${p.hoursToFollowUp} h, tarefa de follow-up para o dono; depois de mais ${p.hoursToLose} h, vai para Perdido.`,
    trigger: {
      kind: 'record_created', entity: 'crm_deal', next: ['s1'],
      // Negócio importado de planilha não conta como "lead sem resposta" (500 linhas antigas virariam 500 perdidos).
      filter: { op: 'and', rules: [
        { path: 'trigger.after.stage_id', cmp: 'eq', value: p.firstStageId },
        { path: 'trigger.after.source', cmp: 'neq', value: 'importacao' },
      ] },
    },
    steps: [
      { id: 's1', kind: 'delay', name: 'Esperar a primeira resposta', config: { hours: p.hoursToFollowUp }, next: ['s2'] },
      { id: 's2', kind: 'condition', name: 'Ainda parado?', config: { refresh: true, filter: stillNew }, next: ['s3'] },
      { id: 's3', kind: 'create_task', name: 'Follow-up', config: { target: 'owner', title: 'Follow-up: {{trigger.after.title}}', description: 'Sem resposta do cliente desde o primeiro contato. Tente de novo.', due_in_days: 1, priority: 2 }, next: ['s4'] },
      { id: 's4', kind: 'delay', name: 'Esperar de novo', config: { hours: p.hoursToLose }, next: ['s5'] },
      { id: 's5', kind: 'condition', name: 'Continua parado?', config: { refresh: true, filter: stillNew }, next: ['s6'] },
      { id: 's6', kind: 'set_stage', name: 'Marcar perdido', config: { stage_id: p.lostStageId, lost_reason: 'Sem resposta' }, next: [] },
    ],
  };
}

/** Modelo "pedido pago → pedido (e nota) no Bling" (CRM-2b): um fluxo. */
export interface BlingNfeParams {
  gerarNfe: boolean;
  enviarNfe: boolean;
}

export function blingNfeFlow(p: BlingNfeParams): TemplateFlow {
  const nota = p.gerarNfe ? (p.enviarNfe ? ' e a NF-e é gerada e transmitida' : ' e a NF-e é gerada para você revisar no Bling') : '';
  return {
    name: 'Pedido pago → pedido no Bling',
    description: `Quando o pedido é pago, o pedido de venda entra no Bling com o cliente e os itens${nota}. O vendedor é avisado.`,
    trigger: {
      kind: 'record_updated', entity: 'crm_order', fields: ['status'], next: ['s1'],
      filter: { op: 'and', rules: [{ path: 'trigger.after.status', cmp: 'eq', value: 'paid' }] },
    },
    steps: [
      { id: 's1', kind: 'bling_order', name: 'Pedido no Bling', config: { gerar_nfe: p.gerarNfe, enviar_nfe: p.enviarNfe }, next: ['s2'], retry: 2 },
      { id: 's2', kind: 'notify', name: 'Avisar o vendedor', config: { target: 'created_by', title: 'Pedido lançado no Bling', message: `Pedido #{{trigger.after.number}} de {{trigger.contact.name}} entrou no Bling${p.gerarNfe ? ' com a NF-e' : ''}.` }, next: [] },
    ],
  };
}

export interface TemplateDef {
  id: 'erp_handoff' | 'no_reply' | 'bling_nfe';
  title: string;
  summary: string;
}

/** Os modelos que a aba "Automações" do Comercial oferece. */
export const COMERCIAL_TEMPLATES: TemplateDef[] = [
  { id: 'erp_handoff', title: 'Proposta aceita → cadastro e cobrança', summary: 'Abre o chamado de cadastro com a ficha pronta, lança a conta a receber (opcional) e, quando a TI conclui, avisa o vendedor e cria a tarefa de cobrança.' },
  { id: 'no_reply', title: 'Sem resposta → follow-up e perdido', summary: 'Negócio parado na primeira etapa vira tarefa de follow-up; se continuar parado, vai para Perdido com o motivo.' },
  { id: 'bling_nfe', title: 'Pedido pago → pedido e nota no Bling', summary: 'Pedido pago entra no Bling como pedido de venda; a NF-e pode ser gerada e transmitida na hora. Precisa da conta do Bling conectada em Nota fiscal.' },
];
