import { test, expect } from '@playwright/test';
import { HubConnectionBuilder, LogLevel, type HubConnection } from '@microsoft/signalr';
import type { Snapshot, Session, CommandReply } from '../src/contracts';

test('two browsers create, join, play, restore a session and finish a round',async({browser})=> {
  const a=await browser.newContext({permissions:['clipboard-read','clipboard-write']}), b=await browser.newContext();
  const host=await a.newPage(),guest=await b.newPage();const errors:string[]=[];
  host.on('pageerror',e=>errors.push(e.message));guest.on('pageerror',e=>errors.push(e.message));
  try {
    await host.goto('/');await guest.goto('/');
    await expect(host.locator('#create')).toBeEnabled();
    await host.screenshot({path:'test-results/lobby-desktop.png',fullPage:true});
    await host.locator('#name').fill('연두');await host.locator('#create').click();
    await expect(host.locator('#invite-url')).toContainText('?room=');const link=await host.locator('#invite-url').innerText();
    await host.locator('#copy-link').click();expect(await host.evaluate(()=>navigator.clipboard.readText())).toBe(link);
    await guest.goto(link);await expect(guest.locator('#entry h2')).toHaveText('친구의 연못에 초대됐어요!');
    await expect(guest.locator('#invite-link')).toHaveValue(link);
    await expect(guest.locator('#join')).toBeEnabled();await guest.locator('#name').fill('토리');await guest.locator('#join').click();
    await expect(host.locator('#players li')).toHaveCount(2);await expect(guest.locator('#players li')).toHaveCount(2);
    await host.locator('#rounds').selectOption('1');await guest.locator('#ready').click();await expect(host.locator('#ready')).toBeEnabled();await host.locator('#ready').click();
    await expect(host.locator('#jump')).toBeEnabled({timeout:10000});await expect(guest.locator('#jump')).toBeDisabled();
    await host.screenshot({path:'test-results/game-desktop.png',fullPage:true});
    await host.locator('#jump').click();await expect(host.locator('#jump')).toBeDisabled();
    await expect(guest.locator('#jump')).toBeEnabled({timeout:10000});
    const identity=await guest.evaluate(()=>JSON.parse(sessionStorage.getItem('pond-session')!).playerId);
    await guest.reload();await expect(guest.locator('#connection')).toHaveText('연못과 연결됨');
    expect(await guest.evaluate(()=>JSON.parse(sessionStorage.getItem('pond-session')!).playerId)).toBe(identity);
    await guest.setViewportSize({width:390,height:844});
    await guest.screenshot({path:'test-results/game-mobile-active.png',fullPage:true});
    const bounds=await guest.locator('#jump').boundingBox();expect(bounds!.y+bounds!.height).toBeLessThanOrEqual(844);
    await expect(guest.locator('#jump')).toBeEnabled();await guest.locator('#jump').focus();await guest.keyboard.press('Space');
    await expect(host.locator('#results')).toBeVisible({timeout:10000});await expect(guest.locator('#results')).toBeVisible();
    expect(await host.locator('#players').innerText()).toContain('연두');
    await host.setViewportSize({width:390,height:844});await host.screenshot({path:'test-results/game-mobile.png',fullPage:true});
    expect(await host.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  } finally {await a.close();await b.close();}
});

test('authoritative success, idempotency, invalid session and room isolation',async()=> {
  const clients:HubConnection[]=[];
  const connect=async()=> {
    const c=new HubConnectionBuilder().withUrl('http://127.0.0.1:5273/hubs/game').configureLogging(LogLevel.Error).build();
    c.on('State',()=>{});clients.push(c);await c.start();return c;
  };
  try {
    const a=await connect(),b=await connect(),outsider=await connect();
    const sa=await a.invoke<Session>('CreateRoom','A');await b.invoke('JoinRoom',sa.roomId,'B');
    await outsider.invoke('CreateRoom','Other');
    await expect(outsider.invoke('ResumeRoom',sa.roomId,sa.playerId,'wrong')).rejects.toThrow('INVALID_SESSION');
    await b.invoke('SetReady',true);await a.invoke('StartMatch',1);
    const s=await a.invoke<Snapshot>('GetSnapshot');
    await expect(outsider.invoke('SubmitJump',s.matchId,s.turn!.id,'outside',Date.now())).resolves.toMatchObject({accepted:false});
    const invalid=await b.invoke<CommandReply>('SubmitJump',s.matchId,s.turn!.id,'wrong-turn',s.turn!.startsAt);
    expect(invalid.errorCode).toBe('NOT_YOUR_TURN');
    // Host begins at the top. Empty slot 2 of 3 lies down-left: direction = 2π/3.
    const t=s.turn!;
    const angle=2*Math.PI/3;
    const delta=Math.asin((angle-t.aim.center)/t.aim.amplitude);
    const inputAt=t.startsAt+(delta-t.aim.phase)*t.aim.periodMs/(2*Math.PI);
    const wait=inputAt-Date.now();if(wait>0) await new Promise(r=>setTimeout(r,wait));
    const reply=await a.invoke<CommandReply>('SubmitJump',s.matchId,t.id,'success-1',inputAt);
    expect(reply.accepted).toBe(true);
    expect(await a.invoke('SubmitJump',s.matchId,t.id,'success-1',inputAt)).toEqual(reply);
    const jumping=await a.invoke<Snapshot>('GetSnapshot');expect(jumping.jump?.outcome).toBe('success');
    await expect.poll(async()=> (await a.invoke<Snapshot>('GetSnapshot')).players[0].successes).toBe(1);
    const next=await a.invoke<Snapshot>('GetSnapshot');expect(next.emptySlotId).toBe(0);expect(next.players[0].slotId).toBe(2);
    const other=await outsider.invoke<Snapshot>('GetSnapshot');expect(other.phase).toBe('lobby');expect(other.players).toHaveLength(1);
  } finally {await Promise.all(clients.map(c=>c.stop()));}
});
