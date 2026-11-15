/* 화면에서 쓰는 window.shelf 를 Tauri(Rust) 명령에 연결한다 */
(function(){
  const T = window.__TAURI__;
  const invoke = T.core.invoke;
  const listen = T.event.listen;
  window.shelf = {
    load: async () => { const s = await invoke('store_load_text'); return s ? JSON.parse(s) : null; },
    save: (data) => invoke('store_save_text', { text: JSON.stringify(data) }),
    pickFolders: () => invoke('pick_folders'),
    pickExe: () => invoke('pick_exe'),
    pickImage: (romId) => invoke('pick_image', { romId }),
    scan: (roots, exclude, shallow) => invoke('scan', { roots, exclude: exclude || null, shallow: shallow || null, exts: typeof CONSOLES !== 'undefined' ? [...new Set(CONSOLES.flatMap(c => c.exts))] : null }),
    exists: (paths) => invoke('exists', { paths }),
    launch: async ({ id, exe, args, cwd, minimize }) => {
      try { const pid = await invoke('launch', { id, exe, args, cwd, minimize }); return { ok: true, pid }; }
      catch (e) { return { ok: false, error: String(e) }; }
    },
    stop: (id) => invoke('stop', { id }),
    copy: (text) => invoke('copy', { text }),
    reveal: (path) => invoke('reveal', { path }),
    info: () => invoke('info'),
    sfoTitles: (paths) => invoke('sfo_titles', { paths }),
    thumbIndex: (system, refresh) => invoke('thumb_index', { system, refresh: !!refresh }),
    thumbFetch: (jobs) => invoke('thumb_fetch', { jobs }),
    thumbCancel: () => invoke('thumb_cancel'),
    arcadeDb: (mame, refresh) => invoke('arcade_db', { mame: mame || null, refresh: !!refresh }),
    fetchImage: (url, id) => invoke('fetch_image', { url, id }),
    openUrl: (url) => invoke('open_url', { url }),
    metaDb: (system, refresh) => invoke('meta_db', { system, refresh: !!refresh }),
    crcFiles: (paths) => invoke('crc_files', { paths }),
    crcCancel: () => invoke('crc_cancel'),
    onCrcProgress: (cb) => listen('crc:progress', (e) => cb(e.payload)),
    switchKeys: (paths) => invoke('switch_keys', { paths }),
    installedEmus: () => invoke('installed_emus'),
    exeInfos: (paths) => invoke('exe_infos', { paths }),
    bizhawkCores: (exe, pairs) => invoke('bizhawk_cores', { exe, pairs }),
    np2IniSet: (exe, pairs) => invoke('np2_ini_set', { exe, pairs }),
    np2SetFont: (exe, font, raw) => invoke('np2_set_font', { exe, font, raw: !!raw }),
    pruneImages: (keep, ids) => invoke('prune_images', { keep, ids }),
    cemuPacks: (exe, rom) => invoke('cemu_packs', { exe, rom }),
    cemuSetPack: (exe, file, enabled, presets) => invoke('cemu_set_pack', { exe, file, enabled, presets }),
    webImages: (query, engine) => invoke('web_images', { query, engine: engine || null }),
    paramInfos: (paths) => invoke('param_infos', { paths }),
    listFiles: (dir, ext) => invoke('list_files', { dir, ext }),
    listDirs: (dir) => invoke('list_dirs', { dir }),
    extractIcons: (jobs) => invoke('extract_icons', { jobs }),
    writePgconfig: (path, text) => invoke('write_pgconfig', { path, text }),
    pickFile: (title, name, exts) => invoke('pick_file', { title, name, exts }),
    bizhawkFirmware: (exe, key, value) => invoke('bizhawk_firmware', { exe, key, value: value ?? null }),
    readText: (path) => invoke('read_text', { path }),
    writeIni: (path, text) => invoke('write_ini', { path, text }),
    fileSrc: (path) => T.core.convertFileSrc(path),
    onScanProgress: (cb) => listen('scan:progress', (e) => cb(e.payload)),
    onGameExit: (cb) => listen('game:exit', (e) => cb(e.payload)),
  };
})();
