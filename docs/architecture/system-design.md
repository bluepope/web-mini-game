# 개구리 연꽃잎 멀티플레이 웹게임 설계

## 1. 확정된 게임 컨셉

- 참가자 n명이 각각 개구리 한 마리를 조종하고, 원형으로 배치된 n+1개의 연꽃잎에 서로 마주보며 앉는다.
- 연꽃잎 하나만 비어 있다. 참가자들이 차례로 그 빈자리로 점프한다.
- 조작은 점프 버튼 하나뿐이다. 방향키, 드래그, 각도 조절, 파워 게이지, 버튼 누르는 시간에 따른 거리 조절은 없다.
- 현재 개구리의 조준 화살표가 자동으로 좌우 왕복한다. 버튼을 누른 순간의 방향을 고정해 점프한다.
- 물에 빠지거나 다른 개구리와 부딪히면 실패한다.
- 백엔드는 ASP.NET Core SignalR를 사용해 같은 방의 참가자들에게 경기 진행을 동기화한다.

한 라운드는 시작 시 확정된 참가자 n명이 각각 한 번씩 시도하는 것으로 해석한다. 턴 순서는 플레이어 ID로 유지하며 자리 이동으로 바뀌지 않는다. 성공하면 목표 연꽃잎을 차지하고 출발 연꽃잎이 다음 빈자리가 된다.

예: A가 0번에서 빈 3번으로 점프하면, 다음 참가자는 빈 0번을 목표로 한다.

## 2. 아직 확정되지 않은 규칙과 잠정안

다음은 사용자가 확정한 규칙이 아니라 설계를 진행하기 위한 제안이다. GameRules로 분리한다.

| 항목 | 잠정안 |
| --- | --- |
| 실패 이후 | 실패 기록 후 원래 연꽃잎 복귀, 다음 참가자 턴 |
| 상대 충돌 | 점프한 플레이어만 실패, 상대는 기존 자리 유지 |
| 점프 거리 | 화살표 방향과 보드 원의 교점까지 자동 산출 |
| 충돌 범위 | 평면 이동 경로에서 상대와 접촉하면 실패; 점프 높이는 연출 |
| 시간 초과 | 설정된 턴 제한 시간이 지나면 실패 |
| 승리 조건 | 설정된 라운드 수 종료 후 성공 횟수 비교, 동점 공동 순위 |
| 경기 도중 입장 | 현재 경기 관전 후 다음 경기 참가 |
| 연결 종료 | 자리 유지, 턴 제한 시간까지 복귀하지 않으면 해당 턴 실패 |

실패자를 제거하면 빈자리가 두 개가 된다. 탈락제를 선택하려면 연꽃잎 제거/재배치 또는 라운드 종료 규칙도 함께 정해야 한다. 잠정 복귀 방식은 항상 n명과 빈자리 하나를 유지한다.

## 3. 모듈 구조

프론트엔드 기본안은 TypeScript + Vite + Canvas 2D다. 서버는 경기 상태와 판정의 최종 권한을 가지고, 클라이언트는 입력 시각 전달과 화면 표현을 맡는다.

