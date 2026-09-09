import {
  Monitor,
  Megaphone,
  CheckSquare,
  Users,
  Banknote,
  Handshake,
  GraduationCap,
  Lock
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface Department {
  id: string;
  sector: string;
  name: string;
  icon: React.ReactNode;
  enabled: boolean;
  description: string;
}

const departments: Department[] = [
  { id: 'ti', sector: '01', name: 'TI', icon: <Monitor strokeWidth={1.5} className="w-7 h-7" />, enabled: true, description: 'Suporte técnico e infraestrutura' },
  { id: 'marketing', sector: '02', name: 'Marketing', icon: <Megaphone strokeWidth={1.5} className="w-7 h-7" />, enabled: true, description: 'Artistas, eventos e redes sociais' },
  { id: 'qualidade', sector: '03', name: 'Qualidade', icon: <CheckSquare strokeWidth={1.5} className="w-7 h-7" />, enabled: true, description: 'SAC e controle de qualidade' },
  { id: 'rh', sector: '04', name: 'RH', icon: <Users strokeWidth={1.5} className="w-7 h-7" />, enabled: true, description: 'Pessoas, férias, benefícios e folha' },
  { id: 'financeiro', sector: '05', name: 'Financeiro', icon: <Banknote strokeWidth={1.5} className="w-7 h-7" />, enabled: true, description: 'Compras, reembolsos e pagamentos' },
  { id: 'comercial', sector: '06', name: 'Comercial', icon: <Handshake strokeWidth={1.5} className="w-7 h-7" />, enabled: true, description: 'Orçamentos, pedidos, pós-venda e cadastro de clientes' },
  { id: 'educacional', sector: '07', name: 'Educacional', icon: <GraduationCap strokeWidth={1.5} className="w-7 h-7" />, enabled: true, description: 'Treinamentos internos e de clientes, certificados' },
];

interface DepartmentGridProps {
  onSelectDepartment: (departmentId: string) => void;
}

export function DepartmentGrid({ onSelectDepartment }: DepartmentGridProps) {
  const handleClick = (dept: Department) => {
    if (dept.enabled) {
      onSelectDepartment(dept.id);
    } else {
      toast.info(`${dept.name} - Em breve`, {
        description: 'Este departamento ainda não está disponível no sistema.'
      });
    }
  };

  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground mb-1">Selecione o Departamento</h1>
        <p className="text-sm text-muted-foreground">
          Escolha o setor responsável pelo atendimento da sua solicitação
        </p>
      </div>

      {/* Department Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {departments.map((dept) => (
          <button
            key={dept.id}
            onClick={() => handleClick(dept)}
            className={cn(
              "group relative p-5 transition-all duration-200 rounded-xl border text-left",
              "flex flex-col items-center gap-3 text-center",
              dept.enabled 
                ? "bg-card border-border  hover: cursor-pointer" 
                : "bg-background border-border opacity-50 cursor-not-allowed"
            )}
          >
            {/* Sector Number */}
            <span className={cn(
              "absolute top-3 left-3 font-mono text-xs text-muted-foreground",
              dept.enabled && "group-hover:text-primary"
            )}>
              {dept.sector}
            </span>

            {/* Lock overlay for disabled */}
            {!dept.enabled && (
              <div className="absolute top-3 right-3">
                <Lock className="w-3.5 h-3.5 text-muted-foreground" strokeWidth={1.5} />
              </div>
            )}

            {/* Status indicator */}
            {dept.enabled && (
              <div className="absolute top-3 right-3 flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-emerald-500" />
              </div>
            )}

            {/* Icon */}
            <div className={cn(
              "w-14 h-14 flex items-center justify-center rounded-xl",
              dept.enabled 
                ? "bg-primary/10 text-primary group-hover:bg-primary/15 transition-colors" 
                : "bg-surface-1 text-muted-foreground"
            )}>
              {dept.icon}
            </div>

            {/* Label */}
            <div className="space-y-1">
              <span className={cn(
                "text-sm font-semibold block",
                dept.enabled ? "text-foreground group-hover:text-primary" : "text-muted-foreground"
              )}>
                {dept.name}
              </span>
              <p className={cn(
                "text-xs",
                dept.enabled ? "text-muted-foreground" : "text-muted-foreground"
              )}>
                {dept.enabled ? dept.description : 'Em breve'}
              </p>
            </div>
          </button>
        ))}
      </div>

      {/* Legend */}
      <div className="mt-6 pt-4 border-t border-border flex items-center justify-between">
        <div className="flex items-center gap-6 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>Ativo</span>
          </div>
          <div className="flex items-center gap-2">
            <Lock className="w-3 h-3 text-muted-foreground" strokeWidth={1.5} />
            <span>Em breve</span>
          </div>
        </div>
        <span className="text-xs text-muted-foreground">
          {departments.filter(d => d.enabled).length}/{departments.length} ativos
        </span>
      </div>
    </div>
  );
}
