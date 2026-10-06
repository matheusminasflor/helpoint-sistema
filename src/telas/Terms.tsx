import { ArrowLeft } from 'lucide-react';

/**
 * Os Termos de Uso — a PRIMEIRA tela do passo 2 do porte (leva L, 2026-09-26).
 *
 * ELA NÃO IMPORTA MAIS O ROTEADOR, e é isso que a torna portável. O `<Link to="/">`
 * do `react-router-dom` virou `<a href="/">`: numa página que é só texto e cujo
 * único laço é um "Voltar", navegação no cliente não ganha nada — e o `<a>`
 * funciona igual nos dois mundos, sob o Vite e sob o Next.
 *
 * Com isso ela virou **componente de servidor** em `app/termos/page.tsx`: o HTML
 * chega pronto, com zero JavaScript. É o ganho concreto do porte, e não uma
 * promessa — o `next build` mostra a rota `/termos` como estática.
 *
 * E É A REGRA QUE O PASSO 2 SEGUE, tela por tela: **uma tela vira rota do Next
 * quando deixa de precisar do roteador.** Enquanto precisar (sessão, `useParams`,
 * `navigate`), ela fica na rota coringa — que é onde as outras 106 estão.
 *
 * O `/termos` do `react-router` continua existindo e continua funcionando: os dois
 * builds coexistem neste passo, e quem entra pelo Vite vê a mesma tela.
 */
export default function Terms() {
  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b border-border bg-card">
        <div className="max-w-3xl mx-auto px-6 h-16 flex items-center gap-3">
          <a
            href="/"
            className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-primary min-h-11"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden="true" /> Voltar
          </a>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="font-display text-3xl font-extrabold text-foreground mb-2">Termos de Uso</h1>
        <p className="text-sm text-muted-foreground mb-8">Última atualização: {new Date().getFullYear()}</p>

        <div className="space-y-6 text-[16px] leading-relaxed text-foreground/80">
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
