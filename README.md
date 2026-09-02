# Helpoint Saas

**Contexto e Arquitetura:**
"Analise o arquivo PDF anexo que descreve o **HELPOINT**, um Sistema Operacional Corporativo Unificado. Este sistema deve ser construído com arquitetura **Multi-tenant** rigorosa.

1. **Isolamento de Dados:** Cada empresa (cliente) que contratar o sistema deve ter seus dados 100% isolados. Use o Supabase como backend e implemente **Row Level Security (RLS)** baseado em um `tenant_id`. Um usuário de uma empresa jamais deve ter acesso, via API ou UI, a dados de outra empresa.
2. 
**Escalabilidade:** A estrutura de tabelas deve ser pensada para suportar os 11 módulos descritos, desde o Inventário de TI até o SAC Externo.



**Diretrizes de Design (Anti-Padrão Lovable):**

1. **Estética Industrial e Técnica:** Fuja completamente do layout padrão do Lovable. Não use bordas arredondadas. Aplique `border-radius: 0px !important` em todos os botões, cards, inputs e modais.
2. **Alta Densidade:** Quero uma interface de 'alta densidade de dados', estilo painéis de controle profissionais ou sistemas ERP modernos. Use divisores de 1px em vez de sombras para separar elementos.
3. **Tipografia e Cores:** Use uma paleta de cores sóbria (Dark Mode por padrão com acentos em cores sólidas para status). Use fontes monoespaçadas para IDs e valores técnicos.

**Módulo Inicial (Sprint 1):**
Construa o **Shell do Sistema** e a **'Secretária Inteligente'** (Core da IA).

* Ao logar, o usuário deve ver a 'Curadoria Diária' que lê tickets e prazos para priorizar o dia.


* Implemente o **'Modo Foco'**, que esconde a navegação e foca apenas na tarefa prioritária #1.


* O menu lateral deve ser dividido nos 3 'Mundos' descritos na documentação: Gestão de Demandas, Conhecimento e Gestão/Controle.



**Regras de Ouro:**

* Siga a regra de 'Zero Planilhas': o sistema deve ser autossuficiente.


* Garanta 'Auditoria Total': toda ação no banco de dados deve registrar quem, quando e o quê.

Pode começar gerando a estrutura de autenticação e o layout base com estas restrições de design?"

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://helpoint.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/fa1f50f2-ca4a-4161-adb7-43044e77fb7c).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
