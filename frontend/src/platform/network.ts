import { HubConnectionBuilder, HubConnectionState, LogLevel } from '@microsoft/signalr';
import type { Snapshot, Session } from '../contracts';

export class Network {
  readonly connection = new HubConnectionBuilder().withUrl('/hubs/game').withAutomaticReconnect([0,1000,2000,5000,10000]).configureLogging(LogLevel.Error).build();
  session:Session|null = null;
  state:Snapshot|null = null;
  status = 'connecting';
  rtt = 0;
  private offset = Date.now()-performance.now();
  private desiredOffset = this.offset;
  private syncing = false;
  private stopped = false;
  onChange:()=>void = ()=>{};
  onError:(message:string)=>void = ()=>{};
  constructor() {
    // sessionStorage keeps refresh recovery while allowing independent players in separate tabs.
    try { this.session=JSON.parse(sessionStorage.getItem('pond-session')??'null'); } catch { this.session=null; }
    this.connection.on('State',(state:Snapshot)=>this.apply(state));
    this.connection.on('Replaced',()=> { this.stopped=true; this.status='replaced'; this.onChange(); void this.connection.stop(); });
    this.connection.onreconnecting(()=> { this.status='reconnecting'; this.onChange(); });
    this.connection.onreconnected(()=>void this.restore().catch(()=>this.connection.stop()));
    this.connection.onclose(()=> { if(!this.stopped) { this.status='offline'; this.onChange(); setTimeout(()=>void this.start(),2000); } });
    setInterval(()=> { if(this.status==='connected') void this.sync().catch(()=>{}); },15000);
  }
  now() { this.offset+=(this.desiredOffset-this.offset)*0.025; return performance.now()+this.offset; }
  get online() { return this.status==='connected'; }
  private apply(state:Snapshot) {
    if(this.state?.roomId===state.roomId && this.state.version>=state.version) return;
    this.state=state; this.onChange();
  }
  async start() {
    if(this.stopped || this.connection.state!==HubConnectionState.Disconnected) return;
    this.status='connecting'; this.onChange();
    try { await this.connection.start(); await this.restore(); }
    catch { this.status='offline'; this.onChange(); setTimeout(()=>void this.start(),2500); }
  }
  private async restore() {
    this.status='syncing'; this.onChange();
    await this.sync(true);
    if(this.session) {
      try { const s=this.session; this.apply(await this.connection.invoke('ResumeRoom',s.roomId,s.playerId,s.secret)); }
      catch(e) { this.clear(); this.onError(errorMessage(e)); }
    }
    this.status='connected'; this.onChange();
  }
  async sync(initial=false) {
    if(this.syncing) return; this.syncing=true;
    try {
      let best=Infinity, offset=this.desiredOffset;
      for(let i=0;i<5;i++) {
        const before=performance.now(); const server=await this.connection.invoke<number>('SyncClock'); const after=performance.now();
        if(after-before<best) { best=after-before; offset=server-(before+after)/2; }
      }
      this.rtt=Math.round(best); this.desiredOffset=offset; if(initial) this.offset=offset;
    } finally { this.syncing=false; }
  }
  async join(name:string,roomId?:string) {
    this.session=roomId ? await this.connection.invoke<Session>('JoinRoom',roomId,name) : await this.connection.invoke<Session>('CreateRoom',name);
    sessionStorage.setItem('pond-session',JSON.stringify(this.session));
    this.apply(await this.connection.invoke<Snapshot>('GetSnapshot')); this.onChange();
  }
  async leave() { await this.connection.invoke('LeaveRoom'); this.clear(); }
  async practice(name:string) {
    this.session=await this.connection.invoke<Session>('StartPractice',name);
    sessionStorage.setItem('pond-session',JSON.stringify(this.session));
    this.apply(await this.connection.invoke<Snapshot>('GetSnapshot'));this.onChange();
  }
  clear() { this.session=null; this.state=null; sessionStorage.removeItem('pond-session'); this.onChange(); }
}
const messages:Record<string,string> = {
  PRIVATE_PRACTICE:'혼자 연습하는 연못에는 참가할 수 없어요.', PRACTICE_ONLY:'연습 모드에서는 이 기능을 사용할 수 없어요.',
  ROOM_NOT_FOUND:'연못을 찾을 수 없어요. 친구에게 새 초대 링크를 받아 주세요.', ROOM_FULL:'이 연못은 가득 찼어요. 최대 8명이 함께할 수 있어요.',
  INVALID_NAME:'이름은 1~16자로 입력해 주세요.', MATCH_RUNNING:'이미 경기가 진행 중이에요.', HOST_ONLY:'방장만 시작할 수 있어요.',
  NEED_PLAYERS:'연결된 참가자가 2명 이상 필요해요.', NOT_READY:'친구들이 모두 준비하면 시작할 수 있어요.',
  INPUT_EXPIRED:'입력이 늦게 도착했어요. 시간이 남았다면 다시 눌러 주세요.', NOT_YOUR_TURN:'다른 친구의 차례예요.',
  STALE_TURN:'이미 다음 차례로 넘어갔어요.', ALREADY_JUMPED:'이미 점프했어요!', INVALID_SESSION:'이전 참가 정보를 복구할 수 없어요.',
  NO_SESSION:'연결을 복구하고 있어요. 잠시 기다려 주세요.', ALREADY_JOINED:'이미 방에 참가 중이에요.'
};
export function errorMessage(e:unknown):string {
  const raw=e instanceof Error?e.message:String(e);
  return Object.entries(messages).find(([key])=>raw.includes(key))?.[1]??'연결을 확인한 뒤 다시 시도해 주세요.';
}
