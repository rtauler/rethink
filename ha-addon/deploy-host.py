#!/usr/bin/env python3
"""Deploy a packaged local add-on on dm1. Run with sudo; never stores API tokens."""
import datetime
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request

OLD = "e75b1f28_rethink"
NEW = "local_rethink_drivers"
BASE = Path("/var/lib/homeassistant")
TARGET = BASE / "apps/local/rethink_drivers"


def api(path, payload=None):
    # Read the already privileged CLI token into memory only. A store refresh can
    # restart the CLI container; the long build request must survive that restart.
    info = json.loads(subprocess.check_output(["docker", "inspect", "hassio_cli"]))[0]
    token = next(item.split("=", 1)[1] for item in info["Config"]["Env"]
                 if item.startswith("SUPERVISOR_TOKEN="))
    request = urllib.request.Request(
        "http://172.30.32.2" + path,
        data=None if payload is None else json.dumps(payload).encode(),
        headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=1800) as result:
            response = json.load(result)
    except urllib.error.HTTPError as error:
        response = json.load(error)
    if response.get("result") != "ok":
        raise RuntimeError(f"Supervisor rejected {path}: {response.get('message', 'unknown error')}")
    return response.get("data") or {}


def check():
    # Supervisor reports start before the application's listener is ready.
    for attempt in range(30):
        result = subprocess.run([
            "docker", "exec", "app_" + NEW, "node", "dist/tools/check-local-drivers.js",
        ], capture_output=True, text=True, timeout=190)
        if result.returncode == 0:
            print(result.stdout, end="", flush=True)
            return
        if "ECONNREFUSED" not in result.stderr or attempt == 29:
            raise RuntimeError("Device health check failed: " + result.stderr)
        time.sleep(2)


def main():
    if os.geteuid() != 0 or len(sys.argv) != 2:
        sys.exit("Usage: sudo python3 ha-addon/deploy-host.py PACKAGED_SOURCE_DIRECTORY")
    os.umask(0o077)
    source = Path(sys.argv[1]).resolve()
    if source == TARGET or TARGET in source.parents or source in TARGET.parents:
        sys.exit("Use a separate release directory as the source")
    revision = (source / "SOURCE_REVISION").read_text().strip()
    if not re.fullmatch(r"[0-9a-f]{40}", revision):
        sys.exit("Package lacks a valid source revision")
    manifest = (source / "config.yaml").read_text()
    version = re.search(r"^version: ['\"]?([^'\"\n]+)", manifest, re.M).group(1)
    installed = {item["slug"] for item in api("/addons")["addons"]}
    stock = api(f"/addons/{OLD}/info")
    custom = api(f"/addons/{NEW}/info") if NEW in installed else None
    initial = custom is None or (stock["state"] == "started" and custom["state"] != "started")
    previous = stock if initial else custom
    same_version = custom is not None and custom["version"] == version
    if same_version:
        # Supervisor removes stopped containers, so inspect the retained image.
        arch = subprocess.check_output(["uname", "-m"], text=True).strip()
        arch = {"x86_64": "amd64", "aarch64": "aarch64", "armv7l": "armv7"}[arch]
        actual = subprocess.check_output([
            "docker", "image", "inspect", f"local/{arch}-addon-rethink_drivers:{version}", "--format",
            '{{index .Config.Labels "org.opencontainers.image.revision"}}',
        ], text=True).strip()
        if actual != revision:
            sys.exit("This version already identifies a different revision; increment ha-addon/config.yaml")
    if same_version and not initial:
        print(f"{NEW} already runs {version}; checking health", flush=True)
        if custom["state"] != "started":
            api(f"/addons/{NEW}/start", {})
        check()
        return

    stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    backup = Path("/var/backups/rethink") / stamp
    backup.mkdir(parents=True)
    (backup / "previous-settings.json").write_text(json.dumps(previous, indent=2))
    previous_slug = OLD if initial else NEW
    config = BASE / "app_configs" / previous_slug
    shutil.copytree(config, backup / "config")
    print(f"Saved settings and pairing data in {backup}", flush=True)

    api(f"/addons/{OLD}/options", {"auto_update": False})
    if TARGET.exists():
        shutil.move(str(TARGET), str(backup / "source"))
    shutil.copytree(source, TARGET)
    # Supervisor's build process must be able to read the source tree.
    for root, dirs, files in os.walk(TARGET):
        os.chmod(root, 0o755)
        for name in files:
            os.chmod(Path(root) / name, 0o644)
    print(f"Building {version} from {revision}", flush=True)
    api("/store/reload", {})
    switched = False
    try:
        if initial:
            if custom is None:
                api(f"/store/addons/{NEW}/install", {"background": False})
            elif not same_version:
                api(f"/store/addons/{NEW}/update", {"background": False, "backup": True})
            api(f"/addons/{NEW}/options", {
                "options": previous["options"], "network": previous["network"],
                "auto_update": False, "boot": "manual", "ingress_panel": True,
            })
            # The old instance stays live until the image has finished building.
            api(f"/addons/{OLD}/options", {"boot": "manual", "watchdog": False})
            switched = True
            api(f"/addons/{OLD}/stop", {})
            destination = BASE / "app_configs" / NEW
            destination.mkdir(parents=True, exist_ok=True)
            shutil.copytree(config, destination, dirs_exist_ok=True)
            for filename in ("ca.key", "ca.cert"):
                if (config / filename).read_bytes() != (destination / filename).read_bytes():
                    raise RuntimeError(f"Pairing data copy failed: {filename}")
            api(f"/addons/{NEW}/start", {})
        else:
            # Supervisor builds the candidate before replacing the running container.
            api(f"/addons/{NEW}/options", {"auto_update": False})
            switched = True
            api(f"/store/addons/{NEW}/update", {"background": False, "backup": True})
        check()
        api(f"/addons/{NEW}/options", {"boot": "auto", "auto_update": False})
        info = api(f"/addons/{NEW}/info")
        print(json.dumps({key: info.get(key) for key in ("slug", "version", "state", "boot", "auto_update")}))
        print(f"Deployment verified; rollback files: {backup}", flush=True)
    except Exception:
        if initial and switched:
            print("Verification failed; restoring the stock add-on", flush=True)
            try:
                api(f"/addons/{NEW}/options", {"boot": "manual", "watchdog": False})
                api(f"/addons/{NEW}/stop", {})
                api(f"/addons/{OLD}/options", {"boot": "auto", "auto_update": False})
                api(f"/addons/{OLD}/start", {})
                # Starting through Supervisor recreates the stock container too.
                for model in ("fridge", "washer"):
                    subprocess.run([
                        "docker", "exec", "app_" + OLD, "node",
                        f"/app/data/rethink-{model}-patch/install.mjs",
                    ], check=True)
                subprocess.run([
                    "docker", "exec", "app_" + OLD, "node",
                    "/app/data/rethink-washer-patch/smoke-test.mjs",
                ], check=True)
                subprocess.run(["docker", "restart", "app_" + OLD], check=True)
            except Exception as error:
                print(f"Rollback needs attention: {error}", file=sys.stderr)
        elif not initial:
            print(f"Update failed; restore the Supervisor backup or use {backup}/source", file=sys.stderr)
        raise


if __name__ == "__main__":
    main()
