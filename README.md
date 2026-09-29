# Pond Party

ASP.NET Core SignalR와 Canvas로 만든 2~8인 개구리 점프 게임입니다. 친구와 초대 링크를 나누거나, 혼자 연습 모드에서 점프 타이밍을 연습할 수 있습니다.

## 로컬 실행

필요 환경: .NET 10 SDK, Node.js 22.12 이상.

```powershell
dotnet run --project backend --no-launch-profile --urls http://127.0.0.1:5072
```

다른 터미널에서 프론트엔드를 실행합니다.

```powershell
cd frontend
npm install
npm run dev
```

브라우저에서 <http://localhost:5173>을 여세요. 상세 실행, 테스트, 배포 안내는 [개발 가이드](docs/guides/development.md)를 참고하세요.

## 문서

- [시스템 아키텍처](docs/architecture/system-design.md)
- [게임 규칙과 라운드 진행](docs/gameplay/rules-and-progression.md)
- [개발·실행·테스트·배포](docs/guides/development.md)
- [SignalR 통신 계약](docs/integrations/signalr-protocol.md)
- [문서 목차](docs/README.md)
