namespace FrogGame.Domain;

public record Vec(double X, double Y);
public sealed class Player(string id, string name, string secret)
{
    public string Id { get; } = id;
    public string Name { get; } = name;
    [System.Text.Json.Serialization.JsonIgnore] public string Secret { get; } = secret;
    [System.Text.Json.Serialization.JsonIgnore] public string? ConnectionId { get; set; }
    public bool IsBot { get; init; }
    public bool Connected => IsBot || ConnectionId != null;
    public bool Ready { get; set; }
    public int SlotId { get; set; }
    public int Successes { get; set; }
    public int Failures { get; set; }
}
public record Aim(double Center, double Amplitude, double PeriodMs, double Phase);
public record Turn(string Id, string PlayerId, long StartsAt, long Deadline, Aim Aim, double BoardRadius);
public record Jump(string Id, string PlayerId, Vec From, Vec Landing, double Angle, string Outcome, long StartsAt, long ResolvesAt);
public record Result(string PlayerId, string Outcome);
public record CommandReply(string CommandId, bool Accepted, string? ErrorCode);
public sealed class RuleException(string code) : Exception(code);

public static class Geometry
{
    public const double Radius = 2.7;
    public const double StartingRadius = 1.7;
    public const double FrogRadius = 0.12;
    // A small, visible edge margin keeps the landing window generous and easy to read.
    public const double LandingTolerance = 0.82;
    public static double BoardRadius(int round, int rounds, bool practice)
    {
        if (practice) return Radius;
        if (rounds <= 1) return StartingRadius;
        return StartingRadius + (Radius - StartingRadius) * (round - 1) / (rounds - 1);
    }
    public static Vec Slot(int index, int count, double radius = Radius) => new(radius * Math.Cos(-Math.PI / 2 + 2 * Math.PI * index / count), radius * Math.Sin(-Math.PI / 2 + 2 * Math.PI * index / count));
    public static double PadRadius(int count) => Math.Min(0.43, Radius * Math.Sin(Math.PI / count) * 0.65);
    public static double SuccessRadius(int count) => Math.Max(PadRadius(count) - FrogRadius, PadRadius(count) * LandingTolerance);
    public static double Angle(Turn t, double time) => t.Aim.Center + t.Aim.Amplitude * Math.Sin(2 * Math.PI * (time - t.StartsAt) / t.Aim.PeriodMs + t.Aim.Phase);
    public static Vec Landing(Vec from, double angle)
    {
        var dx = Math.Cos(angle); var dy = Math.Sin(angle);
        var length = -2 * (from.X * dx + from.Y * dy);
        return new(from.X + length * dx, from.Y + length * dy);
    }
    public static double Distance(Vec a, Vec b) => Math.Sqrt(Math.Pow(a.X - b.X, 2) + Math.Pow(a.Y - b.Y, 2));
    public static double SegmentDistance(Vec point, Vec a, Vec b)
    {
        var dx = b.X - a.X; var dy = b.Y - a.Y; var length = dx * dx + dy * dy;
        var t = length < 1e-10 ? 0 : Math.Clamp(((point.X - a.X) * dx + (point.Y - a.Y) * dy) / length, 0, 1);
        return Distance(point, new(a.X + t * dx, a.Y + t * dy));
    }
}
public sealed class GameRoom(string id)
{
    public const double BaseAimPeriodMs = 4400;
    public const double RoundSpeedMultiplier = 1.10;
    public string Id { get; } = id;
    public string HostPlayerId { get; set; } = "";
    public List<Player> Players { get; } = [];
    public string Phase { get; private set; } = "lobby";
    public bool IsPractice { get; private set; }
    public double BoardRadius => Phase == "lobby" ? Geometry.Radius : Geometry.BoardRadius(Round, Rounds, IsPractice);
    public string MatchId { get; private set; } = "";
    public int Round { get; private set; }
    public int Rounds { get; private set; } = 3;
    public int TurnIndex { get; private set; }
    public int EmptySlotId { get; private set; }
    public long Version { get; private set; }
    public Turn? Turn { get; private set; }
    public Jump? Jump { get; private set; }
    public Result? LastResult { get; private set; }
    private readonly Dictionary<string, CommandReply> replies = [];
    public void Changed() => Version++;
    public void StartPractice(string playerId, long now)
    {
        if (Phase != "lobby" || Players.Count != 1 || HostPlayerId != playerId)
            throw new RuleException("PRACTICE_ONLY");
        foreach (var name in new[] { "토리", "모모", "연두" })
            Players.Add(new Player(Guid.NewGuid().ToString("N"), name, "") { IsBot = true, Ready = true });
        Start(playerId, 1, now);
        IsPractice = true;
        Turn = Turn! with { BoardRadius = Geometry.Radius };
        Changed();
    }
    public void Start(string playerId, int rounds, long now)
    {
        if (IsPractice) throw new RuleException("PRACTICE_ONLY");
        if (HostPlayerId != playerId) throw new RuleException("HOST_ONLY");
        if (Phase != "lobby" && Phase != "finished") throw new RuleException("MATCH_RUNNING");
        if (Players.Count < 2 || Players.Any(p => !p.Connected)) throw new RuleException("NEED_PLAYERS");
        if (Players.Any(p => p.Id != HostPlayerId && !p.Ready)) throw new RuleException("NOT_READY");
        if (rounds is < 1 or > 10) throw new RuleException("INVALID_ROUNDS");
        Rounds = rounds; Round = 1; TurnIndex = 0; EmptySlotId = Players.Count;
        MatchId = Guid.NewGuid().ToString("N"); LastResult = null; Jump = null; replies.Clear();
        for (var i = 0; i < Players.Count; i++) { Players[i].SlotId = i; Players[i].Successes = 0; Players[i].Failures = 0; }
        BeginTurn(now + 2000); Changed();
    }
    private void BeginTurn(long startsAt)
    {
        var p = Players[TurnIndex];
        var boardRadius = Geometry.BoardRadius(Round, Rounds, IsPractice);
        var pos = Geometry.Slot(p.SlotId, Players.Count + 1, boardRadius);
        // Every player in a round shares one speed. Practice counts attempts, not rounds.
        var speed = IsPractice ? 1 : Math.Pow(RoundSpeedMultiplier, Round - 1);
        var periodMs = BaseAimPeriodMs / speed;
        Turn = new(Guid.NewGuid().ToString("N"), p.Id, startsAt, startsAt + 10000, new(Math.Atan2(-pos.Y, -pos.X), Math.PI / 2 - 0.07, periodMs, 0), boardRadius);
        Phase = "aiming"; Jump = null;
    }
    public CommandReply Submit(string playerId, string matchId, string turnId, string commandId, double inputAt, long receivedAt)
    {
        if (string.IsNullOrEmpty(commandId) || commandId.Length > 80) return new(commandId ?? "", false, "INVALID_COMMAND");
        var key = playerId + ":" + commandId;
        if (replies.TryGetValue(key, out var cached)) return cached;
        string? error = null;
        if (MatchId != matchId || Turn?.Id != turnId) error = "STALE_TURN";
        else if (Turn.PlayerId != playerId) error = "NOT_YOUR_TURN";
        else if (Phase != "aiming") error = "ALREADY_JUMPED";
        else if (!double.IsFinite(inputAt) || inputAt < Turn.StartsAt || inputAt > Turn.Deadline || inputAt < receivedAt - 350 || inputAt > receivedAt + 80 || receivedAt > Turn.Deadline + 350) error = "INPUT_EXPIRED";
        if (error != null) return new(commandId, false, error);
        var player = Players.Single(p => p.Id == playerId);
        var boardRadius = Turn!.BoardRadius;
        var from = Geometry.Slot(player.SlotId, Players.Count + 1, boardRadius);
        var angle = Geometry.Angle(Turn!, inputAt); var landing = Geometry.Landing(from, angle);
        var outcome = Players.Any(p => p.Id != playerId && Geometry.SegmentDistance(Geometry.Slot(p.SlotId, Players.Count + 1, boardRadius), from, landing) <= Geometry.FrogRadius * 2)
            ? "collision" : Geometry.Distance(landing, Geometry.Slot(EmptySlotId, Players.Count + 1, boardRadius)) <= Geometry.SuccessRadius(Players.Count + 1) + 1e-8 ? "success" : "water";
        Jump = new(Guid.NewGuid().ToString("N"), playerId, from, landing, angle, outcome, receivedAt + 100, receivedAt + 1250);
        Phase = "jumping"; Changed(); var reply = new CommandReply(commandId, true, null); replies[key] = reply;
        // Practice is unbounded; retain a bounded retry history.
        if (replies.Count > 128) replies.Remove(replies.Keys.First());
        return reply;
    }
    public bool Tick(long now)
    {
        if (Phase == "aiming" && Turn != null && now > Turn.Deadline + 350) { Resolve("timeout", now); return true; }
        if (Phase == "jumping" && Jump != null && now >= Jump.ResolvesAt) { Resolve(Jump.Outcome, now); return true; }
        return false;
    }
    private void Resolve(string outcome, long now)
    {
        var p = Players[TurnIndex];
        if (outcome == "success") { var old = p.SlotId; p.SlotId = EmptySlotId; EmptySlotId = old; p.Successes++; } else p.Failures++;
        LastResult = new(p.Id, outcome);
        if (IsPractice)
        {
            Round++;
            BeginTurn(now + 1000);
            Changed();
            return;
        }
        TurnIndex++;
        if (TurnIndex == Players.Count) { TurnIndex = 0; Round++; }
        if (Round > Rounds) { Round = Rounds; Phase = "finished"; Turn = null; Jump = null; foreach (var member in Players) member.Ready = false; }
        else BeginTurn(now + 1500);
        Changed();
    }
}
