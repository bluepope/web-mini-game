using FrogGame.Domain;
namespace FrogGame.Tests;

public class GameRulesTests
{
    private static GameRoom Room(int n = 2, int rounds = 1)
    {
        var room = new GameRoom("ABC123") { HostPlayerId = "p0" };
        for (var i = 0; i < n; i++) room.Players.Add(new Player("p" + i, "Frog " + i, "secret") { ConnectionId = "c" + i, Ready = true });
        room.Start("p0", rounds, 100000); return room;
    }
    private static double InputForAngle(Turn turn, double angle)
    {
        var delta = angle - turn.Aim.Center;
        while (delta > Math.PI) delta -= 2 * Math.PI;
        while (delta < -Math.PI) delta += 2 * Math.PI;
        var phase = Math.Asin(delta / turn.Aim.Amplitude);
        if (phase < 0) phase += 2 * Math.PI;
        return turn.StartsAt + phase * turn.Aim.PeriodMs / (2 * Math.PI);
    }
    private static double AimAt(GameRoom r, int target)
    {
        var from = Geometry.Slot(r.Players[r.TurnIndex].SlotId, r.Players.Count + 1);
        var to = Geometry.Slot(target, r.Players.Count + 1);
        return InputForAngle(r.Turn!, Math.Atan2(to.Y - from.Y, to.X - from.X));
    }
    private static CommandReply Submit(GameRoom r, double time, string id = "input") => r.Submit(r.Turn!.PlayerId, r.MatchId, r.Turn.Id, id, time, (long)Math.Ceiling(time));

    [Theory]
    [InlineData(2)]
    [InlineData(3)]
    [InlineData(4)]
    [InlineData(5)]
    [InlineData(6)]
    [InlineData(7)]
    [InlineData(8)]
    public void EveryParticipantCanReachEmptySlotAndOneHoleRemains(int n)
    {
        var r = Room(n, 2);
        for (var attempt = 0; attempt < n * 2; attempt++)
        {
            var original = r.Players[r.TurnIndex].SlotId; var empty = r.EmptySlotId;
            var p = r.Players[r.TurnIndex];
            Assert.True(Submit(r, AimAt(r, empty), "jump" + attempt).Accepted);
            Assert.Equal("success", r.Jump!.Outcome);
            Assert.Equal(original, p.SlotId); // in-flight reservation
            r.Tick(r.Jump.ResolvesAt);
            Assert.Equal(empty, p.SlotId); Assert.Equal(original, r.EmptySlotId);
            Assert.Equal(n, r.Players.Select(x => x.SlotId).Distinct().Count());
            Assert.DoesNotContain(r.EmptySlotId, r.Players.Select(x => x.SlotId));
        }
        Assert.Equal("finished", r.Phase); Assert.All(r.Players, p => Assert.Equal(2, p.Successes));
    }
    [Fact]
    public void WaterFailurePreservesOccupancy()
    {
        var r = Room(); var original = r.Players.Select(p => p.SlotId).ToArray();
        Assert.True(Submit(r, r.Turn!.StartsAt).Accepted); Assert.Equal("water", r.Jump!.Outcome);
        r.Tick(r.Jump.ResolvesAt); Assert.Equal(original, r.Players.Select(p => p.SlotId)); Assert.Equal(2, r.EmptySlotId); Assert.Equal(1, r.Players[0].Failures);
    }

