import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export default function Terms() {
  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b border-border bg-card">
        <div className="max-w-3xl mx-auto px-6 h-16 flex items-center gap-3">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-primary min-h-11"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden="true" /> Voltar
          </Link>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="font-display text-3xl font-extrabold text-foreground mb-2">Termos de Uso</h1>
        <p className="text-sm text-muted-foreground mb-8">Última atualização: {new Date().getFullYear()}</p>

        <div className="space-y-6 text-[15px] leading-relaxed text-foreground/80">
          <section>
            <h2 className="text-lg font-bold text-foreground mb-2">1. Sobre o serviço</h2>
            <p>O Helpoint é uma plataforma de gestão de atendimento e operação corporativa que reúne chamados de TI, Qualidade/SAC, Marketing e RH, inventário, contratos, base de conhecimento e a assistente de inteligência artificial Lyra.</p>
          </section>
          <section>
            <h2 className="text-lg font-bold text-foreground mb-2">2. Conta e responsabilidade</h2>
            <p>Cada empresa é responsável pelos usuários que cadastra, pelo conteúdo que registra na plataforma e pela guarda das credenciais de acesso. Contas podem ser suspensas em caso de uso indevido.</p>
          </section>
          <section>
            <h2 className="text-lg font-bold text-foreground mb-2">3. Dados e privacidade</h2>
            <p>Os dados de cada empresa são isolados logicamente e acessíveis apenas por usuários autorizados daquela empresa. Todas as ações relevantes são registradas em trilha de auditoria.</p>
          </section>
          <section>
            <h2 className="text-lg font-bold text-foreground mb-2">4. Inteligência artificial</h2>
            <p>Os recursos de IA geram sugestões e resumos a partir dos dados da própria empresa. As respostas são apoio à decisão e devem ser revisadas por uma pessoa responsável antes de qualquer ação crítica.</p>
          </section>
          <section>
            <h2 className="text-lg font-bold text-foreground mb-2">5. Disponibilidade e alterações</h2>
            <p>Buscamos disponibilidade contínua do serviço, com janelas de manutenção comunicadas previamente sempre que possível. Estes termos podem ser atualizados; mudanças relevantes serão informadas na plataforma.</p>
          </section>
          <section>
            <h2 className="text-lg font-bold text-foreground mb-2">6. Contato</h2>
            <p>Dúvidas sobre estes termos: <a className="text-primary font-medium underline underline-offset-2" href="mailto:contato@helpoint.com.br">contato@helpoint.com.br</a>.</p>
          </section>
        </div>
      </main>
    </div>
  );
}
