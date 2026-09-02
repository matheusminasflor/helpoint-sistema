import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Sanitiza conteúdo removendo formatação markdown e emojis do sistema.
 * Usado para limpar mensagens antigas do banco e respostas de IA.
 */
export function sanitizeContent(text: string): string {
  return text
    // Remove markdown bold **texto**
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    // Remove markdown italic *texto* (não afeta asteriscos isolados)
    .replace(/\*([^*\s][^*]*[^*\s])\*/g, '$1')
    // Remove emojis comuns do sistema
    .replace(/[✅🔄📋⏳🔒❌🔧⏸️🔵▶️📌💬✓🔃➡️⚠️🔴💡]/g, '')
    // Limpar espaços extras
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Sanea o nome do arquivo antes de montar o caminho no Storage:
 * remove diretórios, caracteres perigosos e limita o tamanho (anti path traversal).
 */
export function sanitizeFileName(name: string): string {
  const base = String(name || 'arquivo').split(/[\\/]/).pop() || 'arquivo';
  return (
    base
      .replace(/\.\./g, '.')
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/_{2,}/g, '_')
      .slice(-120) || 'arquivo'
  );
}
