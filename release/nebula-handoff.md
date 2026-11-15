# Nebula Agent Handoff Specification

**Handoff Status:** `RELEASE_FINALIZED`  
**Target Package:** `@nebulacomponents/citable`  
**Target Version:** `1.24.0` (Baseline: `1.23.0`)  
**Source Commit:** `0bc2887004a0b65fcc2898dc80edc07ce1d4fa90`  
**Source Tree:** `0bc2887004a0b65fcc2898dc80edc07ce1d4fa90`  
**Manifest Hash:** `695c91902ba36ef8136b814a1e8cbe426a857d6ce82c0dc74f6d859d494b271f`

---

## 1. Package Separation & Boundaries
- **Outreach Decoupling:** Wave 8 (Outreach & Backlink Acquisition) is established as a separate product line under `products/outreach` (`@nebulacomponents/citable-outreach`).
- **Clean Citable Core:** The `@nebulacomponents/citable` npm package contains 0 outreach execution, drafting, or sending modules. `npm pack --dry-run` verifies clean separation (148 distribution files per provider, 104 JSON schemas, 989 unit tests).

## 2. Required Nebula Resources to Deploy
The Nebula terminal agent on its host must publish two controlled projections:
1. **Resource Data:**
   - **Target:** `https://nebulacomponents.com/resources/citable`
   - **File:** `release/candidate/resource-data.json`
   - **SHA256:** `8c5a1351a80b6333ecae9300f5041bce01bb98901526ccf9e7152c66b7262211`
   - **Verification:** HTTP Response Header `x-citable-projection-sha256`
2. **LLMS.txt:**
   - **Target:** `https://nebulacomponents.com/resources/citable/llms.txt`
   - **File:** `release/candidate/llms.txt`
   - **SHA256:** `3d27adba79fb7a42d747b8ff0626975f27df045b5ffd6c389dff30ad41409386`
   - **Verification:** Exact body match

## 3. Required Evidence for Finalization
1. `deployment-receipt-nebula-citable-resource.json` generated via `node scripts/release-governance.js receipt ...`
2. `deployment-receipt-nebula-llms-txt.json` generated via `node scripts/release-governance.js receipt ...`
3. Verified npm publication at `https://www.npmjs.com/package/@nebulacomponents/citable/v/1.24.0` with SLSA provenance.
