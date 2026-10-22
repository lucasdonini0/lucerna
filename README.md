# lucerna

App de foco em Go. *Lucerna* é "lamparina" em latim, a luz que se acendia para
trabalhar à noite.

Pomodoro, timer e stopwatch com sessões Normal, Deep Work e Gaming, tarefas que
contam o tempo de foco, despertador e histórico.

vai funcionar em macos quando eu comprar um mac

## Build no Windows

Execute `wails build` na pasta do projeto. O build fecha a versão aberta, remove
`build/bin/lucerna.exe` (e o antigo `pomodoro.exe`, se existir) e cria um novo
executável. Se o app não fechar normalmente, o build para antes de remover o
arquivo.

As configurações, tarefas, histórico e despertadores ficam em
`%APPDATA%\pomodoro\data.json`. O caminho continua o mesmo de quando o app se
chamava pomodoro, e o arquivo não é apagado pelo build, então a nova versão
carrega os dados já salvos.
