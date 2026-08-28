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

if (menor > 99 || correcao > 99) {
  console.error('Versão inválida: menor e correção precisam ser menores que 100.');
  console.error('O versionCode é maior*10000 + menor*100 + correção, e passar de 99 quebra a ordem.');
  process.exit(1);
}

const versionName = `${maior}.${menor}.${correcao}`;
const versionCode = maior * 10000 + menor * 100 + correcao;

// Android tem numeração PRÓPRIA por perfil, pelo mesmo motivo do iOS: os dois
// apps foram publicados com esquemas diferentes.
//
//   Proxxima -> data no código (202608202)
//   ZaaZ     -> semântico      (130)
//
// Um package.json não serve para os dois. E o versionCode precisa ser MAIOR
// que o publicado: a Play recusa igual ou menor, e o erro aparece no fim do
// envio, depois de todo o processo de build.
const androidVersionName = (cfg.android && cfg.android.versionName) || versionName;
const androidVersionCode = (cfg.android && cfg.android.versionCode) || versionCode;

// iOS tem numeração PRÓPRIA, vinda do bloco 'ios' do perfil.
//
// O app da Proxxima foi publicado por outra equipe numa faixa muito acima da
// do Android (400000). Alinhar os dois obrigaria a saltar o Android para o
// mesmo número sem motivo -- cada loja compara só com a versão anterior DELA.
//
// Precisa vir DEPOIS de versionName/versionCode: const não é içado, e a
// reserva do || quebrava com "Cannot access before initialization" em perfil
// sem bloco 'ios'. Passou despercebido no padrão, onde o bloco existe e o ||
// nem chega a avaliar o outro lado.
const iosVersion = (cfg.ios && cfg.ios.version) || versionName;
const iosBuild   = String((cfg.ios && cfg.ios.build) || versionCode);

// ---------------------------------------------------------------------------
// Saída
// ---------------------------------------------------------------------------
const saida = path.join(RAIZ, 'build', perfil);

// O projeto nativo NÃO é apagado.
//
// A versão anterior removia build/{perfil} inteira, e o comentário no topo
// avisava que o conteúdo era descartável. Na prática cada execução levava
// junto o android/, os ícones gerados e o google-services.json -- e refazer
// isso tomava a maior parte do tempo de cada publicação.
//
// android/ e ios/ são criados pelo Capacitor e mantidos à mão (permissões,
// orientação, chaves). O que este script gera -- www, config, versão -- é
// sobrescrito de qualquer forma.
const preservar = ['android', 'ios', 'node_modules'];

if (fs.existsSync(saida)) {
  for (const item of fs.readdirSync(saida)) {
    if (preservar.includes(item)) { continue; }
    fs.rmSync(path.join(saida, item), { recursive: true, force: true });
  }
}

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
// assets/ — origem dos ícones e da splash
//
// O @capacitor/assets lê daqui para gerar todas as densidades. Sem esta cópia
// era preciso criar a pasta à mão a cada build, e esquecer disso faz o app sair
// com o robô verde do Capacitor no lugar da logo.
//
// O generate NÃO roda aqui: ele depende de android/ já existir, e este script
// roda antes do `cap add android`.
// ---------------------------------------------------------------------------
const origemAssets = path.join(RAIZ, 'assets-' + perfil);

if (fs.existsSync(origemAssets)) {
  const destAssets = path.join(saida, 'assets');
  fs.mkdirSync(destAssets, { recursive: true });
  for (const arq of fs.readdirSync(origemAssets)) {
    fs.copyFileSync(path.join(origemAssets, arq), path.join(destAssets, arq));
  }
} else {
  console.warn('  AVISO  assets-' + perfil + '/ não existe — ícones sairão no padrão do Capacitor.');
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
// travar-orientacao.js — roda DEPOIS do `npx cap add android`
//
// O AndroidManifest.xml só existe depois do `cap add android`, e este script
// roda antes — além de apagar build/{perfil} inteira. Por isso a trava não
// pode ser escrita aqui: ela vira um script auxiliar, gerado junto.
//
// Não usa plugin. `android:screenOrientation="portrait"` é atributo nativo da
// activity; um plugin de orientação traria pacote novo, pod novo no iOS e mais
// uma peça para dar errado.
//
// O iOS é travado pelo codemagic.yaml, no Info.plist.
// ---------------------------------------------------------------------------
const travador = `#!/usr/bin/env node
/**
 * Trava o app em retrato. Rode DEPOIS de \`npx cap add android\`:
 *
 *   node travar-orientacao.js
 *
 * Gerado por scripts/montar.js. Não edite aqui — edite lá.
 */
const fs = require('fs');
const path = require('path');

const manifesto = path.join(__dirname, 'android', 'app', 'src', 'main', 'AndroidManifest.xml');

if (!fs.existsSync(manifesto)) {
  console.error('AndroidManifest.xml não encontrado.');
  console.error('Rode \`npx cap add android\` antes.');
  process.exit(1);
}

let xml = fs.readFileSync(manifesto, 'utf8');

if (xml.includes('android:screenOrientation')) {
  console.log('Orientação já estava travada.');
  process.exit(0);
}

// Entra na activity principal, junto do configChanges que o Capacitor já põe.
const antes = xml;
xml = xml.replace(
  /(<activity\b[^>]*android:name="\.MainActivity")/,
  '$1\n            android:screenOrientation="portrait"'
);

if (xml === antes) {
  console.error('Não achei a MainActivity no manifesto. Nada foi alterado.');
  process.exit(1);
}

fs.writeFileSync(manifesto, xml);
console.log('Orientação travada em retrato.');
`;

fs.writeFileSync(path.join(saida, 'travar-orientacao.js'), travador);

// ---------------------------------------------------------------------------
// package.json do build
// ---------------------------------------------------------------------------
fs.writeFileSync(path.join(saida, 'package.json'), JSON.stringify({
  name: `portal-${perfil}`,
  version: androidVersionName,
  private: true,
  dependencies: pkg.dependencies,
}, null, 2));

// ---------------------------------------------------------------------------
// versao.json — lido pelo script de build nativo
// ---------------------------------------------------------------------------
fs.writeFileSync(path.join(saida, 'versao.json'), JSON.stringify({
  perfil,
  empresa: cfg.empresa,
  // Os nomes ficam 'versionName'/'versionCode' porque e assim que o Gradle e
  // os scripts de build ja os leem. O valor e que passou a vir do perfil.
  versionName: androidVersionName,
  versionCode: androidVersionCode,
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
  URL          ${cfg.url}
  Id Android   ${cfg.app.applicationId}
  Id iOS       ${cfg.app.bundleId || '(mesmo do Android)'}
  Android      ${androidVersionName}  (código ${androidVersionCode})
  iOS          ${iosVersion}  (build ${iosBuild})
  Saída        build/${perfil}/

  Próximo passo (primeira vez):
    cd build/${perfil}
    npm install
    npx cap add android
    node travar-orientacao.js
    npx @capacitor/assets generate --android

  Nas próximas: android/ e ios/ são PRESERVADOS. Só o www, o config e a
  versão são regerados -- não precisa refazer ícones nem permissões.
`);