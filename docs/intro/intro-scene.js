/* ==========================================================================
   FluxPad quick tour: 3D scene and timeline.
   Loaded on demand by intro.js (first visit, or from the "Quick tour" menu).
   Everything here is a pure function of time: setTime(t) puts the camera, the
   cable and the knob exactly where they must be at second t.

   Geometry comes from FluxPad_MacroPad.3mf (case, lid, keycap, knob).
   Pad coordinates: x right, y towards the back (USB-C side), z up, millimetres,
   case centred on the origin. The scene group is rotated so z is "up" in three.js.
   ========================================================================== */
(function () {
    'use strict';

    var THREE = window.THREE;
    var MODELS = window.FLUXPAD_MODELS;
    var D2R = Math.PI / 180;

    /* ---------- layout (taken from the 3MF / STL files) ---------- */
    var GROUND = -10.3;               // underside of the case
    var CASE_TOP = 10.3;
    var LID_Z = 4.15;                 // lid centre; plate top sits 1.9 mm below the case rim
    var PLATE_TOP = LID_Z + 4.25;     // 8.4
    var SWITCH_TOP = PLATE_TOP + 5.0; // switch housing above the plate
    var KEY_BASE = PLATE_TOP + 5.6;   // keycap underside
    var KEY_TOP = KEY_BASE + 6;       // 20.0
    var KNOB_BASE = PLATE_TOP + 2.4;  // knob underside (14 mm tall)

    // Switch hole centres in the lid plate, same numbering as the on-screen keys 1..11
    var KEYS = [
        [-28.4, 8.12], [-10.4, 8.12], [7.6, 8.12],
        [-28.4, -9.88], [-10.4, -9.88], [7.6, -9.88], [25.6, -9.88],
        [-28.4, -27.88], [-10.4, -27.88], [7.6, -27.88], [25.6, -27.88]
    ];
    var KNOB = [28.1, 15.62];                        // encoder shaft
    var PORT = { x: 1.4, y: 43.65, z: -2.5 };        // USB-C opening on the back wall (9.5 x 4.2 mm)

    /* ---------- timeline (seconds) ---------- */
    var DURATION = 31.4;
    var STEP_STARTS = [0, 6.8, 15.0, 23.6];          // where each step's camera move begins
    var CAPTIONS = [[0.8, 7.6], [9.3, 16.4], [17.7, 24.6], [26.7, 99]];
    var AUTO_FINISH = 31.4;

    /* ---------- small helpers ---------- */
    function clamp(x, a, b) { return Math.min(b, Math.max(a, x)); }
    function lerp(a, b, u) { return a + (b - a) * u; }
    function sm(u) { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); }
    var EASE = {
        cubic: function (u) { return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; },
        sine: function (u) { return -(Math.cos(Math.PI * u) - 1) / 2; },
        out: function (u) { return 1 - Math.pow(1 - u, 3); }
    };

    function b64(s) {
        var bin = atob(s), n = bin.length, u = new Uint8Array(n);
        for (var i = 0; i < n; i++) u[i] = bin.charCodeAt(i);
        return u.buffer;
    }

    /* Decode a quantised part and build a geometry with crease-angle smoothing:
       neighbouring faces are blended only when the angle between them is small, so
       flat plates stay crisp while fillets (the knob) look round. */
    function buildGeometry(part, mirrorZ) {
        var q = new Uint16Array(b64(part.pos)), ix = new Uint16Array(b64(part.idx));
        var nv = part.nv, nt = part.nt, pos = new Float32Array(nv * 3), k, i;
        for (i = 0; i < nv; i++) {
            for (k = 0; k < 3; k++) {
                pos[i * 3 + k] = part.min[k] + q[i * 3 + k] / 65535 * (part.max[k] - part.min[k]);
            }
            if (mirrorZ) pos[i * 3 + 2] = -pos[i * 3 + 2];
        }
        var idx = new Uint32Array(ix);
        if (mirrorZ) {
            for (i = 0; i < nt; i++) { var t = idx[i * 3 + 1]; idx[i * 3 + 1] = idx[i * 3 + 2]; idx[i * 3 + 2] = t; }
        }
        var cosT = Math.cos(38 * D2R);
        var fn = new Float32Array(nt * 3), fa = new Float32Array(nt), f;
        for (f = 0; f < nt; f++) {
            var a = idx[f * 3], b = idx[f * 3 + 1], c = idx[f * 3 + 2];
            var ux = pos[b * 3] - pos[a * 3], uy = pos[b * 3 + 1] - pos[a * 3 + 1], uz = pos[b * 3 + 2] - pos[a * 3 + 2];
            var vx = pos[c * 3] - pos[a * 3], vy = pos[c * 3 + 1] - pos[a * 3 + 1], vz = pos[c * 3 + 2] - pos[a * 3 + 2];
            var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
            var l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
            fn[f * 3] = nx / l; fn[f * 3 + 1] = ny / l; fn[f * 3 + 2] = nz / l; fa[f] = l;
        }
        var start = new Uint32Array(nv + 1);
        for (i = 0; i < idx.length; i++) start[idx[i] + 1]++;
        for (i = 0; i < nv; i++) start[i + 1] += start[i];
        var fill = start.slice(0, nv), list = new Uint32Array(idx.length);
        for (f = 0; f < nt; f++) for (k = 0; k < 3; k++) { var vv = idx[f * 3 + k]; list[fill[vv]++] = f; }
        var P = new Float32Array(nt * 9), N = new Float32Array(nt * 9);
        for (f = 0; f < nt; f++) {
            var fx = fn[f * 3], fy = fn[f * 3 + 1], fz = fn[f * 3 + 2];
            for (k = 0; k < 3; k++) {
                var v = idx[f * 3 + k], sx = 0, sy = 0, sz = 0;
                for (var j = start[v]; j < start[v + 1]; j++) {
                    var g = list[j];
                    if (fx * fn[g * 3] + fy * fn[g * 3 + 1] + fz * fn[g * 3 + 2] >= cosT) {
                        sx += fn[g * 3] * fa[g]; sy += fn[g * 3 + 1] * fa[g]; sz += fn[g * 3 + 2] * fa[g];
                    }
                }
                var sl = Math.sqrt(sx * sx + sy * sy + sz * sz) || 1, o = f * 9 + k * 3;
                N[o] = sx / sl; N[o + 1] = sy / sl; N[o + 2] = sz / sl;
                P[o] = pos[v * 3]; P[o + 1] = pos[v * 3 + 1]; P[o + 2] = pos[v * 3 + 2];
            }
        }
        var geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
        geo.setAttribute('normal', new THREE.BufferAttribute(N, 3));
        geo.computeBoundingSphere();
        return geo;
    }

    function roundedRect(w, h, r) {
        var s = new THREE.Shape(), x = -w / 2, y = -h / 2;
        s.moveTo(x + r, y);
        s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
        s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
        s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
        return s;
    }

    function radialTexture(stops) {
        var c = document.createElement('canvas'); c.width = c.height = 256;
        var g = c.getContext('2d'), gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
        stops.forEach(function (s) { gr.addColorStop(s[0], s[1]); });
        g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
        var t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t;
    }

    /* A small studio: soft boxes around a neutral room, baked into an environment
       map so the white plastic and the metal plug get believable reflections. */
    function makeEnvironment(renderer) {
        var s = new THREE.Scene();
        s.add(new THREE.Mesh(new THREE.BoxGeometry(12, 12, 12),
            new THREE.MeshBasicMaterial({ color: new THREE.Color(0x868b95), side: THREE.BackSide })));
        function panel(w, h, intensity, pos) {
            var m = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
                new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 1, 1).multiplyScalar(intensity), side: THREE.DoubleSide }));
            m.position.set(pos[0], pos[1], pos[2]); m.lookAt(0, 0, 0); s.add(m);
        }
        panel(7, 5, 2.6, [0, 5.6, 0.5]);      // top soft box
        panel(1.6, 5, 1.7, [-5.6, 1, 1.5]);   // left strip
        panel(1.6, 5, 1.3, [5.6, 1.5, -1]);   // right strip
        panel(6, 2.4, 1.6, [0, 0.8, 5.6]);    // front fill
        panel(6, 1.4, 0.9, [0, 0.5, -5.6]);   // back fill
        var pm = new THREE.PMREMGenerator(renderer);
        var rt = pm.fromScene(s, 0.035);
        pm.dispose();
        return rt.texture;
    }

    function cssColor(name, fallback) {
        var v = '';
        try { v = getComputedStyle(document.body).getPropertyValue(name).trim(); } catch (e) { /* ignore */ }
        return v || fallback;
    }

    /* ======================================================================
       create(canvas, opts) -> controller
       opts.measure(): { kx, ky, pitch } screen position (px) of on-screen key 3 and
                       the key pitch, used to land the last camera shot exactly on
                       the real interface keypad.
       ====================================================================== */
    function create(canvas, opts) {
        opts = opts || {};
        if (THREE.ColorManagement) {
            if ('enabled' in THREE.ColorManagement) THREE.ColorManagement.enabled = true;
        }
        var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
        renderer.setClearColor(0x000000, 0);
        renderer.outputEncoding = THREE.sRGBEncoding;
        renderer.toneMapping = THREE.NoToneMapping;
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        var dark = document.documentElement.getAttribute('data-theme') === 'dark';
        var accent = new THREE.Color(cssColor('--primary-blue', '#3B82F6'));

        var scene = new THREE.Scene();
        scene.environment = makeEnvironment(renderer);
        var camera = new THREE.PerspectiveCamera(26, 16 / 9, 5, 2000);

        var pad = new THREE.Group();
        pad.rotation.x = -Math.PI / 2;           // pad z-up -> world y-up; pad +y (back) -> world -z
        scene.add(pad);

        /* ---------- materials ---------- */
        var mCase = new THREE.MeshStandardMaterial({ color: 0xf3f4f6, roughness: 0.52, metalness: 0, envMapIntensity: 0.9 });
        var mLid = new THREE.MeshStandardMaterial({ color: 0xeceef2, roughness: 0.46, metalness: 0, envMapIntensity: 0.9 });
        var mKey = new THREE.MeshStandardMaterial({ color: 0xaab4c5, roughness: 0.42, metalness: 0, envMapIntensity: 0.7 });
        var mKnob = new THREE.MeshStandardMaterial({ color: 0xc4ccd9, roughness: 0.3, metalness: 0, envMapIntensity: 0.9 });
        var mSwitch = new THREE.MeshStandardMaterial({ color: 0xdfe2e8, roughness: 0.55, metalness: 0, envMapIntensity: 0.8 });
        var mDark = new THREE.MeshStandardMaterial({ color: 0x2b2f3a, roughness: 0.5, metalness: 0.2 });
        var mMetal = new THREE.MeshStandardMaterial({ color: 0xd3d8e0, roughness: 0.22, metalness: 1.0, envMapIntensity: 1.4 });
        var mPlug = new THREE.MeshStandardMaterial({ color: 0xf1f2f6, roughness: 0.55, metalness: 0, transparent: true });
        var mCable = new THREE.MeshStandardMaterial({ color: 0xf1f2f6, roughness: 0.62, metalness: 0, transparent: true });
        var mAccent = new THREE.MeshBasicMaterial({ color: accent.clone() });
        var mAccentFx = new THREE.MeshBasicMaterial({ color: accent.clone(), transparent: true, opacity: 0, depthWrite: false });

        /* ---------- case and lid ---------- */
        var caseMesh = new THREE.Mesh(buildGeometry(MODELS['case'], false), mCase);
        caseMesh.castShadow = true; caseMesh.receiveShadow = true;
        pad.add(caseMesh);

        // The lid is modelled plate-down for printing; mirrored here so the plate faces up.
        var lidMesh = new THREE.Mesh(buildGeometry(MODELS.lid, true), mLid);
        lidMesh.position.z = LID_Z; lidMesh.castShadow = true; lidMesh.receiveShadow = true;
        pad.add(lidMesh);

        /* ---------- keys: switch housing + keycap ---------- */
        var keyGeo = buildGeometry(MODELS.keycap, false);
        var swGeo = new THREE.BoxGeometry(13.6, 13.6, 7);
        var keyMeshes = [];
        KEYS.forEach(function (p) {
            var sw = new THREE.Mesh(swGeo, mSwitch);
            sw.position.set(p[0], p[1], SWITCH_TOP - 3.5); sw.castShadow = true; sw.receiveShadow = true;
            pad.add(sw);
            var k = new THREE.Mesh(keyGeo, mKey);
            k.scale.set(0.965, 0.965, 1);        // a little air between caps, as on the printed unit
            k.userData.z0 = KEY_BASE + 3;
            k.position.set(p[0], p[1], k.userData.z0); k.castShadow = true;
            pad.add(k); keyMeshes.push(k);
        });

        /* ---------- encoder: bushing, knob, marker, halo ---------- */
        var bushing = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.6, KNOB_BASE - PLATE_TOP + 0.4, 28), mDark);
        bushing.rotation.x = Math.PI / 2;
        bushing.position.set(KNOB[0], KNOB[1], PLATE_TOP + (KNOB_BASE - PLATE_TOP) / 2 - 0.2);
        bushing.castShadow = true;
        pad.add(bushing);

        var knobRig = new THREE.Group();          // moves down when pressed
        knobRig.position.set(KNOB[0], KNOB[1], KNOB_BASE + 7);
        var knobSpin = new THREE.Group();         // turns about the vertical axis
        knobRig.add(knobSpin);
        var knobMesh = new THREE.Mesh(buildGeometry(MODELS.knob, false), mKnob);
        knobMesh.rotation.x = Math.PI;            // printed top-down: flip so the rounded face is on top
        knobMesh.castShadow = true; knobMesh.receiveShadow = true;
        knobSpin.add(knobMesh);
        var markerMat = new THREE.MeshBasicMaterial({ color: accent.clone(), transparent: true, opacity: 0 });
        var marker = new THREE.Mesh(new THREE.BoxGeometry(7.2, 1.3, 0.5), markerMat);
        marker.position.set(3.7, 0, 7.15);
        knobSpin.add(marker);
        pad.add(knobRig);

        var halo = new THREE.Mesh(new THREE.TorusGeometry(12.5, 0.28, 8, 72), mAccentFx);
        halo.position.set(KNOB[0], KNOB[1], PLATE_TOP + 0.8);
        pad.add(halo);

        /* ---------- USB-C: port outline, plug and cable ---------- */
        // basis for objects that point out of the back wall: local z -> pad +y, local y -> pad +z, local x -> pad -x
        var outBasis = new THREE.Matrix4().makeBasis(new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0));

        var ringShape = roundedRect(13.4, 7.4, 3.4);
        ringShape.holes.push(new THREE.Path(roundedRect(11.2, 5.2, 2.5).getPoints(10)));
        var portRing = new THREE.Mesh(new THREE.ShapeGeometry(ringShape, 10), mAccentFx.clone());
        portRing.material.polygonOffset = true; portRing.material.polygonOffsetFactor = -2;
        var portRig = new THREE.Group();
        portRig.matrixAutoUpdate = false;
        portRig.matrix.copy(outBasis).setPosition(PORT.x, PORT.y + 0.05, PORT.z);
        portRig.add(portRing);
        pad.add(portRig);

        var cableRig = new THREE.Group();
        cableRig.matrixAutoUpdate = false;
        var plug = new THREE.Group();
        var metal = new THREE.Mesh(new THREE.ExtrudeGeometry(roundedRect(8.94, 3.26, 1.4),
            { depth: 6.7, bevelEnabled: false, curveSegments: 8 }), mMetal);
        metal.position.z = -6.7;
        var over = new THREE.Mesh(new THREE.ExtrudeGeometry(roundedRect(12.4, 6.6, 2.6),
            { depth: 19, bevelEnabled: true, bevelThickness: 0.5, bevelSize: 0.5, bevelSegments: 3, curveSegments: 10 }), mPlug);
        over.position.z = 0.5;
        var relief = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 3.1, 9, 24), mPlug);
        relief.rotation.x = Math.PI / 2; relief.position.z = 19.5 + 4.5;
        var curve = new THREE.CatmullRomCurve3([
            new THREE.Vector3(0, 0, 28), new THREE.Vector3(0, -0.2, 46), new THREE.Vector3(2.5, -2.6, 64),
            new THREE.Vector3(11, -5.6, 82), new THREE.Vector3(30, -6.1, 106), new THREE.Vector3(62, -6.1, 136),
            new THREE.Vector3(104, -6.1, 172)
        ]);
        var cable = new THREE.Mesh(new THREE.TubeGeometry(curve, 160, 1.7, 14, false), mCable);
        [metal, over, relief, cable].forEach(function (m) { m.castShadow = true; plug.add(m); });
        cableRig.add(plug);
        pad.add(cableRig);

        /* ---------- ground: shadow, contact shadow, LED glow ---------- */
        var shadowBase = dark ? 0.45 : 0.14;
        var shadowMat = new THREE.ShadowMaterial({ opacity: shadowBase });
        var ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), shadowMat);
        ground.position.z = GROUND - 0.02; ground.receiveShadow = true; ground.renderOrder = 1;
        pad.add(ground);

        var contactBase = dark ? 0.9 : 0.5;
        var contact = new THREE.Mesh(new THREE.PlaneGeometry(122, 112), new THREE.MeshBasicMaterial({
            map: radialTexture([[0, 'rgba(0,0,0,0.62)'], [0.55, 'rgba(0,0,0,0.28)'], [1, 'rgba(0,0,0,0)']]),
            transparent: true, depthWrite: false, opacity: contactBase }));
        contact.position.z = GROUND - 0.01; contact.renderOrder = 2;
        pad.add(contact);

        var glowBase = dark ? 0.5 : 0.3;
        var glowMat = new THREE.MeshBasicMaterial({
            map: radialTexture([[0, 'rgba(255,255,255,1)'], [0.45, 'rgba(255,255,255,0.55)'], [1, 'rgba(255,255,255,0)']]),
            color: accent.clone(), transparent: true, depthWrite: false, opacity: glowBase });
        var glow = new THREE.Mesh(new THREE.PlaneGeometry(190, 170), glowMat);
        glow.position.z = GROUND; glow.renderOrder = 3;
        pad.add(glow);

        // the same strip that sits under the card on the page
        var strip = new THREE.Mesh(new THREE.BoxGeometry(66, 1.6, 0.9), mAccent);
        strip.position.set(0, -47.4, GROUND + 0.45);
        pad.add(strip);

        var ledLights = [];
        [[0, -66], [0, 66], [-62, 0], [62, 0]].forEach(function (p) {
            var l = new THREE.PointLight(accent.clone(), dark ? 0.7 : 0.22, 95, 1.8);
            l.position.set(p[0], p[1], GROUND + 3);
            pad.add(l); ledLights.push(l);
        });

        /* ---------- key light ---------- */
        var sun = new THREE.DirectionalLight(0xffffff, 0.52);
        sun.position.set(-80, 170, 120);
        sun.castShadow = true;
        sun.shadow.mapSize.set(2048, 2048);
        sun.shadow.camera.left = -110; sun.shadow.camera.right = 110;
        sun.shadow.camera.top = 110; sun.shadow.camera.bottom = -110;
        sun.shadow.camera.near = 20; sun.shadow.camera.far = 600;
        sun.shadow.bias = -0.0012; sun.shadow.normalBias = 0.6; sun.shadow.radius = 9; sun.shadow.blurSamples = 16;
        scene.add(sun);
        scene.add(new THREE.HemisphereLight(0xffffff, 0xe6e8ed, 0.34));
        var fill = new THREE.DirectionalLight(0xffffff, 0.36);   // soft fill from the camera side keeps the walls white
        fill.position.set(110, 70, 170);
        scene.add(fill);
        var back = new THREE.DirectionalLight(0xffffff, 0.34);   // lights the USB-C wall seen from behind
        back.position.set(-70, 90, -180);
        scene.add(back);

        /* ---------- camera keyframes ----------
           az: 0 = looking from the front, +90 = from the right side, 180 = from behind
           (target in world coordinates: x right, y up, z towards the viewer) */
        var KF = [
            { t: 0.0, e: 'sine', az: -40, el: 29, dist: 288, fov: 26, sx: 0.13, sy: 0.05, tx: 0, ty: 6, tz: -2 },
            { t: 6.8, e: 'sine', az: -24, el: 26, dist: 258, fov: 26, sx: 0.13, sy: 0.05, tx: 0, ty: 6, tz: -2 },
            { t: 9.4, e: 'cubic', az: 148, el: 15, dist: 150, fov: 26, sx: 0.2, sy: 0.0, tx: PORT.x, ty: PORT.z + 1.5, tz: -PORT.y + 4 },
            { t: 15.0, e: 'sine', az: 158, el: 11, dist: 120, fov: 26, sx: 0.2, sy: 0.0, tx: PORT.x, ty: PORT.z + 0.5, tz: -PORT.y + 4 },
            { t: 17.8, e: 'cubic', az: 84, el: 6, dist: 170, fov: 26, sx: 0.2, sy: 0.14, tx: KNOB[0] - 6, ty: 15, tz: -KNOB[1] },
            { t: 23.6, e: 'sine', az: 70, el: 11, dist: 128, fov: 26, sx: 0.2, sy: 0.14, tx: KNOB[0] - 6, ty: 16, tz: -KNOB[1] },
            { t: 27.4, e: 'cubic', final: true },
            { t: 99, e: 'sine', final: true }
        ];

        var vw = 1, vh = 1, distScale = 1;

        function finalPose() {
            var m = opts.measure ? opts.measure() : null;
            var fov = 24;
            var pitch = m ? m.pitch : 96, kx = m ? m.kx : vw * 0.3, ky = m ? m.ky : vh * 0.46;
            var s = pitch / 18;                                   // px per mm on the key-top plane
            var f = (vh / 2) / Math.tan(fov * D2R / 2);
            var xc = KEYS[2][0] + (vw / 2 - kx) / s;
            var yc = KEYS[2][1] - (vh / 2 - ky) / s;
            return { az: 0, el: 89.99, dist: f / s, fov: fov, sx: 0, sy: 0, tx: xc, ty: KEY_TOP, tz: -yc };
        }

        var frames = KF.map(function (k) { return k; });
        var NUM = ['az', 'el', 'dist', 'fov', 'sx', 'sy', 'tx', 'ty', 'tz'];

        function poseAt(t) {
            var fin = finalPose(), i = 0;
            function P(k) { return k.final ? fin : k; }
            while (i < frames.length - 2 && t >= frames[i + 1].t) i++;
            var a = frames[i], b = frames[i + 1];
            var u = clamp((t - a.t) / (b.t - a.t), 0, 1), e = EASE[b.e || 'cubic'](u);
            var pa = P(a), pb = P(b), out = {};
            NUM.forEach(function (n) { out[n] = lerp(pa[n], pb[n], e); });
            return out;
        }

        function applyCamera(p, scaleDist) {
            var az = p.az * D2R, el = p.el * D2R, ce = Math.cos(el), d = p.dist * scaleDist;
            camera.position.set(p.tx + d * Math.sin(az) * ce, p.ty + d * Math.sin(el), p.tz + d * Math.cos(az) * ce);
            camera.up.set(0, 1, 0);
            camera.lookAt(p.tx, p.ty, p.tz);
            camera.fov = p.fov;
            camera.aspect = vw / vh;
            camera.setViewOffset(vw, vh, -p.sx * vw, p.sy * vh, vw, vh);
            camera.updateProjectionMatrix();
        }

        function resize() {
            var w = canvas.clientWidth || window.innerWidth, h = canvas.clientHeight || window.innerHeight;
            var dpr = Math.min(window.devicePixelRatio || 1, 2);
            renderer.setPixelRatio(dpr);
            renderer.setSize(w, h, false);
            vw = w; vh = h;
            var aspect = w / h;
            distScale = aspect < 1.45 ? 1.45 / aspect : 1;
        }

        function setAccent(hex) {
            accent.set(hex);
            [mAccent, mAccentFx, markerMat, glowMat, portRing.material].forEach(function (m) { m.color.copy(accent); });
            ledLights.forEach(function (l) { l.color.copy(accent); });
        }

        /* ---------- the timeline ---------- */
        function setTime(t) {
            var p = poseAt(t), isFinal = t > 27.4;
            applyCamera(p, isFinal ? 1 : lerp(distScale, 1, sm((t - 23.6) / 3.8)));

            var settle = sm((t - 24.4) / 3.0);
            shadowMat.opacity = shadowBase * (1 - settle);
            glowMat.opacity = glowBase * (1 - settle);
            contact.material.opacity = contactBase * (1 - 0.85 * settle);

            // cable: fades in while the camera swings round, slides in, then fades away
            var ins = clamp((t - 10.0) / 3.2, 0, 1);
            var off = 62 * (1 - EASE.out(ins));
            var op = sm((t - 8.2) / 0.9) * (1 - sm((t - 23.8) / 1.8));
            cableRig.visible = op > 0.01;
            cableRig.matrix.copy(outBasis).setPosition(PORT.x, PORT.y + off, PORT.z);
            mPlug.opacity = op; mCable.opacity = op;
            mMetal.opacity = 1; mMetal.transparent = false;
            metal.visible = op > 0.5 || off > 0.5;

            // port outline pulses until the plug arrives
            var hint = sm((t - 8.6) / 0.8) * (1 - sm((t - 13.0) / 0.7));
            portRing.material.opacity = hint * (0.55 + 0.45 * Math.sin(t * 6));
            portRig.visible = hint > 0.01;

            // knob: spin, then press
            var spin = EASE.cubic(clamp((t - 18.4) / 3.6, 0, 1)) * Math.PI * 2 * 1.5;
            knobSpin.rotation.z = -spin;
            var press = Math.sin(Math.PI * clamp((t - 22.0) / 0.7, 0, 1));
            knobRig.position.z = KNOB_BASE + 7 - 1.7 * press;
            markerMat.opacity = sm((t - 17.8) / 0.6) * (1 - sm((t - 24.2) / 0.8));
            var hp = clamp((t - 17.8) / 5.2, 0, 1);
            var hv = hp > 0 && hp < 1 ? 1 : 0;
            var cyc = (t * 0.55) % 1;
            halo.scale.setScalar(1 + 0.22 * cyc);
            mAccentFx.opacity = hv * (1 - cyc) * 0.75;

            // finale: a quick ripple over the keys as the camera settles above them
            keyMeshes.forEach(function (k, i) {
                var u = (t - (28.0 + i * 0.09)) / 0.55;
                var dz = u > 0 && u < 1 ? -1.3 * Math.sin(Math.PI * u) : 0;
                k.position.z = k.userData.z0 + dz;
            });

            renderer.render(scene, camera);
        }

        function dispose() {
            scene.traverse(function (o) {
                if (o.geometry) o.geometry.dispose();
                if (o.material) {
                    var ms = Array.isArray(o.material) ? o.material : [o.material];
                    ms.forEach(function (m) { if (m.map) m.map.dispose(); m.dispose(); });
                }
            });
            if (scene.environment) scene.environment.dispose();
            renderer.dispose();
            if (renderer.forceContextLoss) renderer.forceContextLoss();
        }

        resize();
        return {
            setTime: setTime, resize: resize, dispose: dispose, setAccent: setAccent,
            duration: DURATION, stepStarts: STEP_STARTS, captions: CAPTIONS, autoFinish: AUTO_FINISH
        };
    }

    window.FluxIntroScene = { create: create };
})();
