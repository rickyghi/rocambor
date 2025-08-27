import { Room } from "./room";

export class RoomRouter {
  private rooms = new Map<string, Room>();

  ensureRoom(makeRoom: (id: string) => Room){
    const id = "r-" + Math.random().toString(36).slice(2,8);
    const room = makeRoom(id);
    this.rooms.set(id, room);
    return { id, room };
  }

  get(id: string){ return this.rooms.get(id); }
}
