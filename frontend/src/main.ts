import './style.css';
import { Network, errorMessage } from './platform/network';
import { PondRenderer, COLORS, aimAngle } from './games/frog-jump/renderer';
import type { CommandReply } from './contracts';
import { PondAudio } from './platform/audio';
import { inviteLink, roomFromLink } from './platform/invitations';

document.querySelector<HTMLDivElement>('#app')!.innerHTML=`
  <header class="topbar"><a class="brand" href="/" aria-label="Pond Party 홈"><span class="brand-icon">••<span>⌣</span></span>Pond Party<span class="brand-sub">우리들의 작은 연못</span></a><div class="header-right"><span class="connection"><i></i><span id="connection">연못에 연결 중</span></span><button id="sound" class="icon-button enabled" aria-label="배경음악과 효과음 끄기" aria-pressed="true" title="배경음악과 효과음 끄기">♪</button></div></header>
  <main>
    <section class="intro"><div><div class="eyebrow"><span></span> LITTLE JUMPS, BIG MOMENTS</div><h1>딱 맞는 순간에, <span>폴짝!</span></h1><p>친구들과 둘러앉아, 비어 있는 연꽃잎으로.<br class="mobile-only"/> 타이밍은 당신에게 달렸어요.</p></div><div class="intro-note"><span class="tiny-flower">✳</span><span>버튼 하나로 함께하는<br/><strong>작고 즐거운 한 판</strong></span></div></section>
    <section class="game-layout">
      <div class="pond-card"><div class="pond-toolbar"><div><span class="live-dot"></span><strong id="pond-label">느긋한 오후의 연못</strong></div><span id="round-label" class="round-pill">2–8 PLAYERS</span></div><div class="canvas-wrap"><canvas id="pond" aria-label="원형 연꽃잎과 개구리 게임 보드"></canvas><div id="turn-banner" class="turn-banner" aria-live="polite"></div><div class="watermark">EST. 2026 &nbsp; / &nbsp; GOOD TIMES TOGETHER</div></div><div class="pond-footer"><span><i class="target-dot"></i> 점선으로 빛나는 연꽃잎이 빈자리예요</span><span>한 번의 점프, 한 번의 기회</span></div></div>
      <aside class="sidebar">
        <section id="entry" class="panel"><span class="section-number">01 / LET’S GET TOGETHER</span><h2>같이 놀 준비됐나요?</h2><p class="muted">연못을 만들거나 친구의 연못에 놀러 가요.</p><label for="name">나의 이름</label><input id="name" placeholder="어떤 개구리로 불릴까요?" maxlength="16" autocomplete="nickname"/><button id="create" class="primary">새 연못 만들기 <span>↗</span></button><div class="divider"><span>초대받았다면</span></div><label for="invite-link">친구의 초대 링크</label><div class="join-row"><input id="invite-link" type="url" placeholder="초대 링크를 붙여 넣어 주세요" maxlength="2048" autocomplete="off"/><button id="join" class="secondary">참가하기</button></div><p class="privacy-note">가입 없이, 이름 하나면 충분해요.</p></section>
        <section id="room" class="panel" hidden><span class="section-number">YOUR LITTLE POND</span><div class="room-heading"><h2>우리의 연못</h2><button id="leave" class="text-button">나가기 ↗</button></div><button id="copy-link" class="code-button" title="초대 링크 복사"><span>초대 링크</span><strong id="invite-url"></strong><span>복사 ⧉</span></button><div class="members-heading"><span>함께하는 친구들</span><span id="member-count"></span></div><ul id="players" class="players"></ul><div id="lobby-controls"><label for="rounds">함께할 라운드</label><select id="rounds"><option value="3">3 라운드 · 가볍게 한 판</option><option value="5">5 라운드 · 조금 더 즐겁게</option><option value="1">1 라운드 · 연습 한 판</option></select><button id="ready" class="primary">준비 완료</button><p id="ready-note" class="privacy-note"></p></div><div id="play-controls" hidden><div class="turn-info"><span id="turn-owner"></span><strong id="timer">10.0<span>s</span></strong></div><div class="time-track"><div id="time-fill"></div></div><button id="jump" class="jump-button" disabled><span class="jump-word">폴짝!</span><span class="jump-help">클릭 또는 SPACE</span></button><p id="jump-note" class="privacy-note">화살표가 빈자리를 향하는 순간을 기다려요.</p></div><div id="results" class="results" hidden></div></section>
        <section class="how-to"><div class="how-heading"><span>작은 연못의 규칙</span><span>HOW TO PLAY</span></div><ol><li><span>01</span><div><strong>내 차례를 기다려요</strong><p>친구들과 한 명씩 돌아가며 점프해요.</p></div></li><li><span>02</span><div><strong>화살표를 지켜봐요</strong><p>자동으로 움직여요. 조종할 필요 없어요.</p></div></li><li><span>03</span><div><strong>빈자리를 향해, 폴짝!</strong><p>물에 빠지거나 친구와 부딪히면 실패!</p></div></li></ol></section>
      </aside>
    </section><footer class="page-footer"><span>조금 느긋하게, 조금 더 즐겁게.</span><span>MADE FOR MOMENTS TOGETHER <span class="footer-star">✳</span></span></footer>
  </main><div id="toast" role="status" aria-live="polite"></div>`;

