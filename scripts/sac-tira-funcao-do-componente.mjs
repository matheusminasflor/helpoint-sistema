import { readFileSync, writeFileSync } from 'node:fs';
const F = 'src/components/sac/CamposDoFormulario.tsx';
let s = readFileSync(F, 'utf8');
const ini = s.indexOf('export interface CampoDoSAC {'), fim = s.indexOf("const TIPO_DO_INPUT");
if (ini < 0 || fim < 0) throw new Error('trecho não achado');
s = s.slice(0, ini) + "const opcoesDe = (c: CampoDoSAC): string[] => (Array.isArray(c.options) ? (c.options as unknown[]).map(String) : []);\n\n" + s.slice(fim);
s = s.replace("import { Textarea } from '@/components/ui/textarea';", "import { Textarea } from '@/components/ui/textarea';\nimport type { CampoDoSAC, RespostasDoSAC } from '@/lib/campos-do-sac';");
writeFileSync(F, s);
const P = 'src/telas/sac/PublicForm.tsx';
let p = readFileSync(P, 'utf8');
p = p.replace("import { CamposDoFormulario, faltandoNoSAC, type CampoDoSAC, type RespostasDoSAC } from '@/components/sac/CamposDoFormulario';",
  "import { CamposDoFormulario } from '@/components/sac/CamposDoFormulario';\nimport { faltandoNoSAC, type CampoDoSAC, type RespostasDoSAC } from '@/lib/campos-do-sac';");
writeFileSync(P, p);
console.log('ok');
