-- O Google divide a mesma reunião em séries e trata cada aula de um módulo como evento solto. O canal passa a ser por
-- nome de reunião. Esta limpeza refaz só a importação inicial de 2026-11-07, que ninguém usou: os canais `reuniao`
-- ainda não têm conversa. O robô traz tudo de novo, agrupado.
delete from public.reuniao_series;
delete from public.chat_channels where tipo = 'reuniao';
