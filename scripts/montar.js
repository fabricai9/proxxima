#!/usr/bin/env node
/**
 * scripts/montar.js
 *
 * Monta o projeto Capacitor de UM perfil.
 *
 *   node scripts/montar.js zaaz
 *   node scripts/montar.js padrao
 *
 * ---------------------------------------------------------------------------
 * POR QUE UM PROJETO POR PERFIL
 *
 * Proxxima e ZaaZ são empresas diferentes: cada uma publica seu app, com nome,
 * ícone e identificador próprios. Um app só com escolha de empresa na abertura
 * exporia que são o mesmo sistema — e o cliente de uma veria a marca da outra.
 *
 * O código é o mesmo; muda a configuração. Este script gera build/{perfil}/ a
 * partir do JSON, e o que estiver lá é descartável — nunca edite direto.
 *
 * ---------------------------------------------------------------------------
 * VERSIONAMENTO
 *
 * versionName vem do package.json (ex.: 1.4.0).
 * versionCode é derivado dele: 1.4.0 vira 10400.
 *
 * Derivar em vez de manter dois números evita o erro clássico de subir na loja
 * com versionCode repetido — a Play Store recusa, e a descoberta acontece no
 * fim do processo de publicação.
 *
 * O código cresce sempre: 1.4.0 (10400) < 1.4.1 (10401) < 1.5.0 (10500).
 * Isso comporta até 99 nas posições menor e correção.
 */

const fs   = require('fs');
const path = require('path');

const RAIZ   = path.join(__dirname, '..');
const perfil = process.argv[2];

if (!perfil) {
  console.error('Uso: node scripts/montar.js <perfil>');
  console.error('Perfis disponíveis:',
    fs.readdirSync(path.join(RAIZ, 'perfis')).map(f => f.replace('.json', '')).join(', '));
  process.exit(1);
}

const arqPerfil = path.join(RAIZ, 'perfis', perfil + '.json');
if (!fs.existsSync(arqPerfil)) {
  console.error('Perfil não encontrado:', arqPerfil);
  process.exit(1);
}

const cfg = JSON.parse(fs.readFileSync(arqPerfil, 'utf8'));
const pkg = JSON.parse(fs.readFileSync(path.join(RAIZ, 'package.json'), 'utf8'));

// ---------------------------------------------------------------------------
// Versão
// ---------------------------------------------------------------------------
const partes = String(pkg.version).split('.').map(n => parseInt(n, 10) || 0);
const [maior, menor, correcao] = [partes[0] || 0, partes[1] || 0, partes[2] || 0];

// iOS tem numeração PRÓPRIA, vinda do bloco 'ios' do perfil.
//
// O app da Proxxima foi publicado por outra equipe numa faixa muito acima da
// do Android (400000). Alinhar os dois obrigaria a saltar o Android para o
// mesmo número sem motivo -- cada loja compara só com a versão anterior DELA.
//
// Sem o bloco, cai na numeração do Android, que é o certo para app novo.
const iosVersion = (cfg.ios && cfg.ios.version) || versionName;
const iosBuild   = String((cfg.ios && cfg.ios.build) || versionCode);

if (menor > 99 || correcao > 99) {
  console.error('Versão inválida: menor e correção precisam ser menores que 100.');
  console.error('O versionCode é maior*10000 + menor*100 + correção, e passar de 99 quebra a ordem.');
  process.exit(1);
}

const versionName = `${maior}.${menor}.${correcao}`;
const versionCode = maior * 10000 + menor * 100 + correcao;

// ---------------------------------------------------------------------------
// Saída
// ---------------------------------------------------------------------------
const saida = path.join(RAIZ, 'build', perfil);
fs.rmSync(saida, { recursive: true, force: true });
fs.mkdirSync(path.join(saida, 'www'), { recursive: true });

/** Copia substituindo os marcadores {{CHAVE}}. */
function copiarComSubstituicao(origem, destino, mapa) {
  let txt = fs.readFileSync(origem, 'utf8');
  for (const [k, v] of Object.entries(mapa)) {
    txt = txt.split('{{' + k + '}}').join(v);
  }
  fs.writeFileSync(destino, txt);
}

const substituicoes = {
  URL:             cfg.url,
  COR_PRIMARIA:    cfg.cores.primaria,
  COR_FUNDO:       cfg.cores.fundo,
  TELEFONE:        cfg.suporte.telefone,
  // tel: não aceita espaço nem pontuação.
  TELEFONE_LIMPO:  String(cfg.suporte.telefone).replace(/\D+/g, ''),
  WHATSAPP:        String(cfg.suporte.whatsapp).replace(/\D+/g, ''),
  NOME:            cfg.app.nome,
  EMPRESA:         cfg.empresa,
};

for (const arq of fs.readdirSync(path.join(RAIZ, 'www'))) {
  copiarComSubstituicao(
    path.join(RAIZ, 'www', arq),
    path.join(saida, 'www', arq),
    substituicoes
  );
}

