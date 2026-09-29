using System.Collections.Concurrent;
using System.Security.Cryptography;
using FrogGame.Domain;
using FrogGame.Transport;
using Microsoft.AspNetCore.SignalR;

namespace FrogGame.Application;

public record SessionGrant(string RoomId, string PlayerId, string Secret);
public record Snapshot(string RoomId, string HostPlayerId, Player[] Players, string Phase, string MatchId, int Round, int Rounds, int EmptySlotId, long Version, Turn? Turn, Jump? Jump, Result? LastResult, long ServerTime, bool IsPractice, double BoardRadius);
public sealed class RoomEntry(GameRoom room)
{
    public GameRoom Room { get; } = room;
    public SemaphoreSlim Gate { get; } = new(1);
    public long LastSeen { get; set; } = RoomService.Now;
}
public sealed class RoomService(IHubContext<GameHub> hub)
{
    private readonly ConcurrentDictionary<string, RoomEntry> rooms = new();
    private readonly ConcurrentDictionary<string, (string RoomId, string PlayerId)> connections = new();
    public static long Now => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
    private static string Group(string id) => "room:" + id;
    public static Snapshot State(GameRoom r) => new(r.Id, r.HostPlayerId, r.Players.ToArray(), r.Phase, r.MatchId, r.Round, r.Rounds, r.EmptySlotId, r.Version, r.Turn, r.Jump, r.LastResult, Now, r.IsPractice, r.BoardRadius);
    private Task Publish(GameRoom r) => hub.Clients.Group(Group(r.Id)).SendAsync("State", State(r));
    public async Task<SessionGrant> Join(string connectionId, string? roomId, string name, bool practice = false)
    {
        if (connections.ContainsKey(connectionId)) throw new HubException("ALREADY_JOINED");
        name = (name ?? "").Trim();
        if (name.Length is < 1 or > 16) throw new HubException("INVALID_NAME");
        RoomEntry entry;
        if (roomId == null)
        {
            if (rooms.Count >= 1000) throw new HubException("SERVER_FULL");
            do { roomId = Convert.ToHexString(RandomNumberGenerator.GetBytes(3)); entry = new(new(roomId)); } while (!rooms.TryAdd(roomId, entry));
        }
        else if (!rooms.TryGetValue(roomId.ToUpperInvariant(), out entry!)) throw new HubException("ROOM_NOT_FOUND");
        await entry.Gate.WaitAsync();
        try
        {
            var r = entry.Room;
            if (r.IsPractice) throw new HubException("PRIVATE_PRACTICE");
            if (r.Phase != "lobby") throw new HubException("MATCH_RUNNING");
            if (r.Players.Count >= 8) throw new HubException("ROOM_FULL");
            var p = new Player(Guid.NewGuid().ToString("N"), name, Convert.ToHexString(RandomNumberGenerator.GetBytes(24))) { ConnectionId = connectionId, SlotId = r.Players.Count };
            r.Players.Add(p); if (r.HostPlayerId == "") r.HostPlayerId = p.Id;
            if (practice) r.StartPractice(p.Id, Now);
            connections[connectionId] = (r.Id, p.Id); entry.LastSeen = Now;
            await hub.Groups.AddToGroupAsync(connectionId, Group(r.Id)); r.Changed(); await Publish(r);
            return new(r.Id, p.Id, p.Secret);
        }
        finally { entry.Gate.Release(); }
    }
    public async Task<Snapshot> Resume(string connectionId, string roomId, string playerId, string secret)
    {
        if (!rooms.TryGetValue(roomId, out var entry)) throw new HubException("ROOM_NOT_FOUND");
        await entry.Gate.WaitAsync();
        try
        {
            var r = entry.Room; var p = r.Players.FirstOrDefault(x => !x.IsBot && x.Id == playerId && x.Secret == secret);
            if (p == null) throw new HubException("INVALID_SESSION");
            if (connections.TryGetValue(connectionId, out var binding) && binding != (roomId, playerId)) throw new HubException("ALREADY_JOINED");
            if (p.ConnectionId != null && p.ConnectionId != connectionId)
            {
                connections.TryRemove(p.ConnectionId, out _);
                await hub.Clients.Client(p.ConnectionId).SendAsync("Replaced");
                await hub.Groups.RemoveFromGroupAsync(p.ConnectionId, Group(r.Id));
            }
            p.ConnectionId = connectionId; connections[connectionId] = (r.Id, p.Id); entry.LastSeen = Now;
            await hub.Groups.AddToGroupAsync(connectionId, Group(r.Id)); r.Changed(); await Publish(r); return State(r);
        }
        finally { entry.Gate.Release(); }
    }
    public async Task<T> WithRoom<T>(string connectionId, Func<GameRoom, string, T> action)
    {
        if (!connections.TryGetValue(connectionId, out var binding) || !rooms.TryGetValue(binding.RoomId, out var entry)) throw new HubException("NO_SESSION");
        await entry.Gate.WaitAsync();
        try
        {
            var r = entry.Room;
            if (r.Players.FirstOrDefault(p => p.Id == binding.PlayerId)?.ConnectionId != connectionId) throw new HubException("NO_SESSION");
            entry.LastSeen = Now; var version = r.Version; var result = action(r, binding.PlayerId);
            if (version != r.Version) await Publish(r); return result;
        }
        catch (RuleException e) { throw new HubException(e.Message); }
        finally { entry.Gate.Release(); }
    }
    public async Task Leave(string connectionId)
    {
        if (!connections.TryGetValue(connectionId, out var binding) || !rooms.TryGetValue(binding.RoomId, out var entry)) return;
        await entry.Gate.WaitAsync();
        try
        {
            var r = entry.Room;
            if (!r.IsPractice && (r.Phase == "aiming" || r.Phase == "jumping")) throw new HubException("MATCH_RUNNING");
            var p = r.Players.FirstOrDefault(p => p.Id == binding.PlayerId && p.ConnectionId == connectionId);
            if (p == null) throw new HubException("NO_SESSION");
            r.Players.Remove(p); connections.TryRemove(connectionId, out _);
            await hub.Groups.RemoveFromGroupAsync(connectionId, Group(r.Id));
            if (r.IsPractice) { rooms.TryRemove(r.Id, out _); return; }
            if (r.HostPlayerId == p.Id) r.HostPlayerId = r.Players.FirstOrDefault()?.Id ?? "";
            for (var i = 0; i < r.Players.Count; i++) r.Players[i].SlotId = i;
            r.Changed(); await Publish(r);
            if (r.Players.Count == 0) rooms.TryRemove(r.Id, out _);
        }
        finally { entry.Gate.Release(); }
    }
    public async Task Disconnect(string connectionId)
    {
        if (!connections.TryRemove(connectionId, out var binding) || !rooms.TryGetValue(binding.RoomId, out var entry)) return;
        await entry.Gate.WaitAsync();
        try
        {
            var p = entry.Room.Players.FirstOrDefault(p => p.Id == binding.PlayerId);
            if (p?.ConnectionId == connectionId) { p.ConnectionId = null; entry.Room.Changed(); await Publish(entry.Room); }
        }
        finally { entry.Gate.Release(); }
    }
    public async Task Tick()
    {
        foreach (var (key, entry) in rooms)
        {
            await entry.Gate.WaitAsync();
            try
            {
                if (entry.Room.Players.Where(p => !p.IsBot).All(p => !p.Connected) && Now - entry.LastSeen > 30 * 60 * 1000) { rooms.TryRemove(key, out _); continue; }
                if (entry.Room.Tick(Now)) await Publish(entry.Room);
            }
            finally { entry.Gate.Release(); }
        }
    }
}
public sealed class RoomTicker(RoomService rooms, ILogger<RoomTicker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromMilliseconds(50));
        try
        {
            while (await timer.WaitForNextTickAsync(stoppingToken))
                try { await rooms.Tick(); } catch (Exception e) { logger.LogError(e, "Room tick failed"); }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { }
    }
}
