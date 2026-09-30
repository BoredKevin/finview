# Finview

> Zero-knowledge, local-first financial intelligence & statement parsing platform.

Finview enables automated bank statement ingestion (PDF & CSV), coordinate-normalized tabular extraction, visual parser calibration, client-side financial analytics, cash flow visualization, and decentralized parser sharing without ever transmitting unencrypted financial data to external cloud servers.

## Quick Links
- **[System Architecture & Engineering Handbook](docs/README.md)**: In-depth architecture map, threat model, system invariants, and setup guide.
- **[Zero-Knowledge Sync Architecture](docs/architecture/e2ee-sync.md)**: E2EE cryptographic envelope specification.
- **[Marketplace Security Specification](docs/architecture/marketplace-security.md)**: Decentralized parser registry, gatekeeper validation sandbox, and demotion policies.
- **[User Guide: Creating Parsers](docs/user-guides/creating-parsers.md)**: Visual Parser Studio calibration guide.

## System Invariants
1. **Zero Data Egress**: Unencrypted transaction figures, merchants, and balances never leave client memory.
2. **UI Responsiveness**: Heavy parsing and analytics calculations never block the main thread.

## Quickstart
```bash
npm install
npm run build
npm test
```
See **[docs/README.md](docs/README.md)** for full details.