// ---------------------------------------------------------------------------
// capacitor.config.json
// ---------------------------------------------------------------------------
const capacitor = {
  // O Capacitor usa 'appId' para as DUAS plataformas: vira applicationId no
  // build.gradle e PRODUCT_BUNDLE_IDENTIFIER no Xcode.
  //
  // Aqui os dois divergem. O app Android foi publicado como
  // br.com.proxxima.portal e o iOS como br.com.portal.proxxima -- invertidos,
  // por equipes diferentes. Nenhum dos dois pode mudar depois de publicado.
  //
  // Por isso o valor depende da plataforma alvo, passada como 2º argumento:
  //   node scripts/montar.js padrao ios
  appId:   (process.argv[3] === 'ios' && cfg.app.bundleId)
             ? cfg.app.bundleId
             : cfg.app.applicationId,
  appName: cfg.app.nome,
  webDir:  'www',

  // O App-Uuid marca o User-Agent com 'TrilhaApp/...'. É por ele que o portal
  // sabe que está num app e serve o push.js — no navegador aquele arquivo não
  // faria nada, e carregá-lo custaria uma requisição em toda abertura.
  appendUserAgent: cfg.app.userAgent || 'TrilhaApp',

  server: {
    // O app carrega o PORTAL, não arquivos locais. É isso que faz toda mudança
    // no portal.php chegar ao app sem republicar na loja.
    url: cfg.url,
    // Sem cleartext: só https. Permitir http abriria caminho para interceptação
    // numa rede Wi-Fi hostil, que é justamente onde o cliente de ISP está.
    cleartext: false,
    // O portal roda no domínio do tenant. Restringir a navegação a ele impede
    // que um link malicioso injetado leve o WebView para fora — mantendo o
    // cookie de sessão dentro do app.
    allowNavigation: [new URL(cfg.url).host],
    errorPath: 'offline.html',
  },

  android: {
    // O WebView do Android por padrão bloqueia mistura de conteúdo. Mantido.
    allowMixedContent: false,
    backgroundColor: cfg.cores.fundo,
  },

  ios: {
    backgroundColor: cfg.cores.fundo,
    // Barra de rolagem nativa: sem isso o WebView do iOS rola com física
    // diferente do resto do sistema, e o app "parece web".
    scrollEnabled: true,
    contentInset: 'never',

    // O WKWebView bloqueia captura de midia por padrao, MESMO com a permissao
    // declarada no Info.plist. Sem estas duas linhas o botao de gravar audio
    // do chat nao faz nada no iPhone -- e nao da erro nenhum, que e pior:
    // parece que o app travou.
    limitsNavigationsToAppBoundDomains: false,
    allowsInlineMediaPlayback: true,
    mediaTypesRequiringUserActionForPlayback: 'none',
  },

  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: cfg.cores.splash,
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      // Some sozinha: esperar o portal avisar exigiria código dentro dele, e a
      // ideia é o portal não saber que está num app.
      launchAutoHide: true,
    },
    StatusBar: {
      style: 'LIGHT',
      backgroundColor: cfg.cores.barraStatus,
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

fs.writeFileSync(
  path.join(saida, 'capacitor.config.json'),
  JSON.stringify(capacitor, null, 2)
);

// ---------------------------------------------------------------------------
// package.json do build
// ---------------------------------------------------------------------------
fs.writeFileSync(path.join(saida, 'package.json'), JSON.stringify({
  name: `portal-${perfil}`,
  version: versionName,
  private: true,
  dependencies: pkg.dependencies,
}, null, 2));

// ---------------------------------------------------------------------------
// versao.json — lido pelo script de build nativo
// ---------------------------------------------------------------------------
fs.writeFileSync(path.join(saida, 'versao.json'), JSON.stringify({
  perfil,
  empresa: cfg.empresa,
  versionName,
  versionCode,
  iosVersion,
  iosBuild,
  applicationId: cfg.app.applicationId,
  bundleId: cfg.app.bundleId,
  url: cfg.url,

  // Permissoes do Info.plist. Ficam AQUI e nao no workflow porque o texto
  // aparece para o cliente no momento em que o iOS pede autorizacao -- e a
  // Apple rejeita descricao generica tipo "o app precisa da camera".
  //
  // O chat do portal manda texto, audio, imagem e arquivo. Falta de qualquer
  // uma destas quatro reprova na revisao, e a resposta so chega dias depois.
  permissoesIos: {
    NSMicrophoneUsageDescription:
      'Para gravar e enviar mensagens de voz no atendimento.',
    NSCameraUsageDescription:
      'Para tirar foto e enviar no atendimento, como a de um equipamento com problema.',
    NSPhotoLibraryUsageDescription:
      'Para anexar fotos e comprovantes ja salvos no seu aparelho.',
    NSPhotoLibraryAddUsageDescription:
      'Para salvar no seu aparelho comprovantes e boletos baixados no app.',
  },
  geradoEm: new Date().toISOString(),
}, null, 2));

console.log(`
  Perfil       ${cfg.empresa} (${perfil})
  App          ${cfg.app.nome}
  Id           ${cfg.app.applicationId}
  URL          ${cfg.url}
  Versão       ${versionName}  (código ${versionCode})
  Saída        build/${perfil}/

  Próximo passo:
    cd build/${perfil} && npm install && npx cap add android
`);
