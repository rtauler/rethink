# Local driver development and deployment

The `codex/local-drivers-deploy` branch combines the GBBSJ11ESW fridge and
W4X1085NWH washer drivers. Home Assistant builds it as the separate local app
`local_rethink_drivers` (Rethink Local Drivers). Its image includes the drivers
and their registrations. Container recreation requires no patch installers.

The stock `e75b1f28_rethink` app remains installed for rollback, with automatic
updates disabled and startup set to manual. The local app starts automatically;
its upgrades are deliberate source deployments. Do not run both apps together:
they use the same device-facing ports and MQTT device identifiers.

## Develop a driver

Edit `cloud/devices/2REBGLUBD1P_A.ts` or
`cloud/devices/V_V__F___W.B_2QEUK.ts`. Add physical packet captures to the matching
tests in `tests/cloud/devices/`. `tests/cloud/local_drivers.test.ts` also checks
both models through the production registry using captured packets.

Keep separate feature branches for upstream pull requests. Bring their reviewed
driver changes into the deployment branch before releasing. Merge/rebase upstream
updates deliberately, then replay captures before using a new base version.

```sh
npm ci
npm run check
npm test
npm run build
```

Increment `version` in `ha-addon/config.yaml` for every release. Commit all source
changes, including that version bump. Then, from the repository root:

```sh
sh scripts/deploy-ha-addon.sh rtauler@100.73.187.94
```

The command prompts for sudo on dm1. It packages only the committed Git tree,
records its revision in the image, and keeps the release source in
`/home/rtauler/rethink-builds/VERSION-REVISION/source`. Dependencies come from
`package-lock.json`; the Docker build runs the type check and all tests before
compiling. A failed build does not replace the running app.

On the first deployment, the host script copies the existing options, port
mappings, CA certificates and persistent state. Appliance pairings, MQTT IDs and
HA entity identities remain the same. It checks both mapped models and their
MQTT availability/readings before enabling automatic startup. No cycle-control
commands are sent by the deployment health check. Verification uses:

```sh
sudo docker exec app_local_rethink_drivers node dist/tools/check-local-drivers.js
```

The health check expects both appliances to be connected. Deploy while both
modems are online; otherwise it times out after three minutes and reports a
verification failure. Initial migration automatically restores the stock app on
such a failure. Subsequent updates retain a Supervisor app backup and report the
saved source/configuration directory if verification fails.

## Backups and rollback

Each deployment saves the previous app settings and configuration under
`/var/backups/rethink/TIMESTAMP/`, readable only by root. The configuration backup
contains private CA keys and may contain account state; keep it on the host.
Versioned Docker images remain in the local Docker cache. Preserve the Supervisor
backup when pruning images or cleaning release directories.

For a failed future update, use Home Assistant Settings → System → Backups to
restore the app backup created before that update. The previous packaged source
is also saved as `source/` in the deployment backup, and previous releases remain
under `/home/rtauler/rethink-builds/` for rebuilding.

To return to the stock app immediately, stop Rethink Local Drivers in HA, disable
its automatic startup, then start the original Rethink app and enable its startup.
Its original pairing data and the working 0.1.3 driver patch are preserved. Its
automatic updates must remain disabled while it relies on those patches.

The legacy `washer-driver/` and `fridge-driver/` patch copies in the parent project
are recovery artifacts. Make future production driver changes in this repository's
TypeScript source and deploy a new version.
