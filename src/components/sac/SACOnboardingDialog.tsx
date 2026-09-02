import { useEffect, useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import {
  FilePlus2,
  Hash,
  Mail,
  BookOpen,
  Star,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  customerName?: string;
  tenantId?: string;
  userId?: string;
  /** Marca onboarded_at no perfil quando true (1º acesso). */
  persistSeen?: boolean;
}

const STORAGE_KEY = (uid?: string) => `sac_onboarding_seen_${uid || 'guest'}`;

export function markOnboardingSeen(userId?: string) {
  try {
    localStorage.setItem(STORAGE_KEY(userId), '1');
  } catch {}
}
export function hasSeenOnboarding(userId?: string) {
  try {
    return localStorage.getItem(STORAGE_KEY(userId)) === '1';
  } catch {
    return false;
  }
}

export function SACOnboardingDialog({
  open,
  onClose,
  customerName,
  tenantId,
  userId,
  persistSeen,
}: Props) {
  const [step, setStep] = useState(0);
  const [tenantName, setTenantName] = useState<string>('');

  useEffect(() => {
    if (!open || !tenantId) return;
    supabase
      .from('tenants')
      .select('name')
      .eq('id', tenantId)
      .maybeSingle()
      .then(({ data }) => setTenantName(data?.name || ''));
  }, [open, tenantId]);

  useEffect(() => {
    if (open) setStep(0);
  }, [open]);

  const steps = [
    {
      icon: Sparkles,
      title: customerName
        ? `Seja bem-vindo(a), ${customerName.split(' ')[0]}!`
        : 'Seja bem-vindo(a)!',
      headline: tenantName
        ? `Este é o canal oficial de atendimento da ${tenantName}.`
        : 'Este é o canal oficial de atendimento ao cliente.',
      body:
        'Aqui você abre solicitações, acompanha o andamento e conversa com nossa equipe — tudo em um só lugar. Vamos te guiar em poucos passos.',
    },
    {
      icon: FilePlus2,
      title: 'Como abrir um chamado',
      headline: 'Conte o que aconteceu de forma simples.',
      body:
        'Escolha o produto, descreva o problema com suas palavras, anexe fotos do produto e a nota fiscal de compra. Quanto mais detalhes, mais rápido conseguimos resolver.',
    },
    {
      icon: Hash,
      title: 'Seu número de protocolo',
      headline: 'Cada chamado recebe um código único — ex.: SAC-00042.',
      body:
        'Esse número aparece no topo de cada chamado e na lista "Meus Chamados". Use-o sempre que precisar mencionar a sua solicitação.',
    },
    {
      icon: Mail,
      title: 'Notificações por e-mail',
      headline: 'Avisamos você por e-mail a cada resposta da equipe.',
      body:
        'Importante: o aviso vem por e-mail, mas a resposta completa fica aqui no painel — basta entrar com seu acesso e ler dentro do chamado. Assim mantemos seu histórico seguro e organizado.',
      highlight: true,
    },
    {
      icon: BookOpen,
      title: 'Base de Conhecimento',
      headline: 'Antes de abrir um chamado, dê uma olhada nos tutoriais.',
      body:
        'Muitas dúvidas são resolvidas em segundos com nossos guias e perguntas frequentes. Você acessa pelo botão "Tutoriais" no topo da página.',
    },
    {
      icon: Star,
      title: 'Sua avaliação importa',
      headline: 'Ao final do atendimento, você avalia como foi.',
      body:
        'Pedimos uma nota e um comentário curto. Isso nos ajuda a melhorar continuamente o atendimento e a qualidade dos produtos.',
    },
  ];

  const current = steps[step];
  const isLast = step === steps.length - 1;
  const Icon = current.icon;
  const progress = ((step + 1) / steps.length) * 100;

  const finish = async () => {
    markOnboardingSeen(userId);
    if (persistSeen && userId) {
      await supabase
        .from('customer_profiles')
        .update({ onboarded_at: new Date().toISOString() })
        .eq('user_id', userId);
    }
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && finish()}>
      <DialogContent className="max-w-lg p-0 overflow-hidden">
        <div className="bg-primary/5 px-6 pt-6 pb-4 border-b">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center">
              <Icon className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
                Passo {step + 1} de {steps.length}
              </p>
              <h2 className="text-lg font-bold leading-tight">{current.title}</h2>
            </div>
          </div>
          <Progress value={progress} className="h-1" />
        </div>

        <div className="px-6 py-6 space-y-3">
          <p className="text-[15px] font-medium text-foreground">{current.headline}</p>
          <p
            className={`text-sm leading-relaxed ${
              current.highlight
                ? 'bg-amber-50 border border-amber-200 text-amber-900 rounded-md p-3'
                : 'text-muted-foreground'
            }`}
          >
            {current.body}
          </p>
        </div>

        <div className="px-6 py-4 border-t flex items-center justify-between bg-surface-1/40">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Voltar
          </Button>
          <button
            type="button"
            onClick={finish}
            className="text-xs text-muted-foreground hover:text-foreground underline"
          >
            Pular
          </button>
          {isLast ? (
            <Button size="sm" onClick={finish}>
              <CheckCircle2 className="w-4 h-4 mr-1" />
              Começar a usar
            </Button>
          ) : (
            <Button size="sm" onClick={() => setStep((s) => s + 1)}>
              Próximo
              <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
