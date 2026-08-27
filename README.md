# Portal Trilha — casca nativa

Envelopa o portal web num app. **Toda mudança no `portal.php` chega ao app sem
republicar na loja** — o app carrega a URL, não arquivos locais.

## Estrutura

```
perfis/          um JSON por empresa: nome, URL, cores, telefone
www/             telas locais (hoje só a de sem-internet)
scripts/         montar.js gera o projeto de um perfil
build/{perfil}/  GERADO. Descartável, nunca edite direto.
```

## Gerar

```bash
npm install
node scripts/montar.js zaaz
cd build/zaaz && npm install && npx cap add android
npx cap open android
```

## Versionamento

`versionName` sai do `package.json` da raiz. `versionCode` é **derivado**:

```
1.4.0  ->  10400
1.4.1  ->  10401
1.5.0  ->  10500
```

Derivar em vez de manter dois números evita subir na loja com `versionCode`
repetido — a Play Store recusa, e a descoberta acontece no fim da publicação.

Para subir a versão:

```bash
npm run versao:correcao   # 1.0.0 -> 1.0.1  correção
npm run versao:menor      # 1.0.1 -> 1.1.0  funcionalidade
npm run versao:maior      # 1.1.0 -> 2.0.0  mudança grande
```

Depois regere os perfis. Os dois apps sobem de versão juntos — se quiser
versões independentes, o número precisa sair do JSON do perfil.

## Decisões

**Sem login próprio.** O app abre o portal e o login acontece no WebView, com o
cookie de sessão. Duplicar autenticação significaria manter duas — e as duas
divergiriam.

**Sessão de 30 dias no app**, 12 horas no navegador. Quem abre o app espera
estar dentro; relogin a cada 12h faria o app parecer quebrado. No navegador a
sessão curta protege máquina compartilhada.

**Navegação restrita ao domínio do portal.** Link malicioso injetado não leva o
WebView para fora, e o cookie de sessão não sai do app.

**A tela de sem-internet traz o telefone gravado no build.** É o único momento
em que o app não consegue ler o portal — buscar o número na rede seria circular.

## Pendências

**O `?p=` na URL da ZaaZ é temporário.** Quando `portal.zaaztelecom.com.br`
rotear até o tenant, troque no JSON e o parâmetro sai de vez — inclusive do
`portal.php`, onde a `api()` precisa repassá-lo em toda chamada.

**Push** exige FCM, tabela de dispositivos e ligação com `portal_notificacoes`.

**iOS exige macOS** para gerar. Android roda em qualquer lugar.

**Os `applicationId`** precisam bater com os apps já publicados, se a ideia for
substituí-los. Identificador diferente vira app novo, e ninguém recebe como
atualização.
