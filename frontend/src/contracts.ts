export interface Vec { x:number; y:number }
export interface Player { id:string; name:string; connected:boolean; ready:boolean; slotId:number; successes:number; failures:number; isBot?:boolean }
export interface Aim { center:number; amplitude:number; periodMs:number; phase:number }
export interface Turn { id:string; playerId:string; startsAt:number; deadline:number; aim:Aim; boardRadius:number }
export interface Jump { id:string; playerId:string; from:Vec; landing:Vec; angle:number; outcome:string; startsAt:number; resolvesAt:number }
export interface Snapshot { roomId:string; hostPlayerId:string; players:Player[]; phase:string; matchId:string; round:number; rounds:number; emptySlotId:number; version:number; turn:Turn|null; jump:Jump|null; lastResult:{playerId:string;outcome:string}|null; serverTime:number; isPractice:boolean; boardRadius:number }
export interface Session { roomId:string; playerId:string; secret:string }
export interface CommandReply { commandId:string; accepted:boolean; errorCode:string|null }