const $=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const network=new Network();
const incomingRoom=roomFromLink(location.href);
if(incomingRoom) {
  $<HTMLInputElement>('invite-link').value=inviteLink(incomingRoom);
  $('entry').querySelector('h2')!.textContent='친구의 연못에 초대됐어요!';
  $('entry').querySelector('.muted')!.textContent='이름을 입력하고 참가하기를 눌러 주세요.';
}
const audio=new PondAudio();
const practiceButton=document.createElement('button');
practiceButton.id='practice';practiceButton.className='practice-button';practiceButton.textContent='혼자 연습하기 ↗';
$('entry').append(practiceButton);
const practiceHint=document.createElement('p');practiceHint.className='privacy-note';practiceHint.textContent='친구를 기다리는 동안, 이름 없이도 바로 연습해요.';
$('entry').append(practiceHint);
const practiceStats=document.createElement('div');practiceStats.id='practice-stats';practiceStats.className='practice-stats';practiceStats.hidden=true;
$('play-controls').prepend(practiceStats);
const renderer=new PondRenderer($<HTMLCanvasElement>('pond'));
let busy=false, pendingTurn:string|null=null, lockedAngle:number|null=null, lastDrawTime=0;
let toastTimer:ReturnType<typeof setTimeout>;
let lastResultKey='';
const esc=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
function toast(message:string) { $('toast').textContent=message;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),4000); }
function beep(good:boolean) {
  audio.effect(good);
}
async function action(fn:()=>Promise<unknown>) {
  if(busy || !network.online) return; busy=true;renderUI();
  try { await fn(); } catch(e) { toast(errorMessage(e)); } finally {busy=false;renderUI();}
}
function renderUI() {
  const s=network.state, me=network.session?.playerId;
  document.body.classList.toggle('playing',!!s && (s.phase==='aiming'||s.phase==='jumping'));
  const status:Record<string,string>={connected:'연못과 연결됨',connecting:'연못에 연결 중',syncing:'시간을 맞추는 중',reconnecting:'다시 연결하는 중',offline:'서버 연결 대기',replaced:'다른 탭에서 접속 중'};
  $('connection').textContent=status[network.status]??network.status;
  document.querySelector('.connection')!.classList.toggle('offline',!network.online);
  $('entry').hidden=!!network.session; $('room').hidden=!network.session;
  $<HTMLButtonElement>('create').disabled=busy||!network.online;
  $<HTMLButtonElement>('join').disabled=busy||!network.online;
  practiceButton.disabled=busy||!network.online;
  if(!s || !me) { $('round-label').textContent='2–8 PLAYERS';$('pond-label').textContent='느긋한 오후의 연못';return; }
  if(pendingTurn && pendingTurn!==s.turn?.id) {pendingTurn=null;lockedAngle=null;}
  const host=me===s.hostPlayerId, idle=s.phase==='lobby'||s.phase==='finished';
  $('room').querySelector('h2')!.textContent=s.isPractice?'나만의 연습 연못':'우리의 연못';
  $('copy-link').hidden=s.isPractice;
  $('leave').textContent=s.isPractice?'연습 끝내기 ↗':'나가기 ↗';
  practiceStats.hidden=!s.isPractice;
  if(s.isPractice) {
    const p=s.players.find(p=>p.id===me)!;const attempts=p.successes+p.failures;
    practiceStats.innerHTML=`<span>시도 <strong>${attempts}</strong></span><span>성공 <strong>${p.successes}</strong></span><span>성공률 <strong>${attempts?Math.round(p.successes/attempts*100):0}%</strong></span>`;
  }
  $('invite-url').textContent=inviteLink(s.roomId);$('member-count').textContent=`${s.players.length} / 8`;
  $('players').innerHTML=s.players.map((p,i)=>`<li class="${p.id===s.turn?.playerId?'active':''}"><span class="avatar" style="--frog-color:${COLORS[i]}">••<small>⌣</small></span><div class="player-name"><strong>${esc(p.name)}${p.id===me?' <em>나</em>':''}</strong><small>${p.id===s.hostPlayerId?'방장 · ':''}${!p.connected?'연결 대기':idle?(p.ready?'준비 완료':'연못에서 쉬는 중'):p.id===s.turn?.playerId?'지금 점프하는 중':'다음 기회를 기다려요'}</small></div><span class="score">${idle&&s.phase!=='finished'?(p.ready?'✓':'·'):`${p.successes}<small> 성공</small>`}</span></li>`).join('');
  $('lobby-controls').hidden=!idle;$('play-controls').hidden=idle;$('results').hidden=s.phase!=='finished';
  $<HTMLButtonElement>('leave').disabled=(!idle&&!s.isPractice)||busy||!network.online;
  $<HTMLSelectElement>('rounds').disabled=!host||busy;
  const ready=$<HTMLButtonElement>('ready');
  ready.textContent=host?(s.phase==='finished'?'한 판 더 시작하기 ↗':'모두 함께 시작하기 ↗'):(s.players.find(p=>p.id===me)?.ready?'준비 취소':'준비 완료 ✓');
  ready.disabled=busy||!network.online||(host&&(s.players.length<2||s.players.some(p=>!p.connected||(p.id!==me&&!p.ready))));
  $('ready-note').textContent=host?'친구가 모두 준비되면 시작할 수 있어요.':'준비를 마치면 방장이 게임을 시작해요.';
  $('round-label').textContent=s.phase==='lobby'?'WAITING FOR FRIENDS':`ROUND ${String(s.round).padStart(2,'0')} / ${String(s.rounds).padStart(2,'0')}`;
  $('pond-label').textContent=s.phase==='lobby'?'친구들이 모이고 있어요':s.phase==='finished'?'즐거운 한 판이 끝났어요':'한 번의 타이밍, 한 번의 점프';
  if(s.isPractice) {
    $('round-label').textContent=`PRACTICE · ${s.round}번째 점프`;
    $('pond-label').textContent='혼자서도 즐겁게, 연습 연못';
    $('member-count').textContent='나 + 연습 개구리 3마리';
    const rows=$('players').querySelectorAll('li');
    s.players.forEach((p,i)=> {if(p.isBot) rows[i].querySelector('.player-name > small')!.textContent='연습용 · 움직이지 않아요';});
  }
  if(s.phase==='finished') {
    const best=Math.max(...s.players.map(p=>p.successes));
    $('results').innerHTML=`<span class="section-number">NICE JUMPS!</span><h3>${esc(s.players.filter(p=>p.successes===best).map(p=>p.name).join(', '))} ${best===0?'다음엔 성공해 봐요!':'우승! ✳'}</h3><p>${s.rounds}번의 기회, ${best}번의 성공. 한 판 더 놀까요?</p>`;
  }
  if(s.lastResult) {
    const key=`${s.matchId}:${s.round}:${s.turn?.id??'end'}`;
    if(key!==lastResultKey) {
      lastResultKey=key; const name=s.players.find(p=>p.id===s.lastResult!.playerId)?.name??'개구리';
      const label:Record<string,string>={success:'멋진 착지! 빈자리가 옮겨졌어요.',water:'풍덩! 원래 자리에서 다시 만나요.',collision:'앗, 친구와 부딪혔어요!',timeout:'시간이 다 되었어요.'};
      toast(`${name} · ${label[s.lastResult.outcome]}`);beep(s.lastResult.outcome==='success');
    }
  }
}
function animate() {
  const now=network.now(),s=network.state,me=network.session?.playerId;
  lastDrawTime=now;
  renderer.draw(s,me,now,lockedAngle);
  const turn=s?.turn;
  const enabled=network.online && s?.phase==='aiming' && !!turn && turn.playerId===me && now>=turn.startsAt && now<=turn.deadline && pendingTurn!==turn.id;
  $<HTMLButtonElement>('jump').disabled=!enabled;
  if(turn) {
    const remaining=Math.max(0,(turn.deadline-now)/1000);
    $('timer').innerHTML=`${Math.min(10,remaining).toFixed(1)}<span>s</span>`;
    $('time-fill').style.width=`${Math.min(100,remaining*10)}%`;
    $('time-fill').classList.toggle('urgent',remaining<3);
    const owner=s!.players.find(p=>p.id===turn.playerId)?.name??'';
    $('turn-owner').textContent=turn.playerId===me?'당신의 차례예요!':`${owner}의 차례`;
    $('jump-note').textContent=turn.playerId===me?'화살표가 빈자리를 향하는 순간, 딱 한 번!':'친구의 점프를 함께 지켜봐요.';
    $('turn-banner').textContent=now<turn.startsAt?`${owner}의 차례 · ${Math.ceil((turn.startsAt-now)/1000)}`:s!.phase==='jumping'?'폴짝! 어디에 도착할까요?':turn.playerId===me?'지금은 당신의 차례!':`${owner}의 점프를 기다리고 있어요`;
    $('turn-banner').classList.add('show');
  } else $('turn-banner').classList.remove('show');
  requestAnimationFrame(animate);
}
async function jump() {
  const s=network.state,t=s?.turn;
  if(!s||!t||$<HTMLButtonElement>('jump').disabled) return;
  pendingTurn=t.id;lockedAngle=aimAngle(s,lastDrawTime);beep(true);
  try {
    const commandId=Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join('');
    const reply=await network.connection.invoke<CommandReply>('SubmitJump',s.matchId,t.id,commandId,lastDrawTime);
    if(!reply.accepted) {pendingTurn=null;lockedAngle=null;toast(errorMessage(reply.errorCode));}
  } catch(e) {
    // An unknown delivery outcome is recovered from server state before permitting another press.
    toast(errorMessage(e));
    if(network.online) {
      try { const snapshot=await network.connection.invoke('GetSnapshot');network.state=snapshot;pendingTurn=null;lockedAngle=null;renderUI(); } catch { /* reconnect restores it */ }
    }
  }
}
$('create').onclick=()=>void action(()=>network.join($<HTMLInputElement>('name').value.trim()));
practiceButton.onclick=()=>void action(()=>network.practice($<HTMLInputElement>('name').value.trim()));
$('join').onclick=()=>void action(async()=> {
  const roomId=roomFromLink($<HTMLInputElement>('invite-link').value.trim());
  if(!roomId) {toast('올바른 초대 링크를 입력해 주세요.');return;}
  await network.join($<HTMLInputElement>('name').value.trim(),roomId);
});
$('ready').onclick=()=>void action(async()=> {
  const s=network.state!,me=network.session!.playerId;
  if(s.hostPlayerId===me) await network.connection.invoke('StartMatch',Number($<HTMLSelectElement>('rounds').value));
  else await network.connection.invoke('SetReady',!s.players.find(p=>p.id===me)!.ready);
});
$('leave').onclick=()=>void action(()=>network.leave());
$('copy-link').onclick=async()=> {
  const link=inviteLink(network.state!.roomId);
  try {await navigator.clipboard.writeText(link);toast('초대 링크를 복사했어요. 친구에게 보내 주세요!');}
  catch {
    const input=document.createElement('input');input.value=link;input.readOnly=true;input.className='manual-invite';
    input.setAttribute('aria-label','복사할 초대 링크');$('copy-link').after(input);input.focus();input.select();
    toast('선택된 초대 링크를 복사해서 보내 주세요.');
    input.onblur=()=>input.remove();
  }
};
$('jump').onpointerdown=e=> {if(e.button===0) {e.preventDefault();void jump();}};
$('jump').onclick=e=> {if(e.detail===0) void jump();};
document.addEventListener('keydown',e=> {
  if(e.code==='Space' && !e.repeat && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLSelectElement) && !(e.target instanceof HTMLButtonElement)) {e.preventDefault();void jump();}
});
$('sound').setAttribute('aria-label','배경음악과 효과음 끄기');
$('sound').setAttribute('aria-pressed','true');
$('sound').title='배경음악과 효과음 끄기';
let audioBusy=false;
$('sound').onclick=async()=> {
  if(audioBusy) return;audioBusy=true;
  try {await audio.toggle();} catch {toast('소리를 재생하지 못했어요. 다시 눌러 주세요.');}
  finally {
    audioBusy=false;$('sound').classList.toggle('enabled',audio.enabled);
    const label=audio.enabled?'배경음악과 효과음 끄기':'배경음악과 효과음 켜기';
    $('sound').setAttribute('aria-label',label);$('sound').setAttribute('aria-pressed',String(audio.enabled));$('sound').title=label;
  }
};
let wasOnline=false;
network.onChange=()=> {
  if(network.online&&!wasOnline) {pendingTurn=null;lockedAngle=null;}
  wasOnline=network.online;renderUI();
};
network.onError=toast;renderUI();requestAnimationFrame(animate);void network.start();
if(incomingRoom && network.session && network.session.roomId!==incomingRoom)
  toast('현재 참가 중인 연못을 나온 뒤 초대받은 연못에 참가해 주세요.');
