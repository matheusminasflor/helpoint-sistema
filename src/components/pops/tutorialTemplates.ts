import { POPBlock, generateBlockId } from '@/types/pop-blocks';
import { 
  Key, 
  Printer, 
  Wifi, 
  Network, 
  Lock, 
  Monitor, 
  Video,
  FileText
} from 'lucide-react';

export interface TutorialTemplate {
  id: string;
  name: string;
  description: string;
  icon: React.ElementType;
  category?: string;
  subcategory?: string;
  keywords: string[];
  blocks: Omit<POPBlock, 'id'>[];
}

export const TUTORIAL_TEMPLATES: TutorialTemplate[] = [
  {
    id: 'password-reset',
    name: 'Reset de Senha',
    description: 'Artigo completo sobre redefinição de senhas',
    icon: Key,
    category: 'Acesso/Permissões',
    keywords: ['senha', 'password', 'reset', 'esqueci', 'redefinir', 'trocar senha'],
    blocks: [
      // INTRODUÇÃO
      { type: 'heading', level: 1, content: 'Como Redefinir Sua Senha de Acesso' },
      { 
        type: 'text', 
        content: 'Esqueceu sua senha ou precisa alterá-la por motivos de segurança? Este tutorial mostra como redefinir sua senha de acesso aos sistemas corporativos em poucos minutos.'
      },
      { type: 'image', content: '', imageUrl: '', caption: 'Adicione uma imagem da tela de login ou do processo de reset' },
      
      { type: 'divider', content: '' },
      
      // QUANDO USAR
      { type: 'heading', level: 2, content: 'Quando você deve redefinir sua senha?' },
      {
        type: 'list',
        content: '',
        listItems: [
          'Esqueceu a senha atual',
          'Recebeu notificação de expiração de senha',
          'Suspeita de acesso não autorizado à sua conta',
          'Política de segurança exige troca periódica'
        ]
      },
      
      { type: 'divider', content: '' },
      
      // PASSO A PASSO
      { type: 'heading', level: 2, content: 'Passo a passo' },
      { type: 'step', stepNumber: 1, content: 'Acesse a página de login do sistema' },
      { type: 'step', stepNumber: 2, content: 'Clique no link "Esqueci minha senha" abaixo do botão de login' },
      { type: 'image', content: '', imageUrl: '', caption: 'Screenshot do link "Esqueci minha senha"' },
      { type: 'step', stepNumber: 3, content: 'Digite seu e-mail corporativo no campo indicado' },
      { type: 'step', stepNumber: 4, content: 'Clique em "Enviar" e verifique sua caixa de entrada' },
      { type: 'tip', content: 'Verifique também a pasta de spam se não encontrar o e-mail em alguns minutos' },
      { type: 'step', stepNumber: 5, content: 'Abra o e-mail recebido e clique no link de redefinição' },
      { type: 'step', stepNumber: 6, content: 'Crie uma nova senha seguindo os requisitos de segurança' },
      
      { type: 'divider', content: '' },
      
      // REQUISITOS DE SENHA
      { type: 'heading', level: 2, content: 'Requisitos para uma senha segura' },
      {
        type: 'list',
        content: '',
        listItems: [
          'Mínimo de 8 caracteres',
          'Pelo menos uma letra maiúscula (A-Z)',
          'Pelo menos uma letra minúscula (a-z)',
          'Pelo menos um número (0-9)',
          'Recomendado: caractere especial (!@#$%)'
        ]
      },
      { type: 'alert', content: 'O link de redefinição expira em 24 horas. Se expirar, solicite um novo link.' },
      { type: 'error', content: 'Nunca use a mesma senha de outros sites ou redes sociais pessoais' },
      
      { type: 'divider', content: '' },
      
      { type: 'success', content: 'Pronto! Sua senha foi alterada com sucesso. Você já pode fazer login com a nova senha.' },
    ],
  },
  {
    id: 'printer-setup',
    name: 'Configuração de Impressora',
    description: 'Tutorial ilustrado para configurar impressoras de rede',
    icon: Printer,
    category: 'Hardware',
    keywords: ['impressora', 'printer', 'imprimir', 'papel', 'configurar', 'instalar'],
    blocks: [
      // INTRODUÇÃO
      { type: 'heading', level: 1, content: 'Como Configurar uma Impressora de Rede' },
      { 
        type: 'text', 
        content: 'Configurar uma impressora de rede pode parecer complicado, mas com os passos certos você consegue fazer isso em poucos minutos. Neste tutorial, vamos mostrar como adicionar uma impressora compartilhada ao seu computador Windows.'
      },
      { type: 'image', content: '', imageUrl: '', caption: 'Adicione uma imagem ilustrativa da impressora ou do processo' },
      
      { type: 'divider', content: '' },
      
      // O QUE VOCÊ VAI PRECISAR
      { type: 'heading', level: 2, content: 'O que você vai precisar' },
      { 
        type: 'list', 
        content: '',
        listItems: [
          'Computador conectado à rede da empresa',
          'Nome ou IP da impressora (solicite ao TI se não souber)',
          'Permissões de administrador no computador'
        ]
      },
      
      { type: 'divider', content: '' },
      
      // PASSO A PASSO
      { type: 'heading', level: 2, content: 'Passo a passo' },
      { type: 'step', stepNumber: 1, content: 'Abra o Painel de Controle do Windows (pressione Win+R e digite "control")' },
      { type: 'image', content: '', imageUrl: '', caption: 'Screenshot do Painel de Controle' },
      
      { type: 'step', stepNumber: 2, content: 'Clique em "Dispositivos e Impressoras" ou "Ver dispositivos e impressoras"' },
      { type: 'step', stepNumber: 3, content: 'Clique em "Adicionar uma impressora" no menu superior' },
      { type: 'step', stepNumber: 4, content: 'Selecione "A impressora que eu quero não está listada"' },
      { type: 'image', content: '', imageUrl: '', caption: 'Tela de adicionar impressora' },
      
      { type: 'step', stepNumber: 5, content: 'Escolha "Selecionar uma impressora compartilhada pelo nome" e digite o caminho da impressora' },
      { type: 'tip', content: 'O caminho geralmente segue o formato: \\\\servidor\\nome-impressora' },
      { type: 'step', stepNumber: 6, content: 'Clique em "Avançar" e aguarde a instalação dos drivers' },
      { type: 'step', stepNumber: 7, content: 'Marque a opção "Definir como impressora padrão" se desejado' },
      
      { type: 'divider', content: '' },
      
      // DICAS
      { type: 'heading', level: 2, content: 'Dicas úteis' },
      { type: 'tip', content: 'Use o atalho Win+R e digite "control printers" para acessar rapidamente as impressoras' },
      { type: 'tip', content: 'Faça um teste de impressão para confirmar que está tudo funcionando' },
      { type: 'alert', content: 'Certifique-se de estar conectado à rede da empresa (via cabo ou Wi-Fi corporativo)' },
      
      { type: 'divider', content: '' },
      
      { type: 'success', content: 'Pronto! Sua impressora foi configurada e está pronta para uso. Faça um teste imprimindo uma página.' },
    ],
  },
  {
    id: 'vpn-setup',
    name: 'Configuração de VPN',
    description: 'Guia completo para acesso remoto via VPN',
    icon: Wifi,
    category: 'Rede',
    keywords: ['vpn', 'acesso remoto', 'home office', 'conexão', 'trabalho remoto'],
    blocks: [
      // INTRODUÇÃO
      { type: 'heading', level: 1, content: 'Como Configurar a VPN para Trabalho Remoto' },
      { 
        type: 'text', 
        content: 'A VPN (Rede Privada Virtual) permite que você acesse os sistemas da empresa de forma segura quando estiver fora do escritório. Este tutorial explica como instalar e configurar o acesso VPN no seu computador.'
      },
      { type: 'image', content: '', imageUrl: '', caption: 'Adicione uma imagem do aplicativo VPN ou diagrama de conexão' },
      
      { type: 'divider', content: '' },
      
      // PRÉ-REQUISITOS
      { type: 'heading', level: 2, content: 'Antes de começar' },
      {
        type: 'list',
        content: '',
        listItems: [
          'Liberação de acesso VPN aprovada pelo seu gestor',
          'Computador com sistema operacional atualizado',
          'Conexão de internet estável',
          'Credenciais corporativas válidas'
        ]
      },
      { type: 'alert', content: 'O acesso VPN precisa ser solicitado e aprovado antes de usar. Se você ainda não tem, abra um chamado de TI.' },
      
      { type: 'divider', content: '' },
      
      // INSTALAÇÃO
      { type: 'heading', level: 2, content: 'Instalação do cliente VPN' },
      { type: 'step', stepNumber: 1, content: 'Baixe o cliente VPN fornecido pelo TI (link no e-mail de boas-vindas ou portal interno)' },
      { type: 'step', stepNumber: 2, content: 'Execute o instalador e siga as instruções na tela' },
      { type: 'step', stepNumber: 3, content: 'Reinicie o computador se solicitado pelo instalador' },
      { type: 'image', content: '', imageUrl: '', caption: 'Screenshot do instalador' },
      
      { type: 'divider', content: '' },
      
      // CONEXÃO
      { type: 'heading', level: 2, content: 'Como conectar' },
      { type: 'step', stepNumber: 4, content: 'Abra o aplicativo da VPN (ícone na bandeja do sistema ou menu Iniciar)' },
      { type: 'step', stepNumber: 5, content: 'Digite seu usuário e senha corporativos' },
      { type: 'step', stepNumber: 6, content: 'Clique em "Conectar" e aguarde a conexão ser estabelecida' },
      { type: 'image', content: '', imageUrl: '', caption: 'Tela de login da VPN' },
      { type: 'tip', content: 'A conexão VPN mostra um ícone verde quando está ativa. Procure na bandeja do sistema.' },
      
      { type: 'divider', content: '' },
      
      // DICAS E SEGURANÇA
      { type: 'heading', level: 2, content: 'Boas práticas' },
      { type: 'tip', content: 'Desconecte a VPN quando não estiver usando para melhorar sua velocidade de internet' },
      { type: 'tip', content: 'Conecte-se via cabo de rede para uma conexão mais estável' },
      { type: 'alert', content: 'Nunca compartilhe suas credenciais de VPN com terceiros ou familiares' },
      { type: 'error', content: 'Não use a VPN em redes Wi-Fi públicas (cafés, aeroportos) sem proteção adicional' },
      
      { type: 'divider', content: '' },
      
      { type: 'success', content: 'Você está conectado! Agora pode acessar os sistemas da empresa remotamente como se estivesse no escritório.' },
    ],
  },
  {
    id: 'network-issue',
    name: 'Problema de Rede/Internet',
    description: 'Diagnóstico e solução de problemas de conexão',
    icon: Network,
    category: 'Rede',
    keywords: ['internet', 'rede', 'wifi', 'conexão', 'lento', 'sem internet', 'caiu'],
    blocks: [
      // INTRODUÇÃO
      { type: 'heading', level: 1, content: 'Como Resolver Problemas de Conexão com a Internet' },
      { 
        type: 'text', 
        content: 'Está sem internet ou com conexão lenta? Na maioria das vezes, problemas de rede podem ser resolvidos com algumas verificações simples. Este tutorial mostra os passos para diagnosticar e resolver os problemas mais comuns.'
      },
      
      { type: 'divider', content: '' },
      
      // CHECKLIST RÁPIDO
      { type: 'heading', level: 2, content: 'Verificação rápida' },
      {
        type: 'list',
        content: '',
        listItems: [
          'O cabo de rede está conectado corretamente?',
          'O Wi-Fi está ativado no seu computador?',
          'Outros colegas também estão com problema?',
          'Você consegue acessar sites fora da empresa?'
        ]
      },
      
      { type: 'divider', content: '' },
      
      // PASSO A PASSO
      { type: 'heading', level: 2, content: 'Passos para solução' },
      { type: 'step', stepNumber: 1, content: 'Verifique se o cabo de rede está conectado corretamente ou se o Wi-Fi está ativado' },
      { type: 'tip', content: 'Observe se a luz do conector de rede está piscando - isso indica atividade' },
      { type: 'step', stepNumber: 2, content: 'Reinicie o computador para limpar configurações de rede em cache' },
      { type: 'step', stepNumber: 3, content: 'Abra o Prompt de Comando (Win+R, digite "cmd") e execute os comandos abaixo:' },
      { type: 'code', content: 'ipconfig /release\nipconfig /renew\nipconfig /flushdns' },
      { type: 'image', content: '', imageUrl: '', caption: 'Screenshot do Prompt de Comando' },
      { type: 'step', stepNumber: 4, content: 'Teste a conexão acessando um site como google.com' },
      { type: 'tip', content: 'Você pode verificar sua conexão com o comando: ping google.com' },
      
      { type: 'divider', content: '' },
      
      // AVISOS
      { type: 'heading', level: 2, content: 'Importante' },
      { type: 'alert', content: 'Se o problema persistir após esses passos, pode ser uma falha no servidor ou equipamento de rede' },
      { type: 'error', content: 'Não tente reiniciar equipamentos de rede como switches ou roteadores - isso pode afetar outros usuários' },
      
      { type: 'divider', content: '' },
      
      { type: 'success', content: 'Se a conexão voltou, você pode continuar trabalhando normalmente. Se persistir, abra um chamado de TI.' },
    ],
  },
  {
    id: 'system-access',
    name: 'Solicitação de Acesso',
    description: 'Como solicitar acesso a sistemas internos',
    icon: Lock,
    category: 'Software',
    keywords: ['acesso', 'permissão', 'sistema', 'liberação', 'autorização', 'login'],
    blocks: [
      // INTRODUÇÃO
      { type: 'heading', level: 1, content: 'Como Solicitar Acesso a Sistemas Internos' },
      { 
        type: 'text', 
        content: 'Precisa de acesso a um novo sistema ou funcionalidade? Este tutorial explica o processo de solicitação e aprovação de acessos aos sistemas corporativos.'
      },
      
      { type: 'divider', content: '' },
      
      // TIPOS DE ACESSO
      { type: 'heading', level: 2, content: 'Tipos de acesso disponíveis' },
      {
        type: 'list',
        content: '',
        listItems: [
          'Leitura - Apenas visualizar informações',
          'Edição - Criar e modificar registros',
          'Aprovação - Autorizar operações de outros usuários',
          'Administrador - Acesso completo ao sistema'
        ]
      },
      { type: 'tip', content: 'Solicite apenas o nível de acesso necessário para suas atividades' },
      
      { type: 'divider', content: '' },
      
      // PROCESSO
      { type: 'heading', level: 2, content: 'Passo a passo da solicitação' },
      { type: 'step', stepNumber: 1, content: 'Identifique qual sistema você precisa acessar e o tipo de acesso necessário' },
      { type: 'step', stepNumber: 2, content: 'Converse com seu gestor para obter aprovação prévia' },
      { type: 'step', stepNumber: 3, content: 'Abra um chamado de TI selecionando a categoria "Acesso/Permissões"' },
      { type: 'image', content: '', imageUrl: '', caption: 'Screenshot do formulário de solicitação' },
      { type: 'step', stepNumber: 4, content: 'Preencha o nome do sistema e o tipo de acesso necessário (leitura, edição, admin)' },
      { type: 'step', stepNumber: 5, content: 'Inclua uma justificativa clara explicando por que você precisa desse acesso' },
      { type: 'step', stepNumber: 6, content: 'Aguarde a aprovação do seu gestor e do responsável pelo sistema' },
      
      { type: 'divider', content: '' },
      
      // PRAZO
      { type: 'heading', level: 2, content: 'Prazo de atendimento' },
      { type: 'text', content: 'O prazo para liberação de acessos é de até 48 horas úteis após todas as aprovações. Acessos urgentes podem ser priorizados mediante justificativa.' },
      { type: 'alert', content: 'Acessos são concedidos apenas para funções que necessitam deles. Solicite apenas o necessário.' },
      
      { type: 'divider', content: '' },
      
      { type: 'success', content: 'Após a aprovação, você receberá um e-mail com as instruções de acesso ao sistema.' },
    ],
  },
  {
    id: 'system-usage',
    name: 'Uso de Sistema Corporativo',
    description: 'Manual básico de uso dos sistemas da empresa',
    icon: Monitor,
    category: 'Software',
    keywords: ['sistema', 'erp', 'software', 'corporativo', 'usar', 'acessar', 'funcionalidade'],
    blocks: [
      // INTRODUÇÃO
      { type: 'heading', level: 1, content: 'Guia de Uso do [Nome do Sistema]' },
      { 
        type: 'text', 
        content: 'Este guia apresenta as funcionalidades básicas do sistema corporativo. Siga as instruções para aprender a navegar e realizar as operações do dia a dia.'
      },
      { type: 'image', content: '', imageUrl: '', caption: 'Adicione uma imagem da tela inicial do sistema' },
      
      { type: 'divider', content: '' },
      
      // PRIMEIRO ACESSO
      { type: 'heading', level: 2, content: 'Primeiro acesso' },
      { type: 'step', stepNumber: 1, content: 'Acesse o sistema pelo navegador ou atalho na área de trabalho' },
      { type: 'step', stepNumber: 2, content: 'Faça login com suas credenciais corporativas (mesmo usuário e senha do e-mail)' },
      { type: 'image', content: '', imageUrl: '', caption: 'Tela de login' },
      { type: 'step', stepNumber: 3, content: 'Na primeira vez, altere sua senha temporária seguindo as instruções' },
      { type: 'tip', content: 'Favoritos podem ser criados para acessar rapidamente as funções mais usadas' },
      
      { type: 'divider', content: '' },
      
      // NAVEGAÇÃO
      { type: 'heading', level: 2, content: 'Navegando pelo sistema' },
      { type: 'step', stepNumber: 4, content: 'Use o menu principal (lateral ou superior) para encontrar as funcionalidades' },
      { type: 'step', stepNumber: 5, content: 'Campos obrigatórios são marcados com asterisco (*) - preencha todos antes de salvar' },
      { type: 'step', stepNumber: 6, content: 'Sempre clique em "Salvar" ou "Confirmar" ao final das operações' },
      { type: 'tip', content: 'Use a tecla F1 ou o ícone de ajuda (?) para acessar a documentação específica de cada tela' },
      
      { type: 'divider', content: '' },
      
      // AVISOS
      { type: 'heading', level: 2, content: 'Cuidados importantes' },
      { type: 'alert', content: 'Nunca compartilhe suas credenciais de acesso com colegas' },
      { type: 'alert', content: 'Faça logout ao sair do computador, especialmente em áreas compartilhadas' },
      { type: 'error', content: 'Não feche o navegador durante processamentos longos - isso pode causar perda de dados' },
      
      { type: 'divider', content: '' },
      
      { type: 'success', content: 'Você já sabe o básico! Explore as funcionalidades e consulte a ajuda do sistema quando tiver dúvidas.' },
    ],
  },
  {
    id: 'online-meeting',
    name: 'Reuniões Online',
    description: 'Guia para criar e participar de videoconferências',
    icon: Video,
    category: 'Software',
    subcategory: 'Comunicação',
    keywords: ['reunião', 'meeting', 'teams', 'zoom', 'videoconferência', 'online', 'meet', 'chamada'],
    blocks: [
      // INTRODUÇÃO
      { type: 'heading', level: 1, content: 'Como Criar e Participar de Reuniões Online' },
      { 
        type: 'text', 
        content: 'Videoconferências fazem parte do dia a dia de trabalho. Este tutorial ensina como agendar, iniciar e participar de reuniões virtuais usando Teams, Zoom ou Google Meet.'
      },
      { type: 'image', content: '', imageUrl: '', caption: 'Adicione uma imagem do aplicativo de videoconferência' },
      
      { type: 'divider', content: '' },
      
      // CRIAR REUNIÃO
      { type: 'heading', level: 2, content: 'Criando uma reunião' },
      { type: 'step', stepNumber: 1, content: 'Abra o aplicativo de videoconferência (Microsoft Teams, Zoom ou Google Meet)' },
      { type: 'step', stepNumber: 2, content: 'Clique em "Nova Reunião" ou "Agendar"' },
      { type: 'step', stepNumber: 3, content: 'Defina o título, data e horário da reunião' },
      { type: 'step', stepNumber: 4, content: 'Adicione os participantes digitando seus e-mails' },
      { type: 'image', content: '', imageUrl: '', caption: 'Tela de agendamento de reunião' },
      { type: 'step', stepNumber: 5, content: 'Adicione uma descrição ou pauta da reunião (recomendado)' },
      { type: 'step', stepNumber: 6, content: 'Clique em "Enviar" ou "Agendar" para disparar os convites' },
      { type: 'tip', content: 'Adicione uma pauta na descrição para manter a reunião objetiva e produtiva' },
      
      { type: 'divider', content: '' },
      
      // PARTICIPAR
      { type: 'heading', level: 2, content: 'Participando de uma reunião' },
      { type: 'step', stepNumber: 7, content: 'Clique no link da reunião no convite de calendário' },
      { type: 'step', stepNumber: 8, content: 'Escolha se deseja entrar com vídeo e áudio ativados' },
      { type: 'step', stepNumber: 9, content: 'Clique em "Entrar" ou "Participar da reunião"' },
      { type: 'tip', content: 'Teste seu microfone e câmera antes da reunião clicando em "Verificar dispositivos"' },
      
      { type: 'divider', content: '' },
      
      // BOAS PRÁTICAS
      { type: 'heading', level: 2, content: 'Boas práticas em reuniões' },
      {
        type: 'list',
        content: '',
        listItems: [
          'Entre 2-3 minutos antes do horário marcado',
          'Mantenha-se em mudo quando não estiver falando',
          'Use um fundo virtual ou neutro se necessário',
          'Evite ambientes com muito ruído ou movimentação'
        ]
      },
      { type: 'alert', content: 'Verifique seu microfone e câmera antes de iniciar - problemas técnicos são comuns' },
      
      { type: 'divider', content: '' },
      
      { type: 'success', content: 'Os participantes receberão o convite por e-mail com o link da reunião!' },
    ],
  },
  {
    id: 'onboarding',
    name: 'Onboarding de Novo Colaborador',
    description: 'Checklist completo para o primeiro dia de trabalho',
    icon: FileText,
    category: 'Admissional',
    keywords: ['onboarding', 'novo colaborador', 'primeiro dia', 'admissão', 'boas-vindas'],
    blocks: [
      { type: 'heading', level: 1, content: 'Boas-vindas! Seu Primeiro Dia' },
      { type: 'text', content: 'Parabéns por fazer parte da equipe! Este guia vai ajudar você a configurar tudo que precisa para começar a trabalhar.' },
      { type: 'divider', content: '' },
      { type: 'heading', level: 2, content: 'Checklist do Primeiro Dia' },
      { type: 'list', content: '', listItems: ['Retirar crachá na portaria', 'Conhecer sua estação de trabalho', 'Configurar email corporativo', 'Acessar os sistemas necessários', 'Conhecer a equipe'] },
      { type: 'divider', content: '' },
      { type: 'heading', level: 2, content: 'Configurando seu Acesso' },
      { type: 'step', stepNumber: 1, content: 'Acesse o email corporativo em outlook.office.com' },
      { type: 'step', stepNumber: 2, content: 'Use o usuário e senha temporários fornecidos pelo RH' },
      { type: 'step', stepNumber: 3, content: 'Altere sua senha no primeiro acesso' },
      { type: 'tip', content: 'Anote a nova senha em local seguro!' },
      { type: 'divider', content: '' },
      { type: 'success', content: 'Bem-vindo(a) à equipe! Bom trabalho!' },
    ],
  },
  {
    id: 'offboarding',
    name: 'Offboarding - Desligamento',
    description: 'Procedimentos para desligamento de colaborador',
    icon: FileText,
    category: 'Demissional',
    keywords: ['offboarding', 'desligamento', 'demissão', 'saída', 'devolução'],
    blocks: [
      { type: 'heading', level: 1, content: 'Procedimento de Desligamento' },
      { type: 'text', content: 'Este guia apresenta os procedimentos necessários para o desligamento de colaboradores, garantindo a segurança das informações e devolução dos equipamentos.' },
      { type: 'divider', content: '' },
      { type: 'heading', level: 2, content: 'Checklist de Devolução' },
      { type: 'list', content: '', listItems: ['Notebook/computador', 'Crachá de acesso', 'Chaves e cartões', 'Celular corporativo', 'Equipamentos periféricos'] },
      { type: 'alert', content: 'Todos os equipamentos devem ser devolvidos limpos e em bom estado' },
      { type: 'divider', content: '' },
      { type: 'heading', level: 2, content: 'Revogação de Acessos' },
      { type: 'step', stepNumber: 1, content: 'RH comunica TI sobre o desligamento' },
      { type: 'step', stepNumber: 2, content: 'TI desativa acessos a sistemas e email' },
      { type: 'step', stepNumber: 3, content: 'Backup de arquivos importantes é realizado' },
      { type: 'error', content: 'Acessos são revogados imediatamente após o comunicado' },
      { type: 'divider', content: '' },
      { type: 'success', content: 'Procedimento concluído. Desejamos sucesso na nova jornada!' },
    ],
  },
  {
    id: 'security',
    name: 'Segurança da Informação',
    description: 'Boas práticas de segurança digital',
    icon: Lock,
    category: 'Segurança',
    keywords: ['segurança', 'phishing', 'vírus', 'malware', 'proteção', 'dados'],
    blocks: [
      { type: 'heading', level: 1, content: 'Boas Práticas de Segurança da Informação' },
      { type: 'text', content: 'A segurança da informação é responsabilidade de todos. Siga estas orientações para proteger seus dados e os da empresa.' },
      { type: 'divider', content: '' },
      { type: 'heading', level: 2, content: 'Senhas Seguras' },
      { type: 'list', content: '', listItems: ['Use senhas com no mínimo 8 caracteres', 'Combine letras, números e símbolos', 'Não reutilize senhas entre sistemas', 'Nunca compartilhe suas credenciais'] },
      { type: 'divider', content: '' },
      { type: 'heading', level: 2, content: 'Cuidado com Phishing' },
      { type: 'alert', content: 'Desconfie de emails pedindo dados pessoais ou senhas' },
      { type: 'tip', content: 'Verifique sempre o remetente antes de clicar em links' },
      { type: 'error', content: 'Nunca baixe anexos de remetentes desconhecidos' },
      { type: 'divider', content: '' },
      { type: 'heading', level: 2, content: 'Proteção do Equipamento' },
      { type: 'step', stepNumber: 1, content: 'Mantenha o antivírus sempre atualizado' },
      { type: 'step', stepNumber: 2, content: 'Bloqueie o computador ao se ausentar (Win+L)' },
      { type: 'step', stepNumber: 3, content: 'Não instale programas sem autorização do TI' },
      { type: 'divider', content: '' },
      { type: 'success', content: 'Segurança é um hábito. Pratique todos os dias!' },
    ],
  },
  {
    id: 'blank',
    name: 'Template em Branco',
    description: 'Comece do zero com estrutura básica sugerida',
    icon: FileText,
    keywords: [],
    blocks: [
      { type: 'heading', level: 1, content: '' },
      { type: 'text', content: '' },
      { type: 'divider', content: '' },
      { type: 'heading', level: 2, content: 'Antes de começar' },
      { type: 'list', content: '', listItems: ['Item 1', 'Item 2', 'Item 3'] },
      { type: 'divider', content: '' },
      { type: 'heading', level: 2, content: 'Passo a passo' },
      { type: 'step', stepNumber: 1, content: '' },
      { type: 'step', stepNumber: 2, content: '' },
      { type: 'step', stepNumber: 3, content: '' },
      { type: 'divider', content: '' },
      { type: 'success', content: 'Parabéns! Você concluiu o procedimento.' },
    ],
  },
];

export function getTemplateById(id: string): TutorialTemplate | undefined {
  return TUTORIAL_TEMPLATES.find(t => t.id === id);
}

export function applyTemplate(template: TutorialTemplate): {
  title: string;
  category: string;
  subcategory: string;
  keywords: string[];
  blocks: POPBlock[];
} {
  return {
    title: template.id === 'blank' ? '' : template.name,
    category: template.category || '',
    subcategory: template.subcategory || '',
    keywords: [...template.keywords],
    blocks: template.blocks.map(block => ({
      ...block,
      id: generateBlockId(),
    })),
  };
}
