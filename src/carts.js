/* 카트리지 모양: 실제 콘솔 카트리지의 실루엣을 본뜬 SVG (로고·상표는 그리지 않는다)
   vb: viewBox 크기, lab: 라벨 자리 [x, y, w, h, 모서리], fw: 케이스 폭에 대한 카트리지 폭 */
(function(){
  // 가로 홈 n줄
  const ridgesH=(x,y,w,h,n)=>{ let s=''; const g=h/n; for(let i=0;i<n;i++) s+=`<rect x="${x}" y="${(y+i*g+g*.3).toFixed(1)}" width="${w}" height="${(g*.4).toFixed(1)}" rx="${(g*.2).toFixed(1)}" class="k"/>`; return s };
  // 세로 홈 n줄
  const ridgesV=(x,y,w,h,n)=>{ let s=''; const g=w/n; for(let i=0;i<n;i++) s+=`<rect x="${(x+i*g+g*.3).toFixed(1)}" y="${y}" width="${(g*.4).toFixed(1)}" height="${h}" rx="${(g*.2).toFixed(1)}" class="k"/>`; return s };
  const contacts=(x,y,w,h,n)=>{ let s=''; const g=w/n; for(let i=0;i<n;i++) s+=`<rect x="${(x+i*g+g*.15).toFixed(1)}" y="${y}" width="${(g*.7).toFixed(1)}" height="${h}" rx="1" class="au"/>`; return s };
  const recess=(l,pad=3)=>`<rect x="${l[0]-pad}" y="${l[1]-pad}" width="${l[2]+pad*2}" height="${l[3]+pad*2}" rx="${(l[4]||2)+1}" class="d"/>`;

  const S={
    // NES (북미·유럽): 위쪽 손잡이 홈, 넓은 라벨
    nes:{vb:[120,134],lab:[12,30,96,72,2],fw:.7,svg:()=>`<rect width="120" height="134" rx="3" class="b"/><rect width="120" height="22" rx="3" class="d"/>${ridgesH(10,3,100,16,5)}${recess([12,30,96,72,2])}<rect y="112" width="120" height="22" class="l"/>`},
    // 패미컴: 가로로 넓고 낮다
    fc:{vb:[130,86],lab:[16,10,98,46,2],fw:.62,svg:()=>`<path d="M6 0H124Q130 0 130 6V70H120V86H10V70H0V6Q0 0 6 0Z" class="b"/>${recess([16,10,98,46,2])}${ridgesV(2,14,10,44,3)}${ridgesV(118,14,10,44,3)}<rect x="10" y="62" width="110" height="6" class="d"/>`},
    // 슈퍼패미컴·유럽 SNES: 둥근 윗모서리, 양옆 손잡이 홈
    sfc:{vb:[140,104],lab:[22,10,96,56,3],fw:.66,svg:()=>`<path d="M16 0H124Q140 0 140 16V104H0V16Q0 0 16 0Z" class="b"/><ellipse cx="3" cy="30" rx="5" ry="12" class="d"/><ellipse cx="137" cy="30" rx="5" ry="12" class="d"/>${recess([22,10,96,56,3])}${ridgesH(30,76,80,22,4)}`},
    // 북미 SNES: 각진 몸통, 윗단 턱, 양옆 세로 홈
    snesus:{vb:[140,100],lab:[24,14,92,52,2],fw:.66,svg:()=>`<rect width="140" height="100" rx="3" class="b"/><rect width="140" height="9" rx="3" class="d"/><rect x="9" y="14" width="5" height="78" rx="2.5" class="k"/><rect x="126" y="14" width="5" height="78" rx="2.5" class="k"/>${recess([24,14,92,52,2])}${ridgesH(30,74,80,20,4)}`},
    // N64: 어깨가 깎인 몸통, 위쪽 홈
    n64:{vb:[120,92],lab:[13,28,94,56,3],fw:.6,svg:()=>`<path d="M12 0H108L120 12V92H0V12Z" class="b"/>${ridgesH(16,3,88,20,5)}${recess([13,28,94,56,3])}`},
    // 게임보이: 오른쪽 위가 깎인 모서리
    gb:{vb:[100,114],lab:[11,18,78,60,2],fw:.5,svg:()=>`<path d="M4 0H86L100 14V110Q100 114 96 114H4Q0 114 0 110V4Q0 0 4 0Z" class="b"/><rect x="4" y="7" width="76" height="2" class="k"/>${recess([11,18,78,60,2])}<path d="M44 92L50 100L56 92Z" class="k"/>${ridgesV(4,96,24,14,4)}`},
    // GBA: 낮고 넓은 몸통, 위쪽 가운데 손잡이
    gba:{vb:[124,74],lab:[13,13,98,46,3],fw:.6,svg:()=>`<path d="M10 0H114Q124 0 124 10V74H0V10Q0 0 10 0Z" class="b"/><rect x="34" y="0" width="56" height="6" rx="3" class="d"/>${recess([13,13,98,46,3])}${ridgesV(48,63,28,8,6)}`},
    // DS 카드
    nds:{vb:[100,112],lab:[9,19,82,84,4],fw:.34,svg:()=>`<path d="M10 0H90Q100 0 100 10V102Q100 112 90 112H10Q0 112 0 102V10Q0 0 10 0Z" class="b"/>${ridgesH(14,3,72,12,3)}${recess([9,19,82,84,4],2)}`},
    // 3DS 카드: 오른쪽 위 작은 돌기
    n3ds:{vb:[100,118],lab:[9,25,82,84,4],fw:.34,svg:()=>`<rect x="70" y="0" width="20" height="10" rx="2" class="b"/><path d="M10 6H90Q100 6 100 16V108Q100 118 90 118H10Q0 118 0 108V16Q0 6 10 6Z" class="b"/>${ridgesH(14,9,50,12,3)}${recess([9,25,82,84,4],2)}`},
    // Switch 카드: 왼쪽 위가 깎인 작은 카드
    sw:{vb:[100,124],lab:[7,17,86,99,5],fw:.32,svg:()=>`<path d="M15 0H91Q100 0 100 9V115Q100 124 91 124H9Q0 124 0 115V15Z" class="b"/>${recess([7,17,86,99,5],2)}`},
    // Vita 카드
    vita:{vb:[100,118],lab:[8,15,84,95,4],fw:.3,svg:()=>`<path d="M8 0H84L100 14V110Q100 118 92 118H8Q0 118 0 110V8Q0 0 8 0Z" class="b"/>${recess([8,15,84,95,4],2)}`},
    // 메가드라이브·제네시스: 둥근 어깨, 큰 라벨
    md:{vb:[140,108],lab:[11,17,118,74,3],fw:.72,svg:()=>`<path d="M14 0H126Q140 0 140 14V108H0V14Q0 0 14 0Z" class="b"/>${ridgesV(40,2,60,10,10)}${recess([11,17,118,74,3])}<rect y="98" width="140" height="10" class="l"/>`},
    // 마스터 시스템: 라벨이 위쪽, 아래는 홈
    sms:{vb:[140,96],lab:[9,7,122,42,2],fw:.68,svg:()=>`<rect width="140" height="96" rx="3" class="b"/>${recess([9,7,122,42,2])}${ridgesH(14,58,112,32,6)}`},
    // 게임 기어
    gg:{vb:[110,86],lab:[10,9,90,50,3],fw:.5,svg:()=>`<path d="M6 0H104Q110 0 110 6V86H0V6Q0 0 6 0Z" class="b"/>${recess([10,9,90,50,3])}${ridgesH(18,66,74,16,4)}`},
    // 슈퍼 32X: 키가 큰 몸통
    x32:{vb:[120,150],lab:[11,16,98,100,3],fw:.62,svg:()=>`<path d="M14 0H106Q120 0 120 14V150H0V14Q0 0 14 0Z" class="b"/>${ridgesV(30,3,60,9,10)}${recess([11,16,98,100,3])}${ridgesH(20,124,80,20,4)}`},
    // PC엔진 HuCard: 신용카드 같은 얇은 카드, 아래 단자
    hucard:{vb:[100,142],lab:[6,6,88,108,5],fw:.4,svg:()=>`<rect width="100" height="142" rx="8" class="b"/>${contacts(14,122,72,14,8)}`},
    // 아타리 2600·7800: 위쪽 경사 홈, 아래 라벨
    a2600:{vb:[140,112],lab:[14,44,112,58,2],fw:.6,svg:()=>`<path d="M0 6Q0 0 6 0H134Q140 0 140 6V112H0Z" class="b"/><path d="M0 0H140V36H0Z" class="d"/>${ridgesH(8,4,124,28,6)}${recess([14,44,112,58,2])}`},
    // 패미컴 디스크: 노란 디스크, 위 라벨·가운데 읽기 창
    fds:{vb:[120,140],lab:[8,8,104,56,2],fw:.54,svg:()=>`<rect width="120" height="140" rx="4" class="b"/><rect x="0" y="0" width="10" height="10" class="k"/>${recess([8,8,104,56,2],2)}<rect x="42" y="76" width="36" height="56" rx="3" class="k"/><rect x="48" y="84" width="24" height="40" rx="2" class="d"/>`},
    // 5.25인치 플로피 (PC-98): 검은 재킷, 위 라벨, 가운데 구멍·읽기 창, 오른쪽 쓰기 방지 홈
    fd5:{vb:[120,120],lab:[10,7,100,36,2],fw:.6,svg:()=>`<path d="M3 0H117Q120 0 120 3V60H116V68H120V117Q120 120 117 120H3Q0 120 0 117V3Q0 0 3 0Z" class="b"/>${recess([10,7,100,36,2],2)}<circle cx="60" cy="74" r="15" class="d"/><circle cx="60" cy="74" r="8" class="k"/><circle cx="82" cy="70" r="2.6" class="k"/><rect x="55" y="93" width="10" height="23" rx="5" class="d"/>`},
    // 링크스: 위가 둥근 카드
    lynx:{vb:[124,82],lab:[12,18,100,52,3],fw:.5,svg:()=>`<path d="M0 16Q62 -6 124 16V82H0Z" class="b"/>${recess([12,18,100,52,3])}`},
    // MSX 롬팩
    msx:{vb:[140,94],lab:[10,10,120,56,2],fw:.62,svg:()=>`<rect width="140" height="94" rx="3" class="b"/>${recess([10,10,120,56,2])}<rect x="20" y="76" width="100" height="10" rx="2" class="k"/>`},
    // 네오지오 포켓: 위가 둥근 작은 카드
    ngp:{vb:[100,86],lab:[10,14,80,52,4],fw:.42,svg:()=>`<path d="M0 14Q50 -4 100 14V86H0Z" class="b"/>${recess([10,14,80,52,4])}${ridgesH(26,72,48,10,3)}`},
    // 원더스완
    ws:{vb:[112,82],lab:[9,9,94,52,3],fw:.46,svg:()=>`<rect width="112" height="82" rx="7" class="b"/>${recess([9,9,94,52,3])}${ridgesV(30,68,52,9,8)}`},
    // 버추얼 보이
    vb:{vb:[110,128],lab:[11,17,88,78,2],fw:.5,svg:()=>`<rect width="110" height="128" rx="4" class="b"/>${ridgesH(14,3,82,11,3)}${recess([11,17,88,78,2])}`},
  };
  // 패미컴 카트리지는 색이 여러 가지였다
  const FC_COLORS=['#d9b33a','#c8393b','#2d5fb3','#2a2a2e','#e9e4d6','#3d8a4e','#e07a2e'];
  const OF={nes:r=>jpOnly(r)?'fc':'nes', fds:'fds', snes:r=>usOnly(r)?'snesus':'sfc', vb:'vb', n64:'n64', gb:'gb', gbc:'gb', gba:'gba', nds:'nds', '3ds':'n3ds',
    switch:'sw', switch2:'sw', psvita:'vita', sg1000:'sms', sms:'sms', gg:'gg', md:'md', '32x':'x32', pce:'hucard', sgx:'hucard', ngp:'ngp', ngpc:'ngp',
    ws:'ws', wsc:'ws', a2600:'a2600', a7800:'a2600', lynx:'lynx', msx:'msx', msx2:'msx', turbor:'msx', pc98:'fd5'};
  const regs=r=>(r.region||'').split('·').filter(Boolean);
  function jpOnly(r){ const g=regs(r); return g.includes('JP')&&!g.some(x=>x==='US'||x==='EU'||x==='WW') }
  function usOnly(r){ const g=regs(r); return g.includes('US')&&!g.includes('JP') }
  // 콘솔·롬 → 모양 이름과 색
  window.cartShape=function(rom,c){
    const o=OF[rom.console]; if(!o) return null;
    const key=typeof o==='function'?o(rom):o; const sh=S[key]; if(!sh) return null;
    let color=c.cart?.[2]||'#555';
    if(key==='fc'){ let h=0; for(const ch of rom.id) h=(h*31+ch.charCodeAt(0))>>>0; color=FC_COLORS[h%FC_COLORS.length] }
    if(key==='snesus') color='#9b98a8';
    if(rom.console==='gbc') color='#26262c';
    return {key,sh,color};
  };
})();
