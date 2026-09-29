import {test,expect} from '@playwright/test';
import {HubConnectionBuilder,LogLevel} from '@microsoft/signalr';
import type {Snapshot,Session} from '../src/contracts';

test('solo practice repeats, restores and exits to multiplayer',async({page})=> {
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');await expect(page.locator('#practice')).toBeEnabled();await page.locator('#practice').click();
  await expect(page.locator('#room h2')).toHaveText('나만의 연습 연못');
  await expect(page.locator('#players li')).toHaveCount(4);await expect(page.locator('#copy-link')).toBeHidden();
  await expect(page.locator('#jump')).toBeEnabled();await page.locator('#jump').click();
  await expect(page.locator('#round-label')).toContainText('2번째');await expect(page.locator('#practice-stats')).toContainText('시도 1');
  await expect(page.locator('#jump')).toBeEnabled();
  await page.reload();await expect(page.locator('#connection')).toHaveText('연못과 연결됨');
  await expect(page.locator('#practice-stats')).toContainText('시도 1');await expect(page.locator('#jump')).toBeEnabled();
  await page.screenshot({path:'test-results/practice.png',fullPage:true});
  await page.locator('#jump').click();await page.locator('#leave').click();
  await expect(page.locator('#entry')).toBeVisible();expect(await page.evaluate(()=>sessionStorage.getItem('pond-session'))).toBeNull();
  await page.locator('#name').fill('연습 끝');await page.locator('#create').click();await expect(page.locator('#copy-link')).toBeVisible();
  await expect(page.locator('#practice-stats')).toBeHidden();expect(errors).toEqual([]);
});

test('practice is private and bot identities cannot authenticate',async()=> {
  const a=new HubConnectionBuilder().withUrl('http://127.0.0.1:5273/hubs/game').configureLogging(LogLevel.Error).build();
  const b=new HubConnectionBuilder().withUrl('http://127.0.0.1:5273/hubs/game').configureLogging(LogLevel.Error).build();
  a.on('State',()=>{});b.on('State',()=>{});
  await a.start();await b.start();
  try {
    const session=await a.invoke<Session>('StartPractice','');const state=await a.invoke<Snapshot>('GetSnapshot');
    expect(state.isPractice).toBe(true);expect(state.players[0].name).toBe('나');
    await expect(b.invoke('JoinRoom',session.roomId,'intruder')).rejects.toThrow('PRIVATE_PRACTICE');
    await expect(b.invoke('ResumeRoom',session.roomId,state.players[1].id,'')).rejects.toThrow('INVALID_SESSION');
    await a.invoke('LeaveRoom');await expect(a.invoke('GetSnapshot')).rejects.toThrow('NO_SESSION');
    await expect(b.invoke('JoinRoom',session.roomId,'intruder')).rejects.toThrow('ROOM_NOT_FOUND');
  } finally {await a.stop();await b.stop();}
});

test('music produces a signal only after enabling and can be muted',async({page})=> {
  await page.addInitScript(()=> {
    const original=AudioNode.prototype.connect;
    (window as any).__audio=[];
    AudioNode.prototype.connect=function(...args:any[]) {
      if(args[0]===this.context.destination) {
        const analyser=this.context.createAnalyser();analyser.fftSize=256;
        original.call(this,analyser);(window as any).__audio.push({context:this.context,analyser});
      }
      return (original as any).apply(this,args);
    } as any;
  });
  await page.goto('/');await expect(page.locator('#sound')).toHaveAttribute('aria-pressed','false');
  expect(await page.evaluate(()=>(window as any).__audio.length)).toBe(0);
  await page.locator('#sound').click();await expect(page.locator('#sound')).toHaveAttribute('aria-pressed','true');
  await expect.poll(()=>page.evaluate(()=> {
    const node=(window as any).__audio[0];if(!node) return 0;
    const data=new Float32Array(256);node.analyser.getFloatTimeDomainData(data);
    return Math.max(...data.map(Math.abs));
  })).toBeGreaterThan(.001);
  await page.locator('#sound').click();await expect(page.locator('#sound')).toHaveAttribute('aria-pressed','false');
  await expect.poll(()=>page.evaluate(()=>(window as any).__audio[0].context.state)).toBe('suspended');
  await page.locator('#sound').click();await expect.poll(()=>page.evaluate(()=>(window as any).__audio[0].context.state)).toBe('running');
  expect(await page.evaluate(()=>(window as any).__audio.length)).toBe(1);
});
