# Testing PrivaBid contracts

## Compile (always works)

```bash
cd privabid-contract
npm install
npm run compile
```

Uses `@fhenixprotocol/cofhe-contracts@0.1.3` — matches deployed testnet bytecode.

## Hardhat tests (mock FHE)

```bash
npm test
```

**Known limitation:** `cofhe-hardhat-plugin@0.3.1` ships mocks for `cofhe-contracts@0.0.13`, while PrivaBid requires **0.1.x** APIs (`FHE.allowPublic`, updated `ICofhe` interface). Running `npm test` may fail at mock compilation until Fhenix publishes aligned plugin + mock packages.

**Workaround for Wave 5:**

1. Verify compile: `npm run test:compile` from repo root (or `npm run compile` in `privabid-contract`) ✅
2. Run manual testnet QA via frontend on Arbitrum Sepolia
3. Review ACL checklist in [SECURITY_AUDIT.md](../SECURITY_AUDIT.md)

## Test files

| File | Coverage |
|------|----------|
| `test/PrivaBid.test.ts` | Multi-mode V1 |
| `test/PrivaBidStandalone.test.ts` | Standalone Vickrey + Dutch |
| `test/PrivaBidReverse.test.ts` | Reverse procurement |
| `test/PrivaBidV2.test.ts` | V2 + Factory V2 + encrypted reserve |

When mocks are updated, re-enable CI with `npm test`.

## Frontend build

```bash
cd privabid-frontend
npm install
npm run build
```

## SDK build

```bash
cd privabid-sdk
npm install
npm run build
```