```text
minigame/
├─ README.md
├─ docs/
│  ├─ architecture/system-design.md
│  ├─ gameplay/rules-and-progression.md
│  ├─ guides/development.md
│  └─ integrations/signalr-protocol.md
├─ frontend/src/
│  ├─ app/                          # 화면 전환, 모듈 등록, 의존성 조립
│  ├─ core/                         # 생명주기, 통신/시계 인터페이스
│  ├─ platform/
│  │  ├─ signalr/                   # 연결, 명령, 재접속, 스냅샷 복구
│  │  ├─ clock/                     # 서버 시각 추정
│  │  ├─ input/                     # 버튼/스페이스/터치 -> Jump
│  │  ├─ rendering/                 # Canvas, DPR, 카메라
│  │  └─ audio/
│  ├─ lobby/                        # 방 생성, 참가, 준비
│  ├─ games/frog-jump/
│  │  ├─ index.ts                   # 게임 모듈 공개 진입점
│  │  ├─ model/                     # 서버 상태 사본, 표시용 계산
│  │  ├─ presentation/              # 연못, 개구리, 화살표, HUD
│  │  └─ assets/
│  └─ contracts/                    # 서버 DTO와 대응하는 클라이언트 타입
├─ backend/
│  ├─ src/
│  │  ├─ Game.Domain/
│  │  │  ├─ Rooms/
│  │  │  └─ FrogJump/               # 배치, 조준 함수, 판정, 경기 상태
│  │  ├─ Game.Application/          # 방별 명령 큐, 턴/라운드 진행
│  │  ├─ Game.Contracts/            # 명령/이벤트 DTO와 오류 코드
│  │  ├─ Game.Infrastructure/       # 메모리 저장소, 시계, 세션
│  │  └─ Game.Api/                  # Program, GameHub, 세션 API
│  └─ tests/
│     ├─ Game.Domain.Tests/
│     └─ Game.IntegrationTests/
└─ tests/e2e/                       # 여러 브라우저 동기화 검증
```

Domain은 SignalR, DB, 전송 DTO를 참조하지 않는 순수 C# 규칙이다. Application이 규칙을 실행하고 DTO로 변환한다. Infrastructure는 Application의 저장소/시계 인터페이스를 구현하고 Api가 이를 조립한다.

Hub는 인증된 요청을 Application에 전달하는 통신 경계다. 경기 상태는 Hub 필드에 저장하지 않고 별도 RoomCoordinator가 소유한다. Hub 외부 이벤트 전송에는 IHubContext를 사용한다.

프론트엔드 게임 모듈은 load, applySnapshot, applyEvent, updateVisuals, render, destroy 생명주기를 가진다. 탭 비활성화로 렌더링이 멈춰도 서버 경기는 계속 진행한다. 공통 방/연결 기능과 게임 전용 규칙을 분리하되, 추가 게임에서 확인된 중복만 공용 모듈로 추출한다.

## 4. 상태와 불변 조건

| 모델 | 핵심 필드 |
| --- | --- |
| Room | roomId, hostPlayerId, members, ready, rules |
| Match | matchId, roundIndex, turnOrder, phase, stateVersion |
| Player | playerId, slotId, successes, failures, connectionStatus |
| Board | center, radius, slots, emptySlotId |
| Turn | turnId, activePlayerId, startsAt, deadline, aimConfig, acceptedCommandId |
| Jump | jumpId, from, direction, landing, outcome, startsAt, resolvesAt |

- 각 참가자는 서로 다른 자리 하나를 소유하며, 빈자리는 정확히 하나다.
- 점프 중에는 출발 자리 점유를 논리적으로 유지한다. 성공 확정 시 목적지 점유와 출발지 비우기를 원자적으로 처리한다.
- 동시에 진행하는 턴과 점프는 각각 최대 하나다.
- 각 턴에서 최초로 검증을 통과한 점프만 수락한다.
- 논리 상태 변경마다 stateVersion을 증가시킨다.
- playerId는 재접속해도 유지하며 SignalR ConnectionId와 분리한다.

## 5. 턴과 라운드

```text
Lobby -> Countdown -> Aiming -> Jumping -> Resolving
                         |                    |
                         | timeout            +-> 다음 참가자 Aiming
                         +-> Resolving        +-> RoundEnded
                                                  +-> 다음 라운드
                                                  +-> MatchEnded
```

서버가 턴 시작/마감 시각과 자동 조준 설정을 배포한다. 현재 참가자만 점프 버튼이 활성화된다. 버튼 입력을 받은 서버가 경로와 결과를 계산하고 모든 참가자에게 배포한다. 클라이언트는 같은 점프를 애니메이션으로 재생한다.

서버는 resolvesAt에 자리와 기록을 확정하고 다음 턴으로 진행한다. 특정 클라이언트의 애니메이션 완료 응답을 기다리지 않는다. 라운드 종료 후 현재 자리 배치를 유지하고 참가자별 시도 여부를 초기화한다.

## 6. 자동 조준과 점프 거리

