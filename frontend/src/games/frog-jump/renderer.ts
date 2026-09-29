import type { Snapshot, Vec, Player } from '../../contracts';

export const COLORS=['#b9e56b','#f3c981','#c7b9ee','#8bd4dd','#f4a896','#e7d98d','#a8c6f1','#d5a6cb'];
export const slot=(i:number,n:number,radius=2.7):Vec=>({x:radius*Math.cos(-Math.PI/2+2*Math.PI*i/n),y:radius*Math.sin(-Math.PI/2+2*Math.PI*i/n)});
export function aimAngle(state:Snapshot,time:number) {
  const t=state.turn!; return t.aim.center+t.aim.amplitude*Math.sin(2*Math.PI*(time-t.startsAt)/t.aim.periodMs+t.aim.phase);
}
export class PondRenderer {
  private ctx:CanvasRenderingContext2D;
  private width=0; private height=0; private scale=1;
  private boardMatch:string|null=null;
  private boardRound=0;
  private boardRadius=2.7;
  private radiusTime=0;
  constructor(private canvas:HTMLCanvasElement) {
    this.ctx=canvas.getContext('2d')!;
    new ResizeObserver(()=>this.resize()).observe(canvas);
    this.resize();
  }
  private resize() {
    this.width=this.canvas.clientWidth; this.height=this.canvas.clientHeight;
    const dpr=Math.min(devicePixelRatio||1,2);
    this.canvas.width=Math.round(this.width*dpr); this.canvas.height=Math.round(this.height*dpr);
    this.ctx.setTransform(dpr,0,0,dpr,0,0);
    this.scale=Math.min(this.width/8.5,this.height/8.5);
  }
  private point(v:Vec):Vec { return {x:this.width/2+v.x*this.scale,y:this.height/2+v.y*this.scale}; }
  private ellipse(x:number,y:number,rx:number,ry:number,fill:string) {
    const c=this.ctx;c.fillStyle=fill;c.beginPath();c.ellipse(x,y,rx,ry,0,0,Math.PI*2);c.fill();
  }
  draw(state:Snapshot|null,me:string|undefined,time:number,lockedAngle:number|null) {
    const c=this.ctx,w=this.width,h=this.height,s=this.scale;
    c.clearRect(0,0,w,h);
    const cx=w/2,cy=h/2;
    const playing=!!state && state.phase!=='lobby';
    const targetRadius=state?.boardRadius??state?.turn?.boardRadius??2.7;
    if(playing && state && (state.matchId!==this.boardMatch || state.round!==this.boardRound)) {
      if(state.matchId!==this.boardMatch) this.boardRadius=targetRadius;
      this.boardMatch=state.matchId;this.boardRound=state.round;
    } else {
      const elapsed=this.radiusTime?Math.min(Math.max(0,time-this.radiusTime),100):0;
      this.boardRadius+=(targetRadius-this.boardRadius)*(1-Math.exp(-elapsed/240));
    }
    this.radiusTime=time;
    const ringRadius=playing?this.boardRadius:targetRadius;
    const grad=c.createRadialGradient(cx,cy,0,cx,cy,s*4.2);
    grad.addColorStop(0,'#e0ebe0');grad.addColorStop(.72,'#d2e4d8');grad.addColorStop(1,'#bed7c8');
    c.fillStyle=grad;c.fillRect(0,0,w,h);
    // Slow concentric ripples, rendered locally; they never influence game state.
    c.strokeStyle='rgba(76,124,102,.09)'; c.lineWidth=1;
    for(let i=0;i<5;i++) { c.beginPath();c.ellipse(cx,cy,s*(1.1+i*.64),s*(1.1+i*.64),0,0,Math.PI*2);c.stroke(); }
    for(let i=0;i<15;i++) {
      const a=i*2.399, r=3.35+(i%3)*.23;
      const p=this.point({x:Math.cos(a)*r,y:Math.sin(a)*r});
      this.ellipse(p.x,p.y+Math.sin(time/1600+i)*3,2+(i%3),1,'#91b7a0');
    }
    // Decorative reeds, lotus flowers and small islands at the water's edge.
    this.reeds(w*.06,h*.89,s,.2); this.reeds(w*.92,h*.14,s,-.6);
    this.flower(w*.12,h*.16,s*.15,time); this.flower(w*.87,h*.83,s*.12,time+600);
    const demo:Player[]=['나','토리','모모','연두'].map((name,i)=>({id:'demo'+i,name,slotId:i,connected:true,ready:true,successes:0,failures:0}));
    const players=state?.players??demo;
    const count=Math.max(players.length+1,3);
    const empty=playing?state.emptySlotId:players.length;
    const padRadius=Math.min(.43,2.7*Math.sin(Math.PI/count)*.65)*s;
    for(let i=0;i<count;i++) {
      const p=this.point(slot(i,count,ringRadius));
      const active=playing && state.turn && players.find(x=>x.id===state.turn!.playerId)?.slotId===i;
      this.pad(p.x,p.y,padRadius,i===empty,!!active,time,i);
      if(i===empty) {
        c.font=`600 ${Math.max(10,s*.15)}px system-ui`;c.textAlign='center';c.fillStyle='#426b49';
        c.fillText('빈자리',p.x,p.y+padRadius+18);
      }
    }
    const jump=state?.jump;
    for(let i=0;i<players.length;i++) {
      const p=players[i];
      if(jump?.playerId===p.id) continue;
      const position=this.point(slot(playing?p.slotId:i,count,ringRadius));
      this.frog(position.x,position.y,s*.30,COLORS[i%COLORS.length],Math.atan2(cy-position.y,cx-position.x)+Math.PI/2);
      this.name(position.x,position.y+padRadius+19,p.name+(p.id===me?' · 나':''),p.id===state?.turn?.playerId);
      if(!p.connected) { c.fillStyle='#708778'; c.font='11px system-ui';c.fillText('연결 대기',position.x,position.y+padRadius+35); }
    }
    if(jump) {
      const u=Math.max(0,Math.min(1,(time-jump.startsAt)/(jump.resolvesAt-jump.startsAt-150)));
      const pos=this.point({x:jump.from.x+(jump.landing.x-jump.from.x)*u,y:jump.from.y+(jump.landing.y-jump.from.y)*u});
      const lift=Math.sin(Math.PI*u)*s*.8;
      this.ellipse(pos.x,pos.y,s*.20*(1-u*.3),s*.09,'rgba(40,79,60,.18)');
      const i=players.findIndex(p=>p.id===jump.playerId);
      if(u<.95 || jump.outcome==='success') this.frog(pos.x,pos.y-lift,s*.30,COLORS[i%COLORS.length],jump.angle+Math.PI/2);
      else {
        c.strokeStyle=jump.outcome==='water'?'#f4fff8':'#edaa74'; c.lineWidth=3;
        for(let j=0;j<3;j++) { c.beginPath();c.arc(pos.x,pos.y,s*(.15+j*.10+(u-.95)*3),0,Math.PI*2);c.stroke(); }
      }
    }
    if(state?.phase==='aiming' && state.turn && time>=state.turn.startsAt && time<=state.turn.deadline) {
      const player=players.find(p=>p.id===state.turn!.playerId)!;
      const from=this.point(slot(player.slotId,count,ringRadius));
      const angle=lockedAngle??aimAngle(state,time);
      const dx=Math.cos(angle),dy=Math.sin(angle);
      const aim=state.turn.aim;
      c.strokeStyle='rgba(54,85,53,.23)';c.lineWidth=1;
      c.beginPath();c.arc(from.x,from.y,s*.96,aim.center-aim.amplitude,aim.center+aim.amplitude);c.stroke();
      for(let i=0;i<=10;i++) {
        const a=aim.center-aim.amplitude+2*aim.amplitude*i/10;
        c.beginPath();c.moveTo(from.x+Math.cos(a)*s*.91,from.y+Math.sin(a)*s*.91);
        c.lineTo(from.x+Math.cos(a)*s*.99,from.y+Math.sin(a)*s*.99);c.stroke();
      }
      c.save();c.translate(from.x,from.y);c.rotate(angle);
      c.strokeStyle='#294e36';c.fillStyle='#294e36';c.lineWidth=3;c.lineCap='round';
      c.beginPath();c.moveTo(s*.43,0);c.lineTo(s*1.16,0);c.stroke();
      c.beginPath();c.moveTo(s*1.32,0);c.lineTo(s*1.08,-s*.11);c.lineTo(s*1.08,s*.11);c.closePath();c.fill();c.restore();
      // Small dotted continuation makes direction readable without snapping to the target.
      for(let j=0;j<3;j++) this.ellipse(from.x+dx*s*(1.48+j*.16),from.y+dy*s*(1.48+j*.16),2-j*.35,2-j*.35,'#52765b');
    }
    c.textAlign='center';c.fillStyle='rgba(48,83,62,.35)';c.font=`600 ${Math.max(10,s*.14)}px system-ui`;
    c.fillText('P O N D  P A R T Y',cx,cy+s*.5);
    if(!state || state.phase==='lobby') {
      c.fillStyle='#486d52';c.font=`700 ${Math.max(15,s*.26)}px system-ui`;c.fillText('잠깐의 타이밍, 한 번의 폴짝.',cx,cy);
    }
  }
  private name(x:number,y:number,text:string,active:boolean) {
    const c=this.ctx;c.font=`${active?'700':'500'} ${this.width<450?11:12}px system-ui`;c.textAlign='center';
    const width=c.measureText(text).width+16;
    c.fillStyle=active?'#294f36':'rgba(249,251,242,.88)';c.beginPath();c.roundRect(x-width/2,y-12,width,22,11);c.fill();
    c.fillStyle=active?'#fff':'#45634d';c.fillText(text,x,y+3);
  }
  private pad(x:number,y:number,r:number,empty:boolean,active:boolean,time:number,index:number) {
    const c=this.ctx;
    this.ellipse(x,y+5,r*1.08,r*.94,'rgba(66,111,83,.12)');
    if(empty) {
      c.save();c.strokeStyle='#efffe2';c.lineWidth=2;c.setLineDash([4,6]);c.lineDashOffset=-time/120;
      c.beginPath();c.arc(x,y,r+8+Math.sin(time/550)*2,0,Math.PI*2);c.stroke();c.restore();
    }
    if(active) { c.strokeStyle='#466638';c.lineWidth=2;c.beginPath();c.arc(x,y,r+5,0,Math.PI*2);c.stroke(); }
    c.save();c.translate(x,y);c.rotate(index*.8+.3);
    const g=c.createLinearGradient(-r,-r,r,r);g.addColorStop(0,empty?'#b9d890':'#a5c980');g.addColorStop(1,'#709f66');
    c.fillStyle=g;c.beginPath();c.moveTo(0,0);c.arc(0,0,r,.15,Math.PI*2-.18);c.closePath();c.fill();
    if(empty) {
      c.strokeStyle='rgba(245,255,226,.66)';c.lineWidth=1;c.setLineDash([3,4]);
      c.beginPath();c.arc(0,0,r*.82,0,Math.PI*2);c.stroke();c.setLineDash([]);
    }
    c.strokeStyle='rgba(68,108,48,.2)';c.lineWidth=1;
    for(let a=.7;a<6;a+=.7) { c.beginPath();c.moveTo(0,0);c.lineTo(Math.cos(a)*r*.87,Math.sin(a)*r*.87);c.stroke(); }
    c.restore();
  }
  private frog(x:number,y:number,r:number,color:string,rotation:number) {
    const c=this.ctx;c.save();c.translate(x,y);c.rotate(rotation);
    this.ellipse(-r*.77,r*.65,r*.43,r*.29,'#568051');this.ellipse(r*.77,r*.65,r*.43,r*.29,'#568051');
    this.ellipse(0,r*.22,r*.88,r*.87,color);this.ellipse(0,r*.4,r*.52,r*.53,'rgba(255,255,233,.45)');
    this.ellipse(0,-r*.35,r,r*.67,color);
    for(const sign of [-1,1]) { this.ellipse(sign*r*.58,-r*.83,r*.38,r*.39,color);this.ellipse(sign*r*.58,-r*.87,r*.24,r*.25,'#fffdf0');this.ellipse(sign*r*.58,-r*.94,r*.115,r*.135,'#243d32'); }
    c.strokeStyle='#4b683e';c.lineWidth=1.4;c.beginPath();c.arc(0,-r*.32,r*.30,.15,Math.PI-.15);c.stroke();
    this.ellipse(-r*.65,-r*.27,r*.17,r*.085,'#eaaa8c');this.ellipse(r*.65,-r*.27,r*.17,r*.085,'#eaaa8c');c.restore();
  }
  private reeds(x:number,y:number,s:number,rotation:number) {
    const c=this.ctx;c.save();c.translate(x,y);c.rotate(rotation);
    for(let i=0;i<7;i++) { c.strokeStyle=i%2?'#83a580':'#9fb99b';c.lineWidth=3;c.beginPath();c.moveTo(i*4,0);c.quadraticCurveTo((i-3)*10,-s*.3,(i-3)*14,-s*(.35+(i%3)*.15));c.stroke(); }c.restore();
  }
  private flower(x:number,y:number,r:number,time:number) {
    const c=this.ctx;this.pad(x,y+7,r*1.8,false,false,time,2);
    c.save();c.translate(x,y);for(let i=0;i<7;i++) {c.rotate(Math.PI*2/7);this.ellipse(0,-r*.7,r*.4,r,'#f5e6df');}this.ellipse(0,0,r*.45,r*.45,'#e4c773');c.restore();
  }
}
