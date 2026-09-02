import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent } from '@/components/ui/card';
import { Users, Building2, Eye } from 'lucide-react';
import { POPVisibilityType } from '@/hooks/usePOPs';

// Standard departments list
const DEPARTMENTS = [
  { id: 'ti', label: 'TI' },
  { id: 'rh', label: 'RH' },
  { id: 'comercial', label: 'Comercial' },
  { id: 'marketing', label: 'Marketing' },
  { id: 'financeiro', label: 'Financeiro' },
  { id: 'producao', label: 'Produção' },
  { id: 'expedicao', label: 'Expedição' },
  { id: 'qualidade', label: 'Qualidade' },
  { id: 'educacional', label: 'Educacional' },
  { id: 'diretoria', label: 'Diretoria' },
];

interface VisibilitySelectorProps {
  visibilityType: POPVisibilityType;
  visibilityDepartments: string[];
  onVisibilityTypeChange: (type: POPVisibilityType) => void;
  onDepartmentsChange: (departments: string[]) => void;
}

export function VisibilitySelector({
  visibilityType,
  visibilityDepartments,
  onVisibilityTypeChange,
  onDepartmentsChange,
}: VisibilitySelectorProps) {
  const handleDepartmentToggle = (dept: string) => {
    if (visibilityDepartments.includes(dept)) {
      onDepartmentsChange(visibilityDepartments.filter(d => d !== dept));
    } else {
      onDepartmentsChange([...visibilityDepartments, dept]);
    }
  };

  return (
    <div className="space-y-4">
      <Label className="text-base flex items-center gap-2">
        <Eye className="h-4 w-4" />
        Visibilidade
      </Label>
      <p className="text-sm text-muted-foreground">
        Quem pode ver este artigo?
      </p>

      <RadioGroup
        value={visibilityType}
        onValueChange={(value) => onVisibilityTypeChange(value as POPVisibilityType)}
        className="space-y-3"
      >
        {/* All users */}
        <Card className={`cursor-pointer transition-colors ${visibilityType === 'all' ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}>
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <RadioGroupItem value="all" id="visibility-all" className="mt-1" />
              <div className="flex-1">
                <Label htmlFor="visibility-all" className="flex items-center gap-2 cursor-pointer font-medium">
                  <Users className="h-4 w-4 text-primary" />
                  Todos os usuários
                </Label>
                <p className="text-sm text-muted-foreground mt-1">
                  Qualquer pessoa da empresa pode visualizar
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Specific departments */}
        <Card className={`cursor-pointer transition-colors ${visibilityType === 'departments' ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}>
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <RadioGroupItem value="departments" id="visibility-departments" className="mt-1" />
              <div className="flex-1">
                <Label htmlFor="visibility-departments" className="flex items-center gap-2 cursor-pointer font-medium">
                  <Building2 className="h-4 w-4 text-primary" />
                  Setores específicos
                </Label>
                <p className="text-sm text-muted-foreground mt-1">
                  Apenas usuários destes departamentos
                </p>
                
                {visibilityType === 'departments' && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-4 pt-4 border-t">
                    {DEPARTMENTS.map((dept) => (
                      <div key={dept.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={`dept-${dept.id}`}
                          checked={visibilityDepartments.includes(dept.id)}
                          onCheckedChange={() => handleDepartmentToggle(dept.id)}
                        />
                        <Label
                          htmlFor={`dept-${dept.id}`}
                          className="text-sm font-normal cursor-pointer"
                        >
                          {dept.label}
                        </Label>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Viewers only */}
        <Card className={`cursor-pointer transition-colors ${visibilityType === 'viewers_only' ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}>
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <RadioGroupItem value="viewers_only" id="visibility-viewers" className="mt-1" />
              <div className="flex-1">
                <Label htmlFor="visibility-viewers" className="flex items-center gap-2 cursor-pointer font-medium">
                  <Eye className="h-4 w-4 text-primary" />
                  Apenas Leitores (externos)
                </Label>
                <p className="text-sm text-muted-foreground mt-1">
                  Para usuários convidados exclusivamente para acessar a base de conhecimento
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </RadioGroup>

      {visibilityType === 'departments' && visibilityDepartments.length === 0 && (
        <p className="text-sm text-destructive">
          Selecione pelo menos um setor para que usuários possam visualizar o artigo.
        </p>
      )}
    </div>
  );
}