연꽃잎 중심은 보드 중심 C, 반지름 R의 원 위에 놓는다. 슬롯 수 m=n+1일 때:

```text
angle(i) = initialRotation + 2πi/m
slot(i) = C + R × (cos(angle(i)), sin(angle(i)))
```

인접 중심 간격은 2R sin(π/m)이다. 연꽃잎 지름과 여유 간격이 이를 넘지 않게 하고, 최대 참가 인원은 모바일 가독성을 고려해 결정한다.

화살표는 중앙 방향을 기준으로 자동 왕복한다. 조작 가능한 값은 없고 시간만으로 방향이 정해진다.

```text
angle(t) = centerAngle
         + amplitude × sin(2π(t-startsAt)/periodMs + phase)
```

서버가 centerAngle, amplitude, periodMs, phase, startsAt을 결정한다. 각 클라이언트는 같은 식으로 그린다. 왕복 범위는 모든 다른 슬롯을 겨냥할 수 있게 정하되 안쪽 반원에서 접선 방향 ±90도에 닿지 않도록 한다.

원형 배치에서는 가까운 자리와 맞은편 자리의 거리가 다르다. 단일 버튼 규칙에 맞춰, 초기안은 선택된 방향의 직선과 배치 원이 다시 만나는 곳을 착지점으로 사용한다. 빈자리로 자동 유도하거나 화살표 방향을 보정하지 않는다.

출발점 P가 배치 원 위이고 d가 안쪽을 향하는 단위 방향일 때:

```text
distance = -2 × dot(P-C, d)
landing = P + distance × d
```

이 계산은 거리 규칙 제안이며, 고정 거리 점프를 원한다면 배치 또는 성공 판정 방식부터 다시 정해야 한다.

판정은 다음 순서다.

1. 출발 개구리를 제외한 상대들의 충돌 원과 이동 선분을 검사한다. 이동 개구리 반지름을 더한 연속 충돌 판정을 사용한다.
2. 상대에 닿으면 PlayerCollision으로 실패한다.
3. 충돌 없이 빈 연꽃잎의 유효 착지 반지름 안에 도착하면 Success다. 유효 반지름은 `max(연꽃잎 반지름 - 개구리 반지름, 연꽃잎 반지름 × 0.82)`이며 보드에도 점선으로 표시한다.
4. 나머지는 Water다. 82% 허용 범위는 어느 조준 방향에서든 동일하며, 다른 개구리와의 충돌 판정은 바뀌지 않는다.

서버가 부동소수점 경계 허용치를 적용해 최종 판정한다. 점프 높이는 h(u)=4H×u×(1-u) 같은 곡선으로 연출한다. 평면 충돌 잠정안에서는 상대 위로 넘어가는 기능이 없다.

## 7. 버튼 시각과 네트워크 지연

화살표 각도를 매 프레임 전송하지 않는다. 클라이언트는 RTT 측정으로 서버 시간 차이를 추정하고 단조 증가 시계로 화면 시간을 진행시킨다. 조준 중 시간 보정은 완만하게 적용한다. 입력 시각은 화면의 화살표를 계산한 것과 같은 시간 기준으로 기록한다.

SubmitJump에는 클릭 시점의 추정 서버 시각을 담는다. 서버는 해당 시각의 각도를 재계산한다. 클라이언트가 임의 각도, 도착 좌표, 성공 여부를 지정하지 못하게 한다.

허용 입력 시각은 턴 구간과 [receivedAt-maxRewindMs, receivedAt+futureToleranceMs]의 교집합이다. 범위를 벗어나면 명시적 오류로 거절한다. 서버 큐 진입 시각을 receivedAt으로 사용하며 허용치들은 지연 테스트로 조정한다.

서버는 deadline 이후 제한된 전송 유예가 끝날 때 Timeout을 확정한다. 클릭 시각이 deadline 이전이고 수신도 유예 안인 경우만 처리한다. 입력과 만료 처리는 같은 방 큐에서 직렬화해 결과가 두 번 확정되지 않게 한다.

