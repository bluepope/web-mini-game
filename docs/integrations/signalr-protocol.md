# SignalR 계약 v1

엔드포인트: /hubs/game. JSON camelCase, 라디안 각도, UTC Unix 밀리초 시각, 고정 월드 좌표를 사용합니다. 현재 클라이언트와 서버는 함께 배포합니다.

| Hub 메서드 | 인수 | 응답 |
| --- | --- | --- |
| CreateRoom | name | SessionGrant |
| StartPractice | name (빈 문자열이면 기본 이름 사용) | 개인 연습 방의 SessionGrant |
| JoinRoom | roomId, name | SessionGrant |
| ResumeRoom | roomId, playerId, secret | Snapshot |
| GetSnapshot | 없음 | Snapshot |
| SetReady | ready | bool |
| StartMatch | rounds | bool |
| SubmitJump | matchId, turnId, commandId, inputAtServerMs | CommandReply |
| SyncClock | 없음 | serverTimeMs |
| LeaveRoom | 없음 | void |

SessionGrant는 roomId/playerId/secret을 가지며 본인에게만 반환합니다. 모든 플레이어의 secret 및 connectionId는 Snapshot에서 직렬화하지 않습니다. 이후 명령의 플레이어 신원은 연결에 바인딩된 참가자에서 결정합니다.

서버 이벤트:

- State(Snapshot): 방 상태가 바뀔 때 전체 스냅샷을 전달합니다. version이 증가하고, 같은 방의 지난 버전은 무시합니다. 차분 이벤트가 아니므로 중간 버전이 빠져도 다음 전체 스냅샷으로 복구됩니다.
- Replaced(): 같은 세션의 새 연결이 현재 연결을 대체했습니다. 현재 클라이언트는 자동 재접속을 중단합니다.

Snapshot 필드: roomId, hostPlayerId, players, phase, matchId, round, rounds, emptySlotId, version, turn, jump, lastResult, serverTime, isPractice, boardRadius. 도메인 및 프론트엔드 contracts.ts에서 세부 필드를 확인할 수 있습니다.

phase: lobby / aiming / jumping / finished.
outcome: success / water / collision / timeout.

멀티플레이에서 참가자 전원의 턴 결과가 확정될 때만 round를 증가시킵니다. 서버는 `turn.aim.periodMs = 4400 / 1.1^(round-1)`로 매 라운드 직전 대비 10% 빠른 조준 설정을 전달합니다. 클라이언트는 이 값을 그대로 사용하며 별도로 속도를 가산하지 않습니다. 연습모드는 round를 시도 번호로 사용하므로 periodMs는 4400으로 고정합니다.

서버는 `snapshot.boardRadius`와 `turn.boardRadius`에 현재 보드 반지름을 보냅니다. 멀티플레이 반지름은 선택한 총 라운드 수를 기준으로 첫 라운드 1.7부터 마지막 라운드 2.7까지 선형 증가합니다. 슬롯 좌표와 점프 충돌/착지 판정 모두 이 반지름을 사용합니다. 연습 모드는 반지름 2.7을 유지합니다.

착지 성공 반지름은 서버에서 `max(padRadius - frogRadius, padRadius * 0.82)`로 판정합니다. 클라이언트도 빈 연꽃잎에 반지름 82%의 점선을 표시합니다. 그 밖의 경로 충돌 판정은 동일합니다.

Snapshot.isPractice는 연습모드 여부, Player.isBot는 고정된 연습용 개구리 여부입니다. 연습에서는 round가 현재 시도 번호이고 rounds는 종료 조건으로 사용하지 않습니다. 연습용 개구리는 인증/세션 복구 대상이 아닙니다. 매 시도 후 같은 사람이 다시 점프하며, LeaveRoom은 연습 중에도 허용하고 방을 정리합니다. 다른 사람이 JoinRoom으로 연습 방에 참가하면 PRIVATE_PRACTICE로 거절합니다.

CommandReply는 commandId, accepted, errorCode로 구성합니다. 수락한 commandId는 최근 128개를 기억하므로 해당 범위에서 동일 요청은 동일 응답을 받습니다. 일반 경기는 최대 80번 시도이므로 모든 수락 요청을 기억합니다. 무제한 연습에서 기록 범위를 지난 요청도 오래된 turnId 검증으로 거절되어 재실행되지 않습니다. 수락하지 않은 요청은 상태를 변경하지 않습니다. 다른 ID도 이미 점프한 턴에는 거절됩니다.

서버 입력 시각 허용 범위는 턴 구간과 [receivedAt-350, receivedAt+80]의 교집합입니다. 마감 후 350ms까지만 전송 유예가 있습니다. 결과는 서버 시각에 따라 확정하며 애니메이션 종료 응답을 기다리지 않습니다.

재접속 시 동일 세션으로 ResumeRoom을 호출합니다. 서버가 권한을 확인하고 그룹을 복구한 뒤 최신 전체 상태를 반환합니다. 복구 전까지 입력은 차단합니다. 스냅샷 버전 비교로 그룹 이벤트와 응답 순서가 바뀌어도 과거 상태로 돌아가지 않습니다.
