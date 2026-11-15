// 화면 시험 틀: Tauri 없이 브라우저(Playwright)에서 src/index.html을 열고 invoke를 흉내 낸다.
// 실행: node dev/ui-harness.example.js   (playwright 필요: npm i playwright)
// 결과: dev/out/harness.png, 콘솔에 실행 명령·인수
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

(async () => {
  const root = path.resolve(__dirname, '..');
  const out = path.join(__dirname, 'out'); fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1300, height: 900 } });
  p.on('pageerror', e => console.log('PAGEERR', e.message));

  // 주입할 상태 (library.json과 같은 모양). 필요한 것만 넣으면 나머지는 기본값
  const state = {
    tab: 'lib', filter: 'pc98', view: 'front',
    settings: { rescanOnStart: false, boxart: false, identify: false, anim: 'off' },
    roots: [], map: { pc98: { id: 'np2', auto: true } },
    emus: [{ key: 'np2', name: 'Neko Project', path: 'C:/Emu/NekoProject/np21x64w.exe', cores: [] }],
    roms: [
      { id: 'ys2', title: 'Ys II', console: 'pc98', region: 'JP', discs: 2,
        files: [{ path: 'D:/PC-98/Ys II (Disk A).fdi', disc: 1 }, { path: 'D:/PC-98/Ys II (Disk B).fdi', disc: 2 }] },
      { id: 'rus', title: 'Rusty', console: 'pc98', region: 'JP', files: [{ path: 'D:/PC-98/Rusty.hdi' }] },
    ],
  };

  // Rust 명령 흉내. 부른 명령은 window.__calls 에 쌓는다
  await p.exposeFunction('nodeInvoke', (c, a) => {
    if (c === 'np2_ini_set') return a.pairs.map(() => null);
    if (c === 'np2_set_font') return [a.font, null];
    if (c === 'launch') return { ok: true };
    return undefined;
  });
  await p.addInitScript(([state]) => {
    window.__calls = [];
    window.__TAURI__ = {
      core: {
        invoke: async (c, a) => {
          window.__calls.push([c, a]);
          if (c === 'store_load_text') return JSON.stringify(state);
          if (c === 'info') return { version: 'dev' };
          if (c === 'thumb_index' || c === 'meta_db') throw 'offline';
          if (c === 'exists') return a.paths.map(() => true);
          if (c === 'prune_images') return [0, 0];
          if (c === 'extract_icons') return a.jobs.map(() => null);
          const r = await window.nodeInvoke(c, a); if (r !== undefined) return r;
          return c.startsWith('list') || c === 'scan' ? [] : null;
        },
        convertFileSrc: p => 'file://' + p,
      },
      event: { listen: async () => () => {} },
      window: { getCurrentWindow: () => ({ setFullscreen: async () => {} }) },
    };
  }, [state]);

  await p.goto('file://' + path.join(root, 'src', 'index.html'));
  await p.waitForTimeout(1000);

  // 예: 실행 명령 확인 → 실행 → 어떤 명령이 불렸는지
  console.log(await p.evaluate(() => S.roms.map(r => r.title + ': ' + launchSpec(r).display).join('\n')));
  await p.evaluate(() => runGame('rus')); await p.waitForTimeout(300);
  console.log(JSON.stringify(await p.evaluate(() => window.__calls.filter(([c]) => /np2|launch/.test(c)))));

  await p.evaluate(() => openCase('ys2')); await p.waitForTimeout(800);
  await p.screenshot({ path: path.join(out, 'harness.png') });
  await b.close();
})();
