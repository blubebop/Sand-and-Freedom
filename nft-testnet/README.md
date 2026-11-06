# Sand & Freedom — Curtis NFT test prototype

This is a separate testnet laboratory. It does not replace the live game or email saves.

## Ready to test

- Curtis only: chain ID 33111, verified against https://curtis.rpc.caldera.xyz/http.
- Test owner and treasury: `0x9bdcC6C1Bc968A31a45F1c1E74A2F40A18109E61` (address comparison is case-insensitive).
- Mint: exactly **0.25 test APE**, plus gas paid by the minter. Test APE has no dollar value. This is NOT a live $0.25 price feed.
- Uncapped sequential ERC-721 minting; active tokens transfer-locked.
- Owner-only simulation of checkpoints and final outcomes; revision checking prevents stale overwrites.
- Death: permanently locked memorial. Victory: transferable, permanently frozen record.
- Metadata JSON and embedded SVG test portrait are stored on-chain, so final metadata has no mutable external dependency.
- ERC-5192 and ERC-4906 interface support.
- No upgrade mechanism, resurrection, burn, or terminal-record edit function.
- Test admin changes require two-step ownership transfer. Treasury is immutable.

## Deploy from your wallet

1. Open the preview `/curtis/` page in a browser with your Ethereum-compatible wallet extension (or the wallet's in-app browser).
2. Use the official faucet https://curtis.hub.caldera.xyz to obtain test APE. The supplied wallet had zero test APE when checked during setup.
3. Connect the supplied test wallet. The page requests Curtis, never mainnet.
4. Click **Deploy test contract**, review the wallet's testnet gas quote, and sign.
5. Once confirmed, copy the share link. It includes the contract address so another device can load the same collection. The page also remembers the address locally and records pending deployment transactions for recovery.
6. Mint two tokens. Use one to test a permanent memorial and the other to test victory and a transfer to a second wallet.

Deployment requires the user's wallet signature. No private keys are requested, generated for the user, or stored in this application.

## Reproduce checks

Node 24; npm:

```sh
npm ci --ignore-scripts
npm run build
npm test
```

Pinned OpenZeppelin 5.4.0, Solidity 0.8.38, ethers 6.17.0 and Ganache 7.9.2. Compiler uses optimizer 200 runs and Paris EVM target for compatibility. Newer OpenZeppelin 5.6 uses Cancun-only instructions; this build deliberately uses 5.4.0.

Six local blockchain test groups passed: mainnet rejection; exact mint fee/interfaces/active transfer locks; authority and stale-revision checks; immutable memorial; victory transfer and frozen record; treasury routing. Ganache uses a JavaScript fallback on Node 24.

## What is not wired yet

This prototype does not yet attach gameplay saves to NFT IDs, authenticate wallet sessions to the save service, validate gameplay server-side, automatically render the existing game sprites, or finalize real campaign outcomes. The owner-only controls explicitly simulate those events. The SVG is a test portrait, not the final character art.

Before real-money deployment: implement wallet-authenticated ownership-checked saves and server-authoritative gameplay/outcomes; durable finalization jobs; a verified USD-to-APE quote flow; real character artwork; independent contract review and end-to-end multi-device testing. Ordinary saves should be off-chain and gas-free. Define who pays outcome-finalization gas separately; only buyer-paid mint gas has been agreed.

Mainnet must use a separately reviewed production contract and the owner's chosen production wallet. This contract cannot deploy there.

## Repository layout

`nft-testnet/` contains source, tests, build script and lockfile. `curtis/` contains the served browser files. In this local delivery they are the package root and `site/` respectively. When building from the repository, copy `nft-testnet/site/*` into `curtis/` after the build.