이 방식은 캐주얼 모드의 지연 보정안이며, 클라이언트 시각 조작이나 자동 조준을 완전히 막지는 못한다. 경쟁 모드에서는 서버 수신 시각 기준 판정 등의 별도 정책을 검토한다.

버튼을 누르면 즉시 화살표와 버튼을 잠그고 입력 피드백을 표시한다. 실제 점프와 결과 표시는 서버 응답을 따른다. 거절되었으나 여전히 내 조준 턴이고 시간이 남아 있으면 입력을 다시 허용한다.

## 8. SignalR 계약

허브 경로는 /hubs/game, 방 전송 그룹은 room:{roomId}다. 그룹 가입 전과 모든 명령에서 참가 권한을 검사한다.

| 방향 | 명령/이벤트 | 역할 |
| --- | --- | --- |
| 클라이언트 → 서버 | CreateRoom / JoinRoom / SetReady / StartMatch | 로비와 경기 시작 |
| 클라이언트 → 서버 | SubmitJump | roomId, matchId, turnId, commandId, inputAtServerMs |
| 클라이언트 → 서버 | ResumeRoom / GetSnapshot | 재접속과 전체 상태 복구 |
| 클라이언트 → 서버 | SyncClock | 서버 시각과 RTT 측정 |
| 서버 → 클라이언트 | RoomUpdated | 참가자, 준비 상태 |
| 서버 → 클라이언트 | MatchStarted / TurnStarted | 초기 배치, 턴, 조준 설정 |
| 서버 → 클라이언트 | JumpAccepted | 경로, 결과, startsAt, resolvesAt |
| 서버 → 클라이언트 | TurnResolved | 확정 점유와 기록 |
| 서버 → 클라이언트 | RoundEnded / MatchEnded | 결과 |
| 서버 → 클라이언트 | StateSnapshot | 전체 상태와 진행 중 점프 |

경기 이벤트에는 protocolVersion, roomId, matchId, stateVersion, eventId, serverTimeMs를 포함한다. 한 상태 변경을 한 논리 이벤트로 발행한다. 클라이언트는 지난 버전과 중복을 무시하고, 중간 버전 누락 시 스냅샷을 요청한다.

명령 응답은 commandId, accepted, errorCode, stateVersion으로 통일한다. 서버는 세션에서 playerId를 결정하고 방/현재 턴/입력 권한을 확인한다. 동일 commandId 재전송에는 저장된 응답을 돌려주며, 다른 commandId로도 같은 턴에 두 번 뛰지 못하게 한다.

C# DTO를 계약 원본으로 삼고 TypeScript 타입 생성을 빌드 단계에 연결한다. HTTP OpenAPI만으로 Hub 계약까지 생성된다고 가정하지 않는다. JSON camelCase 필드, 문자열 enum, 라디안 각도, 밀리초 시각과 동일한 월드 좌표를 사용한다. 공통 JSON fixture로 C#/TS의 직렬화 및 조준 계산을 검증한다.

## 9. 방 처리와 재접속

RoomCoordinator는 방마다 단일 소비자 큐를 두어 입력, 타이머, 연결 변경을 직렬 처리한다. 타이머는 matchId/turnId가 현재 상태와 다르면 무시한다. 상태 변경과 이벤트 생성 순서를 유지하고, 순서를 보장하는 제한된 송신 큐로 전송한다. 전송 실패나 느린 클라이언트는 스냅샷으로 복구한다.

첫 버전은 단일 서버와 메모리 RoomStore를 사용한다. 서버 재시작 시 진행 중 경기는 종료되며, 비활성 방과 중복 방지 기록에 정리 기한을 둔다. 다중 서버 확장 시에는 방 소유 서버와 분산 상태 관리가 별도로 필요하다.

재접속 흐름:

1. 연결 중단 시 입력을 막고 연결 상태를 표시한다.
2. SignalR 자동 재연결을 설정하며 최초 연결 실패도 별도 재시도한다.
3. 서버 발급 세션으로 playerId를 복구한다. 방 코드나 playerId만으로 소유권을 인정하지 않는다.
4. ResumeRoom에서 권한을 확인하고 그룹에 다시 가입한 뒤 최신 스냅샷을 받는다.
5. 복구 중 받은 이벤트는 버퍼링한다. 스냅샷보다 새로운 이벤트만 순서대로 적용하고 누락 시 다시 복구한다.
6. 점프 진행 중이면 서버 시간에 맞는 애니메이션 지점부터 표시한다.

