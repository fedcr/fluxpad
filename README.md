# FluxPad

Configurator and dashboard for the FluxPad macro pad: 11 keys + rotary encoder, per-page LED colour, optional BLE/ESP32 add-on.

## Repository layout

```
fluxpad/
├── web/                  Browser app (open through a local server, see below)
│   ├── index.html        Configurator: device preview (left) + controls (right)
│   ├── app.js            Web Serial logic, key config, presets, LED colour
│   ├── theme.js          Light / dark switch (light by default, remembered)
│   ├── logos.css         Brand marks (embedded, so they also work from file://)
│   ├── intro/            First-run quick tour (3D, built from the 3MF parts)
│   │   ├── intro.js / intro.css / intro-scene.js   controller, styles, scene and timeline
│   │   ├── models.js     Case, lid, keycap and knob meshes
│   │   └── three.min.js  three.js r150 (MIT)
│   ├── style.css         Configurator styles
│   ├── dashboard.html    Usage statistics and key heatmap
│   ├── dashboard.js      Dashboard logic
│   └── dashboard.css     Dashboard styles
├── assets/               Logos (FluxPad, Everythink, PCBWay)
├── daemon/
│   └── fluxpad_daemon.py Background bridge for Home Assistant / AI shortcuts
└── docs/
    └── fluxpad_instructions.pdf   User manual
```

## Running the configurator

Web Serial needs a secure context. Serve the repository from localhost rather than opening the file directly:

```bash
cd fluxpad
python3 -m http.server 8000
```

Then open `http://localhost:8000/web/` in Chromium or Edge and press **CONNECT**.

## Python daemon (optional)

Needed only for external integrations such as Home Assistant webhooks, and when you want the pad to keep working with the browser closed.

```bash
pip install pyserial requests
python3 daemon/fluxpad_daemon.py
```

Edit `SERIAL_PORT` and `SMART_HOME_WEBHOOKS` at the top of the script first.

## Themes

The interface opens in light mode. Use the Light / Dark switch at the top of the controls panel (or in the dashboard header); the choice is saved in the browser. Animations are disabled automatically if your system has reduced motion enabled.

## Quick tour

On the very first visit a short 3D guide plays (intro, USB-C cable, encoder, hand-off to the interface). It is shown once per browser: the "already seen" flag lives in `localStorage`, nothing is written to the device. Replay it from the bottom menu (Tools > Quick tour). `?intro=1` forces it and `?intro=0` hides it.

## macOS shortcuts

Command is captured as `cmd+` (code 131), and Option letters and digits are read from the physical key, so `Option+A` works even though macOS types `å`. For Command to actually send a keypress, the firmware must map modifier code 131 to the HID Left GUI key (`0x08`), next to 128 (Ctrl), 129 (Shift) and 130 (Alt).

Limits:
- Each shortcut has one modifier (the firmware byte carries a single modifier code).
- Shortcuts reserved by macOS or the browser (Cmd+Q, Cmd+W, Cmd+Space, Cmd+Tab) cannot be captured in the page.

## Sponsors

FluxPad is made by Everythink. PCBs are sponsored by PCBWay.

## Licence

Add a licence before publishing (for example MIT or CERN-OHL-S for hardware-related material).
