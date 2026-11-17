# Minimal MCP Server Skeleton for Rusukh

This is a **standalone, verifiable** starting point.

It demonstrates the tool contract that will later be connected to the real iOS app.

## What works right now
- The Swift `RusukhMCPTools` type can list notes, search, create notes, and report status.
- Unit tests prove these operations succeed on a `StudySnapshot`.
- A future remote MCP server will call the same logical tools.

## How to verify the tools today
From the repository root (on a machine with Swift):

```bash
swift test --filter MCPToolsTests
```

Expected: all tests pass.

## Next real connection steps
1. The iOS app exposes a local HTTP or WebSocket endpoint only when the user explicitly enables "Allow external control".
2. Or the app syncs a signed snapshot to a user-owned server that the MCP server reads.
3. Authentication + least-privilege scopes are required before any write tool is enabled.

No data leaves the device until the user turns the feature on and authenticates.

This skeleton exists so we can prove the tool logic works before wiring the network layer.