플레이어당 조작 연결은 하나만 허용한다. 새 연결로 교체되면 이전 연결의 입력을 거절한다. 경기 중 이탈자의 자리는 유지하고 시간 초과로 턴을 처리한다. 로비에서는 참가자 제거 후 배치를 다시 만든다. 전원 이탈 시 유예 후 방을 정리한다.

SignalR 사용 근거: [Hub](https://learn.microsoft.com/en-us/aspnet/core/signalr/hubs), [사용자와 그룹](https://learn.microsoft.com/en-us/aspnet/core/signalr/groups), [JavaScript 클라이언트와 재연결](https://learn.microsoft.com/en-us/aspnet/core/signalr/javascript-client). 방 큐, 판정, 시간 보정은 이 게임을 위한 애플리케이션 설계다.

## 10. 화면과 구현 순서

화면 중앙에 연못, 원형 연꽃잎, 중앙을 바라보는 개구리를 배치한다. 현재 개구리와 빈 연꽃잎을 강조하고 자동 왕복 화살표를 보여준다. 상단에는 라운드/현재 참가자/남은 시간을, 하단에는 점프 버튼 하나를 둔다. 스페이스와 터치는 같은 Jump 액션이다.

성공 착지, 물보라, 충돌 연출은 서버 결과를 표현한다. 화면 크기와 관계없이 서버 월드 좌표를 사용하고, 카메라 변환은 개구리와 화살표에 동일하게 적용한다.

구현 순서:

1. 잠정 규칙 기반 C# 배치/조준/점프 판정과 단위 테스트.
2. 단일 버튼 자동 조준 화면으로 조작감 검증.
3. SignalR 방 생성/참가 및 두 명 이상 순차 턴 연결.
4. 서버 결과 기반 공통 애니메이션과 라운드 집계.
5. 재접속, 시간 초과, 중복 입력, 모바일 검증.

핵심 테스트는 빈자리 하나 유지, 라운드당 한 번 시도, 인접/맞은편 자리 도달, 충돌과 경계 착지, 명령 중복과 타이머 경합, 지연된 클릭, 점프 도중 재접속, 방 간 이벤트 격리다.

## 11. 첫 구현과 설계의 차이

실행 가능한 버전을 frontend/, backend/, tests/에 구현했다. 실행법은 [개발 가이드](../guides/development.md), 통신 계약은 [SignalR 통신 계약](../integrations/signalr-protocol.md), 실제 플레이 규칙은 [게임 규칙 문서](../gameplay/rules-and-progression.md)를 기준으로 한다.

- 백엔드는 하나의 프로젝트 안에서 Domain/Application/Transport 폴더로 경계를 나눴다. 별도 어셈블리 분리는 필요 시 수행한다.
- 방별 SemaphoreSlim과 서버 타이머로 상태 변경을 직렬화한다. 별도 액터/송신 큐는 아직 없다.
- 개별 차분 이벤트 대신 상태 변경마다 버전이 있는 전체 스냅샷을 배포한다. 작은 참가자 수에서 복구를 단순화한다.
- 타입 생성은 아직 자동화하지 않았으며 C# DTO와 TypeScript 타입을 함께 관리한다.
- 신규 입장은 대기 중인 방만 지원한다. 경기 중 신규 관전은 추후 기능이다.
- 실패 복귀, 10초 턴, 350ms 전송 유예, 성공 횟수 비교를 초기 규칙으로 구현했다.
- 그래픽은 Canvas 코드로 생성하고, 모바일 점프 버튼은 하단 고정으로 제공한다.
- 빈 연꽃잎 중심에서 연꽃잎 반지름의 82% 안을 착지 성공으로 인정하고, 그 경계를 점선으로 표시한다.
