# Backup diario do repositorio Helpoint no remoto 'origin'.
#
# 1. Empurra o branch atual (o historico curado por quem trabalha).
# 2. Se a arvore estiver suja, grava um commit de snapshot em backup/AAAA-MM-DD
#    SEM tocar no working tree nem no index — nada do que esta em andamento se
#    perde, e nada do que esta em andamento entra no branch principal.
# 3. Uma linha de log por execucao em .scratch/backup.log
#
# Registro da tarefa agendada (uma vez, num PowerShell aberto na pasta do projeto):
#   $s = Join-Path $PWD 'scripts\backup-diario.ps1'
#   schtasks /create /tn Helpoint-Backup /sc daily /st 12:07 /tr "powershell -NoProfile -ExecutionPolicy Bypass -File $s"
#
# Quando a tarefa falhar sem deixar rastro
# ────────────────────────────────────────
# O log abaixo só registra o que este script alcanca. Se o processo for MORTO
# de fora (foi o que houve em 04/09/2026: resultado -1073741510 = 0xC000013A,
# e nenhuma linha escrita), nem o `catch` roda — o arquivo fica em silencio e
# a falha passa despercebida por um dia.
#
# Quem conta essa parte e o Agendador, mas o canal dele vem DESABILITADO no
# Windows. Ligado aqui em 04/09/2026:
#   wevtutil sl Microsoft-Windows-TaskScheduler/Operational /e:true
# Para ler o historico desta tarefa:
#   wevtutil qe Microsoft-Windows-TaskScheduler/Operational /f:text /rd:true /c:30
#
# Rodar sob demanda, no ambiente real do agendador (nao no seu terminal):
#   schtasks /run /tn Helpoint-Backup
#
# Autenticacao: usa as credenciais que o Git Credential Manager ja guarda nesta
# maquina. Nenhuma chave mora neste arquivo.

$ErrorActionPreference = 'Stop'

$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo

$logDir = Join-Path $repo '.scratch'
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }
$log = Join-Path $logDir 'backup.log'

function Now { Get-Date -Format 'yyyy-MM-dd HH:mm:ss' }

function Write-BackupLog($msg) {
  Add-Content -Path $log -Value "$(Now)  $msg" -Encoding utf8
}

# $ErrorActionPreference = 'Stop' nao pega falha de executavel nativo, entao
# todo git passa por aqui: uma checagem de codigo de saida, sem excecao.
function Invoke-Git {
  $out = & git @args
  if ($LASTEXITCODE -ne 0) { throw "git $($args -join ' ') falhou (exit $LASTEXITCODE)" }
  return $out
}

try {
  $branch = (Invoke-Git rev-parse --abbrev-ref HEAD).Trim()

  Invoke-Git push origin $branch | Out-Null
  $result = "push $branch ok"

  if (Invoke-Git status --porcelain) {
    $snapBranch = 'backup/' + (Get-Date -Format 'yyyy-MM-dd')

    # Index temporario: o commit e montado sem mexer no que o usuario tem staged.
    $env:GIT_INDEX_FILE = Join-Path $repo '.git\backup-index'
    try {
      Invoke-Git read-tree HEAD | Out-Null
      Invoke-Git add -A | Out-Null
      $tree = (Invoke-Git write-tree).Trim()
      if (-not $tree) { throw 'git write-tree devolveu vazio' }
      $commit = (Invoke-Git commit-tree $tree -p HEAD -m "backup automatico $(Now)").Trim()
      if (-not $commit) { throw 'git commit-tree devolveu vazio' }
    } finally {
      Remove-Item $env:GIT_INDEX_FILE -Force -ErrorAction SilentlyContinue
      Remove-Item Env:\GIT_INDEX_FILE
    }

    # --force so alcanca refs/heads/backup/*: o snapshot do dia e substituido se
    # o script rodar de novo no mesmo dia. Nenhum branch de trabalho e tocado.
    Invoke-Git push --force origin "${commit}:refs/heads/$snapBranch" | Out-Null
    $result += "; snapshot $snapBranch $($commit.Substring(0, 7))"
  }

  # Batimento: um commit novo a cada execucao, com a hora no assunto, forcado
  # sobre refs/heads/backup/batimento.
  #
  # E o UNICO sinal que o GitHub enxerga de que este script rodou. Num dia sem
  # commit nenhum o `push` acima nao muda nada no remoto, entao "o repositorio
  # nao mexeu hoje" nao distingue dia quieto de backup morto — e foi
  # exatamente uma falha silenciosa que passou um dia despercebida em
  # 04/09/2026. O log que saberia a verdade mora em .scratch/, que esta no
  # .gitignore e nunca chega ao GitHub.
  #
  # Nao precisa de indice: a arvore e a do proprio HEAD. O --force alcanca so
  # refs/heads/backup/*, como o snapshot acima.
  $tree = (Invoke-Git rev-parse 'HEAD^{tree}').Trim()
  $beat = (Invoke-Git commit-tree $tree -p HEAD -m "batimento do backup $(Now)").Trim()
  if (-not $beat) { throw 'git commit-tree do batimento devolveu vazio' }
  Invoke-Git push --force origin "${beat}:refs/heads/backup/batimento" | Out-Null
  $result += '; batimento ok'

  Write-BackupLog $result
} catch {
  Write-BackupLog "ERRO: $($_.Exception.Message)"
  exit 1
}
