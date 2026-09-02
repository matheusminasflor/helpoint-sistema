import { useMemo } from 'react';
import { Check, X } from 'lucide-react';

export type StrengthLevel = 0 | 1 | 2 | 3 | 4;

export function evaluatePassword(pw: string) {
  const checks = {
    length: pw.length >= 12,
    minLength: pw.length >= 8,
    upper: /[A-Z]/.test(pw),
    lower: /[a-z]/.test(pw),
    number: /\d/.test(pw),
    symbol: /[^A-Za-z0-9]/.test(pw),
  };
  let score = 0;
  if (checks.minLength) score++;
  if (checks.length) score++;
  if (checks.upper && checks.lower) score++;
  if (checks.number) score++;
  if (checks.symbol) score++;
  // common weak patterns
  const weak = /^(?:123|senha|password|qwerty|admin|abc|111|000)/i.test(pw) || /^(.)\1+$/.test(pw);
  if (weak) score = Math.min(score, 1);
  const level = (Math.min(4, Math.max(0, score - 1)) as StrengthLevel);
  return { checks, level };
}

const LABELS = ['Muito fraca', 'Fraca', 'Razoável', 'Boa', 'Forte'];
const COLORS = ['bg-monday-red', 'bg-monday-red', 'bg-monday-yellow', 'bg-primary', 'bg-monday-green'];

export function generateStrongPassword(len = 16) {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnpqrstuvwxyz';
  const nums = '23456789';
  const syms = '!@#$%&*?-_=+';
  const all = upper + lower + nums + syms;
  const pick = (s: string) => s[Math.floor(Math.random() * s.length)];
  let pw = pick(upper) + pick(lower) + pick(nums) + pick(syms);
  for (let i = pw.length; i < len; i++) pw += pick(all);
  return pw.split('').sort(() => Math.random() - 0.5).join('');
}

export default function PasswordStrength({ password }: { password: string }) {
  const { checks, level } = useMemo(() => evaluatePassword(password), [password]);
  if (!password) return null;
  return (
    <div className="space-y-2 mt-1">
      <div className="flex gap-1">
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              i <= level ? COLORS[level] : 'bg-muted'
            }`}
          />
        ))}
      </div>
      <p className="text-[11px] font-medium text-muted-foreground">
        Força: <span className="text-foreground">{LABELS[level]}</span>
      </p>
      <ul className="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px]">
        <Req ok={checks.minLength} label="Mínimo 8 caracteres" />
        <Req ok={checks.length} label="12+ caracteres (ideal)" />
        <Req ok={checks.upper && checks.lower} label="Maiúscula e minúscula" />
        <Req ok={checks.number} label="Número" />
        <Req ok={checks.symbol} label="Símbolo (!@#$...)" />
      </ul>
    </div>
  );
}

function Req({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className={`flex items-center gap-1 ${ok ? 'text-monday-green' : 'text-muted-foreground'}`}>
      {ok ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
      {label}
    </li>
  );
}
