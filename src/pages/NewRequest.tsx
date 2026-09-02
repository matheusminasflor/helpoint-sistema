import { useState } from 'react';
import { DepartmentGrid } from '@/components/request/DepartmentGrid';
import { CreateTicketForm } from '@/components/helpdesk/CreateTicketForm';
import { KnowledgePanel } from '@/components/pops/KnowledgePanel';
import { useNavigate } from 'react-router-dom';
import { useTenantPath } from '@/hooks/useTenantPath';
import { ArrowLeft, BookOpen, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { toast } from 'sonner';

type DepartmentId = 'ti' | 'marketing' | 'qualidade' | 'rh' | 'financeiro';

const MODULE_BY_DEPARTMENT: Record<DepartmentId, 'tickets' | 'marketing' | 'qualidade' | 'rh' | 'financeiro'> = {
  ti: 'tickets',
  marketing: 'marketing',
  qualidade: 'qualidade',
  rh: 'rh',
  financeiro: 'financeiro',
};

export default function NewRequest() {
  const [selectedDepartment, setSelectedDepartment] = useState<DepartmentId | null>(null);
  const [knowledgeOpen, setKnowledgeOpen] = useState(false);
  const navigate = useNavigate();
  const tenantPath = useTenantPath();

  const handleDepartmentSelect = (departmentId: string) => {
    setSelectedDepartment(departmentId as DepartmentId);
  };

  const handleBack = () => {
    if (selectedDepartment) {
      setSelectedDepartment(null);
    } else {
      navigate(-1);
    }
  };

  const handleSuccess = () => {
    navigate(tenantPath('/helpdesk'));
  };

  const handlePOPSolved = () => {
    toast.success('Tutorial marcado como solução. Nenhum chamado foi aberto.');
    navigate(tenantPath('/helpdesk'));
  };

  // Show department grid if no department selected
  if (!selectedDepartment) {
    return (
      <div className="min-h-full bg-background">
        <DepartmentGrid onSelectDepartment={handleDepartmentSelect} />
      </div>
    );
  }

  return (
    <div className="min-h-full bg-background">
      {/* Back Button */}
      <div className="border-b border-border/60 bg-card">
        <div className="px-6 lg:px-8 py-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleBack}
            className="gap-2 text-muted-foreground hover:text-foreground rounded-full hover:bg-surface-1"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.5} />
            <span>Voltar</span>
          </Button>
        </div>
      </div>

      <div className="px-6 lg:px-8 py-6">
        {/* Tutoriais — no mobile vira bloco colapsável ACIMA do formulário */}
        <div className="lg:hidden mb-4">
          <Collapsible open={knowledgeOpen} onOpenChange={setKnowledgeOpen}>
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="w-full flex items-center justify-between gap-2 rounded-lg border border-border bg-card px-4 py-3 text-left"
              >
                <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <BookOpen className="w-4 h-4 text-primary" aria-hidden="true" />
                  Tutoriais que podem resolver sem abrir chamado
                </span>
                <ChevronDown
                  className={`w-4 h-4 text-muted-foreground transition-transform ${knowledgeOpen ? 'rotate-180' : ''}`}
                  aria-hidden="true"
                />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3">
              <KnowledgePanel onPOPSolved={handlePOPSolved} />
            </CollapsibleContent>
          </Collapsible>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6 items-start">
          <div>
            <CreateTicketForm
              onSuccess={handleSuccess}
              onCancel={handleBack}
              module={MODULE_BY_DEPARTMENT[selectedDepartment]}
            />
          </div>

          {/* Knowledge Panel — coluna fixa no desktop */}
          <div className="hidden lg:block">
            <div className="sticky top-6">
              <KnowledgePanel onPOPSolved={handlePOPSolved} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
