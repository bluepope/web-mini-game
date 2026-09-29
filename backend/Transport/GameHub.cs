using FrogGame.Application;
using FrogGame.Domain;
using Microsoft.AspNetCore.SignalR;
namespace FrogGame.Transport;

public sealed class GameHub(RoomService rooms) : Hub
{
    public Task<SessionGrant> CreateRoom(string name) => rooms.Join(Context.ConnectionId, null, name);
    public Task<SessionGrant> StartPractice(string name) => rooms.Join(Context.ConnectionId, null, string.IsNullOrWhiteSpace(name) ? "나" : name, practice: true);
    public Task<SessionGrant> JoinRoom(string roomId, string name) => rooms.Join(Context.ConnectionId, roomId.Trim().ToUpperInvariant(), name);
    public Task<Snapshot> ResumeRoom(string roomId, string playerId, string secret) => rooms.Resume(Context.ConnectionId, roomId, playerId, secret);
    public Task<Snapshot> GetSnapshot() => rooms.WithRoom(Context.ConnectionId, (r, _) => RoomService.State(r));
    public Task LeaveRoom() => rooms.Leave(Context.ConnectionId);
    public long SyncClock() => RoomService.Now;
    public Task<bool> SetReady(bool ready) => rooms.WithRoom(Context.ConnectionId, (r, id) =>
    {
        if (r.Phase != "lobby" && r.Phase != "finished") throw new RuleException("MATCH_RUNNING");
        r.Players.Single(p => p.Id == id).Ready = ready; r.Changed(); return true;
    });
    public Task<bool> StartMatch(int rounds) => rooms.WithRoom(Context.ConnectionId, (r, id) => { r.Start(id, rounds, RoomService.Now); return true; });
    public Task<CommandReply> SubmitJump(string matchId, string turnId, string commandId, double inputAtServerMs)
    {
        var receivedAt = RoomService.Now;
        return rooms.WithRoom(Context.ConnectionId, (r, id) => r.Submit(id, matchId, turnId, commandId, inputAtServerMs, receivedAt));
    }
    public override async Task OnDisconnectedAsync(Exception? exception)
    { await rooms.Disconnect(Context.ConnectionId); await base.OnDisconnectedAsync(exception); }
}
