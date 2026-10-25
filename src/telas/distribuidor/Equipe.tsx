// A equipe do distribuidor (etapa 6; decisão 5: um login por pessoa). Só o responsável convida e tira.
import { Navigate } from 'react-router-dom';
import { useNoPortal } from '@/hooks/useNoPortal';
import { MinhaEquipe } from '@/telas/distribuidor/Portal';

export default function EquipeDoDistribuidor() {
  const { papel, distribuidor } = useNoPortal();
  if (papel !== 'dono') return <Navigate to="/distribuidor" replace />;
  return (
    <>
      <h1 className="text-[24px] font-semibold">Minha equipe</h1>
      <MinhaEquipe distribuidorId={distribuidor.id} />
    </>
  );
}
