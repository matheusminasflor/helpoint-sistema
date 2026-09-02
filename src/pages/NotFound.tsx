import { Link } from "react-router-dom";
import { FileQuestion } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useTenantPath } from "@/hooks/useTenantPath";
import { Button } from "@/components/ui/button";

const NotFound = () => {
  const { user } = useAuth();
  const tenantPath = useTenantPath();

  const destino = user ? tenantPath("/inicio") : "/";
  const rotulo = user ? "Ir para o início" : "Ir para a página inicial";

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
          <FileQuestion className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
        </div>
        <h1 className="mb-2 text-xl font-semibold text-foreground">Página não encontrada</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          O endereço acessado não existe ou foi movido. Verifique o link ou volte para continuar de
          onde parou.
        </p>
        <Button asChild>
          <Link to={destino}>{rotulo}</Link>
        </Button>
      </div>
    </div>
  );
};

export default NotFound;