    [Theory]
    [InlineData(2)]
    [InlineData(4)]
    [InlineData(8)]
    public void SpeedIncreasesTenPercentOnlyAfterEveryPlayerFinishes(int n)
    {
        var r = Room(n, 3);
        var periods = new[] { 4400d, 4000d, 4000d / 1.1 };
        for (var round = 1; round <= 3; round++)
        {
            for (var player = 0; player < n; player++)
            {
                Assert.Equal(round, r.Round);
                Assert.Equal("p" + player, r.Turn!.PlayerId);
                Assert.Equal(periods[round - 1], r.Turn.Aim.PeriodMs, 7);
                Assert.Equal(10000L, r.Turn.Deadline - r.Turn.StartsAt);
                if (player % 2 == 0)
                {
                    Assert.True(Submit(r, AimAt(r, r.EmptySlotId), $"{round}-{player}").Accepted);
                    Assert.Equal("success", r.Jump!.Outcome);
                    Assert.Equal(round, r.Round); // Last player's airborne jump is still in this round.
                    r.Tick(r.Jump.ResolvesAt);
                }
                else Assert.True(r.Tick(r.Turn.Deadline + 351));
            }
        }
        Assert.Equal("finished", r.Phase);
        Assert.Equal(3, r.Round);
        Assert.All(r.Players, p => Assert.Equal(3, p.Successes + p.Failures));

        foreach (var p in r.Players) p.Ready = true;
        r.Start("p0", 3, 900000);
        Assert.Equal(1, r.Round);
        Assert.Equal(4400d, r.Turn!.Aim.PeriodMs);
    }
    [Fact]
    public void OccupiedPadCollisionDoesNotDisplaceOtherPlayer()
    {
        var r = Room(); Assert.True(Submit(r, AimAt(r, 1)).Accepted); Assert.Equal("collision", r.Jump!.Outcome);
        r.Tick(r.Jump.ResolvesAt); Assert.Equal(0, r.Players[0].SlotId); Assert.Equal(1, r.Players[1].SlotId); Assert.Equal(0, r.Players[1].Failures);
    }
    [Fact]
    public void DuplicateRequestIsIdempotentAndDifferentRequestCannotJumpTwice()
    {
        var r = Room(); var t = r.Turn!; var time = AimAt(r, 2); var first = Submit(r, time); var version = r.Version;
        Assert.Equal(first, Submit(r, time)); Assert.Equal(version, r.Version);
        Assert.Equal("ALREADY_JUMPED", Submit(r, time, "different").ErrorCode);
        r.Tick(r.Jump!.ResolvesAt);
        Assert.Equal(first, r.Submit("p0", r.MatchId, t.Id, "input", time, (long)time + 5000));
        Assert.Equal(1, r.Players[0].Successes);
    }
    [Fact]
    public void WrongPlayerStaleTurnAndBadTimestampsAreRejected()
    {
        var r = Room(); var t = r.Turn!;
        Assert.Equal("NOT_YOUR_TURN", r.Submit("p1", r.MatchId, t.Id, "a", t.StartsAt, t.StartsAt).ErrorCode);
        Assert.Equal("STALE_TURN", r.Submit("p0", "old", t.Id, "a", t.StartsAt, t.StartsAt).ErrorCode);
        Assert.Equal("INPUT_EXPIRED", r.Submit("p0", r.MatchId, t.Id, "a", double.NaN, t.StartsAt).ErrorCode);
        Assert.Equal("INPUT_EXPIRED", r.Submit("p0", r.MatchId, t.Id, "a", t.StartsAt, t.StartsAt + 351).ErrorCode);
        Assert.Equal("INPUT_EXPIRED", r.Submit("p0", r.MatchId, t.Id, "a", t.StartsAt + 81, t.StartsAt).ErrorCode);
        Assert.Equal("INPUT_EXPIRED", r.Submit("p0", r.MatchId, t.Id, "a", t.StartsAt - 1, t.StartsAt).ErrorCode);
        Assert.Equal("aiming", r.Phase);
    }
    [Fact]
    public void DeadlineGraceAllowsInFlightInputButTimeoutAdvancesExactlyOnce()
    {
        var r = Room(); var t = r.Turn!;
        Assert.False(r.Tick(t.Deadline + 300));
        Assert.True(r.Submit("p0", r.MatchId, t.Id, "late", t.Deadline, t.Deadline + 300).Accepted);
        Assert.False(r.Tick(t.Deadline + 351)); // accepted jump owns resolution
        r.Tick(r.Jump!.ResolvesAt); Assert.Equal("p1", r.Turn!.PlayerId);
        Assert.True(r.Tick(r.Turn.Deadline + 351)); Assert.Equal("finished", r.Phase);
        var version = r.Version; Assert.False(r.Tick(t.Deadline + 100000)); Assert.Equal(version, r.Version);
        Assert.Equal(1, r.Players[1].Failures);
    }
    [Fact]
    public void MatchRequiresHostConnectedPlayersAndReadiness()
    {
        var r = new GameRoom("room") { HostPlayerId = "a" }; r.Players.Add(new("a", "A", "secret") { ConnectionId = "c" });
        Assert.Throws<RuleException>(() => r.Start("not-host", 1, 0)); Assert.Throws<RuleException>(() => r.Start("a", 1, 0));
        r.Players.Add(new("b", "B", "secret") { ConnectionId = "d" }); Assert.Throws<RuleException>(() => r.Start("a", 1, 0));
        r.Players[1].Ready = true; r.Start("a", 1, 0); Assert.Equal("aiming", r.Phase);
    }
    [Fact]
    public void WireSnapshotNeverSerializesRecoverySecretOrConnectionId()
    {
        var r = Room(); var json = System.Text.Json.JsonSerializer.Serialize(FrogGame.Application.RoomService.State(r));
        Assert.DoesNotContain("Secret", json); Assert.DoesNotContain("ConnectionId", json); Assert.DoesNotContain("secret", json);
    }

    private static GameRoom Practice()
    {
        var r=new GameRoom("practice") {HostPlayerId="p0"};
        r.Players.Add(new Player("p0","Me","secret") {ConnectionId="connection"});
        r.StartPractice("p0",100000);return r;
    }
    [Fact]
    public void PracticeAlwaysReturnsToHumanAndDoesNotEndAfterOneRound()
    {
        var r=Practice();var bots=r.Players.Where(p=>p.IsBot).Select(p=>p.SlotId).ToArray();
        for(var i=0;i<150;i++)
        {
            Assert.Equal("p0",r.Turn!.PlayerId);
            Assert.Equal(4400d,r.Turn.Aim.PeriodMs);
            Assert.True(Submit(r,AimAt(r,r.EmptySlotId),"practice"+i).Accepted);
            Assert.Equal("success",r.Jump!.Outcome);r.Tick(r.Jump.ResolvesAt);
            Assert.Equal("aiming",r.Phase);Assert.Equal(i+2,r.Round);
        }
        Assert.Equal(150,r.Players[0].Successes);Assert.Equal(3,r.Players.Count(p=>p.IsBot));
        Assert.Equal(bots,r.Players.Where(p=>p.IsBot).Select(p=>p.SlotId));
        Assert.DoesNotContain(r.EmptySlotId,r.Players.Select(p=>p.SlotId));
    }
    [Fact]
    public void PracticeCollisionAndTimeoutPreserveSeatsAndReturnToSamePlayer()
    {
        var r=Practice();var before=r.Players.Select(p=>p.SlotId).ToArray();
        Assert.True(Submit(r,AimAt(r,1)).Accepted);Assert.Equal("collision",r.Jump!.Outcome);
        r.Tick(r.Jump.ResolvesAt);Assert.Equal("p0",r.Turn!.PlayerId);
        Assert.True(r.Tick(r.Turn.Deadline+351));Assert.Equal("p0",r.Turn!.PlayerId);
        Assert.Equal(2,r.Players[0].Failures);Assert.Equal(before,r.Players.Select(p=>p.SlotId));
        Assert.Throws<RuleException>(()=>r.Start("p0",1,200000));
    }
}
