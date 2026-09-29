// Original four-bar loop: pentatonic plucks, soft bass and a light 104 BPM beat.
// Audio is synthesized locally, with no downloaded samples or audio assets.
export class PondAudio {
  private context:AudioContext|null=null;
  private master:GainNode|null=null;
  private timer:ReturnType<typeof setInterval>|null=null;
  private noise:AudioBuffer|null=null;
  private nextTime=0;
  private step=0;
  // Browsers may defer the first AudioContext until a tap/click. Keep the
  // preference on and unlock playback from the first ordinary user gesture.
  enabled=true;
  constructor() {
    document.addEventListener('visibilitychange',()=> {
      if(!this.context) return;
      if(document.hidden) {
        this.stopScheduler();void this.context.suspend();
      } else if(this.enabled) void this.resume().catch(()=>{});
    });
    const unlock=()=> {if(this.enabled&&!this.context) void this.resume().catch(()=>{});};
    document.addEventListener('pointerdown',event=> {
      if((event.target as Element|null)?.closest('#sound')) return;
      unlock();
    },{passive:true});
    document.addEventListener('keydown',unlock,{passive:true});
  }
  async toggle() {
    if(this.enabled&&this.context?.state==='running') {this.disable();return;}
    this.enabled=true;
    try {await this.resume();} catch(e) {this.disable();throw e;}
  }
  private async resume() {
    if(!this.context) {
      this.context=new AudioContext();this.master=this.context.createGain();
      this.master.gain.value=.22;this.master.connect(this.context.destination);
      this.noise=this.context.createBuffer(1,this.context.sampleRate*.2,this.context.sampleRate);
      const data=this.noise.getChannelData(0);
      for(let i=0;i<data.length;i++) data[i]=Math.random()*2-1;
    }
    await this.context.resume();
    if(!this.enabled||document.hidden) {await this.context.suspend();return;}
    this.master!.gain.setTargetAtTime(.22,this.context.currentTime,.06);
    this.nextTime=this.context.currentTime+.06;
    if(!this.timer) {this.schedule();this.timer=setInterval(()=>this.schedule(),40);}
  }
  private disable() {
    this.enabled=false;this.stopScheduler();
    if(this.context && this.master) {
      this.master.gain.setTargetAtTime(0,this.context.currentTime,.025);
      // Suspending cancels CPU usage while preserving the user's playback position.
      setTimeout(()=> {if(!this.enabled) void this.context?.suspend();},150);
    }
  }
  private stopScheduler() {if(this.timer) clearInterval(this.timer);this.timer=null;}
  private tone(note:number,time:number,duration:number,volume:number,type:OscillatorType='sine') {
    const c=this.context!,osc=c.createOscillator(),gain=c.createGain();
    osc.type=type;osc.frequency.value=440*2**((note-69)/12);
    gain.gain.setValueAtTime(0,time);gain.gain.linearRampToValueAtTime(volume,time+.009);
    gain.gain.exponentialRampToValueAtTime(.0001,time+duration);
    osc.connect(gain);gain.connect(this.master!);osc.start(time);osc.stop(time+duration+.02);
    osc.onended=()=> {osc.disconnect();gain.disconnect();};
  }
  private kick(time:number) {
    const c=this.context!,osc=c.createOscillator(),gain=c.createGain();
    osc.frequency.setValueAtTime(110,time);osc.frequency.exponentialRampToValueAtTime(45,time+.12);
    gain.gain.setValueAtTime(.45,time);gain.gain.exponentialRampToValueAtTime(.001,time+.17);
    osc.connect(gain);gain.connect(this.master!);osc.start(time);osc.stop(time+.18);
    osc.onended=()=> {osc.disconnect();gain.disconnect();};
  }
  private percussion(time:number,snare:boolean) {
    const c=this.context!,source=c.createBufferSource(),filter=c.createBiquadFilter(),gain=c.createGain();
    source.buffer=this.noise;filter.type='highpass';filter.frequency.value=snare?1500:7000;
    gain.gain.setValueAtTime(snare?.12:.055,time);gain.gain.exponentialRampToValueAtTime(.001,time+(snare?.12:.045));
    source.connect(filter);filter.connect(gain);gain.connect(this.master!);source.start(time);source.stop(time+.15);
    source.onended=()=> {source.disconnect();filter.disconnect();gain.disconnect();};
  }
  private schedule() {
    if(!this.enabled||!this.context||document.hidden) return;
    const c=this.context, eighth=60/104/2;
    if(this.nextTime<c.currentTime) this.nextTime=c.currentTime+.04;
    const melody=[76,0,79,81,0,79,76,0,74,0,76,79,0,76,74,0,72,0,76,79,0,81,79,76,74,0,72,74,0,76,74,0];
    const roots=[48,45,53,55];
    while(this.nextTime<c.currentTime+.14) {
      const t=this.nextTime,beat=this.step%8,root=roots[Math.floor(this.step/8)];
      if(beat===0||beat===4) this.kick(t);
      if(beat===2||beat===6) this.percussion(t,true);
      this.percussion(t, false);
      if(beat===0||beat===3||beat===6) this.tone(root+(beat===3?7:0),t,.35,.26,'triangle');
      if(beat===0) {this.tone(root+24,t,.8,.075);this.tone(root+31,t,.8,.05);}
      if(melody[this.step]) {this.tone(melody[this.step],t,.25,.19);this.tone(melody[this.step]+12,t,.11,.035);}
      this.step=(this.step+1)%32;this.nextTime+=eighth;
    }
  }
  effect(good:boolean) {
    if(!this.enabled||!this.context||document.hidden) return;
    this.tone(good?79:48,this.context.currentTime,.17,.24);
    this.tone(good?84:43,this.context.currentTime+.08,.20,.18);
  }
}
