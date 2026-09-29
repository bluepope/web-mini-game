export function inviteLink(roomId:string):string {
  const url=new URL('/',location.origin);
  url.searchParams.set('room',roomId);
  return url.toString();
}

// Read only an identifier. Pasted links never trigger navigation or a remote fetch.
export function roomFromLink(value:string):string|null {
  try {
    const url=new URL(value);
    if(url.protocol!=='http:' && url.protocol!=='https:') return null;
    const id=url.searchParams.get('room')?.toUpperCase();
    return id && /^[A-F0-9]{6}$/.test(id)?id:null;
  } catch {return null;}
}
