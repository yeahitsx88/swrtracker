/** One operator intent survives lost responses. Reload alone clears a stale latch. */
export class FrozenCommand<T> {
  command: Readonly<{body:T;key:string}>|null=null;
  pending=false;
  stale=false;
  begin(body:T,key:string):Readonly<{body:T;key:string}>|null {
    if(this.pending||this.stale)return null;
    this.command??=Object.freeze({body:JSON.parse(JSON.stringify(body)) as T,key});
    this.pending=true;
    return this.command;
  }
  fail(status?:number):void {
    this.pending=false;
    if(status===409){this.stale=true;return;}
    // Timeouts and unknown/5xx outcomes retain the original intent for exact retry.
    if(status!==undefined&&status<500&&status!==408)this.command=null;
  }
  success():void {this.pending=false;this.command=null;}
  reload():boolean {
    if(this.pending||this.command&&!this.stale)return false;
    this.command=null;this.stale=false;return true;
  }
  get locked():boolean{return this.pending||this.command!==null||this.stale;}
}

/** Shared synchronously across mounted editors; only the owner can retry or release. */
export class CommandOwner {
  private owner: string | null = null;
  private listeners = new Set<() => void>();
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  snapshot = (): string | null => this.owner;
  blocked(token: string): boolean { return this.owner !== null && this.owner !== token; }
  claim(token: string): boolean {
    if (this.blocked(token)) return false;
    this.owner = token; this.listeners.forEach(listener => listener()); return true;
  }
  release(token: string): void {
    if (this.owner !== token) return;
    this.owner = null; this.listeners.forEach(listener => listener());
  }
}
