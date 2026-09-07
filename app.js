var serialPort;
var serialWriter;
var selectedKeyIndex = -1;

var lockFeatureEnabled = true;
var featureEnabled = false;
var autoRepeatEnabled = false;
var jigglerEnabled = false;
var btModuleConnected = false;
var currentPage = 0;

var pageData = {};
var defaultColors = ["#5a1e1e", "#1e485a", "#5a1e54", "#565a1e", "#295a1e", "#1e5a56", "#1e215a", "#5a1e28", "#5a4d1e"];


// Inizializzazione della memoria del configuratore
for (let i = 0; i < 9; i++) {
    pageData[i] = { 
        color: defaultColors[i], 
        keyModes: {},
        isString: {}, 
        macros: {}, 
        strings: {},
        tdSingles: {},
        tdDoubles: {},
        tdHolds: {},
        burstCounts: {},
        burstSpeeds: {},
        totps: {}
    };
    for (let k = 0; k < 11; k++) {
        pageData[i].keyModes[k] = 0;
        pageData[i].burstCounts[k] = 5;
        pageData[i].burstSpeeds[k] = 50;
        pageData[i].totps[k] = ""; 
    }
}

function hexToRgb(hex) {
    var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) } : null;
}

function updateThemeColor(hexColor) {
    var body = document.getElementById('app-body');
    body.style.setProperty('--primary-blue', hexColor);
    var rgb = hexToRgb(hexColor);
    if(rgb) {
        body.style.setProperty('--light-blue', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.15)`);
        body.style.setProperty('--panel-bg-gradient', `radial-gradient(circle at center, rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.12) 0%, var(--panels-background) 70%)`);
    }
}

function closeAllMenus() {
    document.getElementById('top-settings-panel').style.display = 'none';
    document.getElementById('bottom-settings-panel').style.display = 'none';
    document.getElementById('key-settings-panel').style.display = 'none';
}

function toggleTopMenu() {
    var panel = document.getElementById('top-settings-panel');
    var isClosed = (panel.style.display === 'none' || panel.style.display === '');
    closeAllMenus();
    if (isClosed) panel.style.display = 'flex';
}

function toggleBottomMenu() {
    var panel = document.getElementById('bottom-settings-panel');
    var isClosed = (panel.style.display === 'none' || panel.style.display === '');
    closeAllMenus();
    if (isClosed) panel.style.display = 'flex';
}

function toggleKeySettings() {
    var panel = document.getElementById('key-settings-panel');
    var isClosed = (panel.style.display === 'none' || panel.style.display === '');
    closeAllMenus();
    if (isClosed) panel.style.display = 'flex';
}

function toggleLockMode() {
    lockFeatureEnabled = document.getElementById('lock-toggle').checked;
    sendSerialData("SET_LOCKMODE:" + (lockFeatureEnabled ? "1" : "0") + "\n");
}

function toggleFeature() {
    featureEnabled = document.getElementById('feature-toggle').checked;
    var dots = document.getElementById('pagination-dots');
    var colorGroup = document.getElementById('color-picker-group');
    
    if (featureEnabled) {
        dots.style.display = 'flex';
        colorGroup.style.display = 'block';
        updateThemeColor(pageData[currentPage].color);
    } else {
        dots.style.display = 'none';
        colorGroup.style.display = 'none';
        currentPage = 0;
        updatePaginationUI();
        var body = document.getElementById('app-body');
        body.style.removeProperty('--primary-blue');
        body.style.removeProperty('--light-blue');
        body.style.removeProperty('--panel-bg-gradient');
    }
    refreshKeyUI();
    sendSerialData("SET_FEATURE:" + (featureEnabled ? "1" : "0") + "\n");
}

function toggleAutoRepeat() {
    autoRepeatEnabled = document.getElementById('autorepeat-toggle').checked;
    document.getElementById('autorepeat-configs').style.display = autoRepeatEnabled ? 'flex' : 'none';
    updateAutoRepeatConfig();
}

function updateAutoRepeatConfig() {
    var arDelay = document.getElementById('ar-delay').value;
    var arSpeed = document.getElementById('ar-speed').value;
    document.getElementById('ar-delay-val').innerText = arDelay + 'ms';
    document.getElementById('ar-speed-val').innerText = arSpeed + 'ms';
    sendSerialData("SET_AUTOREPEAT:" + (autoRepeatEnabled ? 1 : 0) + ":" + arDelay + ":" + arSpeed + "\n");
}

function toggleJiggler() {
    jigglerEnabled = document.getElementById('jiggler-toggle').checked;
    document.getElementById('jiggler-configs').style.display = jigglerEnabled ? 'flex' : 'none';
    updateJigglerConfig();
}

function updateJigglerConfig() {
    var interval = document.getElementById('jiggler-interval').value;
    sendSerialData("SET_JIGGLER:" + (jigglerEnabled ? 1 : 0) + ":" + interval + "\n");
}

function updateGlobalSettings() {
    var dbnc = document.getElementById('global-debounce').value;
    sendSerialData("SET_DEBOUNCE:" + dbnc + "\n");
    
    var encMult = document.getElementById('global-enc-mult').value;
    sendSerialData("SET_ENCMULT:" + encMult + "\n");

    var lMode = document.getElementById('lock-toggle').checked ? 1 : 0;
    sendSerialData("SET_LOCKMODE:" + lMode + "\n");
}

function setPage(index) {
    if (!featureEnabled) return;
    currentPage = index;
    updatePaginationUI();
    refreshKeyUI();
    document.getElementById('page-color').value = pageData[currentPage].color;
    updateThemeColor(pageData[currentPage].color);
}

function updatePaginationUI() {
    var dots = document.querySelectorAll('.dot');
    for (var i = 0; i < dots.length; i++) {
        if (i === currentPage) dots[i].classList.add('active');
        else dots[i].classList.remove('active');
    }
}

function savePageColor() {
    var hexColor = document.getElementById('page-color').value;
    pageData[currentPage].color = hexColor;
    updateThemeColor(hexColor);
    var r = parseInt(hexColor.substr(1,2), 16);
    var g = parseInt(hexColor.substr(3,2), 16);
    var b = parseInt(hexColor.substr(5,2), 16);
    sendSerialData("SET_COLOR:" + currentPage + ":" + r + ":" + g + ":" + b + "\n");
}

function selectKey(index, buttonElement) {
    selectedKeyIndex = index;
    closeAllMenus();

    var allKeys = document.querySelectorAll('.key, .knob');
    for (var i = 0; i < allKeys.length; i++) { allKeys[i].classList.remove('selected'); }
    buttonElement.classList.add('selected');
    
    document.getElementById('action-settings-container').style.display = 'block';
    document.getElementById('save-btn-group').style.display = 'block';
    
    refreshKeyUI();
}

function refreshKeyUI() {
    if (selectedKeyIndex === -1) return;

    if (selectedKeyIndex === 11) {
        document.getElementById('display-selected-key').value = "Knob Press (VOL)";
        document.getElementById('action-settings-container').style.display = 'none';
        document.getElementById('key-mode').value = "0";
    } else {
        var pageText = featureEnabled ? " (Page " + (currentPage + 1) + ")" : "";
        document.getElementById('display-selected-key').value = "Key " + (selectedKeyIndex + 1) + pageText;
        document.getElementById('action-settings-container').style.display = 'block';
        
        var mode = pageData[currentPage].keyModes[selectedKeyIndex];
        if (mode === 0 && pageData[currentPage].isString[selectedKeyIndex]) {
            mode = 7;
        }
        document.getElementById('key-mode').value = mode;
    }
    
    switchKeyMode(); 
    
    document.getElementById('input-shortcut').value = pageData[currentPage].macros[selectedKeyIndex] || "";
    document.getElementById('input-string').value = pageData[currentPage].strings[selectedKeyIndex] || "";
    
    document.getElementById('td-single').value = pageData[currentPage].tdSingles[selectedKeyIndex] || "";
    document.getElementById('td-double').value = pageData[currentPage].tdDoubles[selectedKeyIndex] || "";
    document.getElementById('td-hold').value = pageData[currentPage].tdHolds[selectedKeyIndex] || "";
    
    document.getElementById('burst-count').value = pageData[currentPage].burstCounts[selectedKeyIndex] || 5;
    document.getElementById('burst-speed').value = pageData[currentPage].burstSpeeds[selectedKeyIndex] || 50;

    document.getElementById('input-totp').value = pageData[currentPage].totps[selectedKeyIndex] || "";
}

function switchKeyMode() {
    var mode = parseInt(document.getElementById('key-mode').value);
    
    document.getElementById('panel-standard').style.display = 'none';
    document.getElementById('panel-burst-params').style.display = 'none';
    document.getElementById('panel-tapdance').style.display = 'none';
    document.getElementById('panel-axis').style.display = 'none';
    document.getElementById('panel-numpad').style.display = 'none';
    document.getElementById('panel-totp').style.display = 'none';
    document.getElementById('shortcut-group').style.display = 'none';
    document.getElementById('string-group').style.display = 'none';

    if (mode === 0) { 
        document.getElementById('panel-standard').style.display = 'block';
        document.getElementById('shortcut-group').style.display = 'block';
    } else if (mode === 7) { 
        document.getElementById('panel-standard').style.display = 'block';
        document.getElementById('string-group').style.display = 'block';
    } else if (mode === 1) { 
        document.getElementById('panel-tapdance').style.display = 'block';
    } else if (mode === 2) { 
        document.getElementById('panel-standard').style.display = 'block';
        document.getElementById('panel-burst-params').style.display = 'block';
        document.getElementById('shortcut-group').style.display = 'block';
    } else if (mode === 3 || mode === 4) { 
        document.getElementById('panel-axis').style.display = 'block';
    } else if (mode === 5) {
        document.getElementById('panel-numpad').style.display = 'block';
    } else if (mode === 6) { 
        document.getElementById('panel-totp').style.display = 'block';
    }
    
    checkBluetoothPresence();
}

// Mostra o nasconde il blocco del modulo bluetooth nell'interfaccia
function checkBluetoothPresence() {
    let hasTOTP = false;
    for (let p = 0; p < 9; p++) {
        for (let k = 0; k < 11; k++) {
            if (pageData[p].keyModes[k] == 6) {
                hasTOTP = true;
            }
        }
    }
    
    const btDiv = document.getElementById('bt-module');
    if (btDiv) {
        if (btModuleConnected || hasTOTP || document.getElementById('key-mode').value == 6) {
            btDiv.style.display = 'flex';
        } else {
            btDiv.style.display = 'none';
        }
    }
}

document.addEventListener('keydown', function(event){
    var activeElem = document.activeElement;
    if (!activeElem || !activeElem.classList.contains('capture-shortcut')) return; 
    
    event.preventDefault();
    var modifierString = "";
    if (event.ctrlKey) modifierString += "ctrl+";
    if (event.shiftKey) modifierString += "shift+";
    if (event.altKey) modifierString += "alt+";

    var mainKey = event.key.toLowerCase();
    if (mainKey === "control" || mainKey === "shift" || mainKey === "alt") return;
    
    if (mainKey === "enter") mainKey = "enter";
    if (mainKey === "escape") mainKey = "esc";
    if (mainKey === "printscreen") mainKey = "printscreen";
    if (mainKey === " ") mainKey = "space";

    activeElem.value = modifierString + mainKey;
});

async function connectSerial(){
    if ("serial" in navigator){
        try {
            serialPort = await navigator.serial.requestPort();
            await serialPort.open({ baudRate: 9600 });
            document.getElementById('banner').style.display='none';
            
            readLoop();

            const textEncoder = new TextEncoderStream();
            textEncoder.readable.pipeTo(serialPort.writable);
            serialWriter = textEncoder.writable.getWriter();
            
            updateGlobalSettings();
            sendSerialData("CHECK_BT\n");
            
        } catch (error) { 
            alert("Error during connection..."); 
        }
    } else { 
        alert("Your browser does not support Web Serial, please use Chrome or Edge."); 
    }
}

async function readLoop() {
    const textDecoder = new TextDecoderStream();
    const readableStreamClosed = serialPort.readable.pipeTo(textDecoder.writable);
    const reader = textDecoder.readable.getReader();
    let buffer = "";

    try {
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += value;
            let lines = buffer.split('\n');
            buffer = lines.pop();
            
            for (let line of lines) {
                if (line.includes("PING") || line.includes("BT_DETECTED") || line.includes("HAS_BT:1")) {
                    btModuleConnected = true;
                    checkBluetoothPresence();
                }
            }
        }
    } catch (error) {
        console.error("Reading interrupted", error);
    }
}

async function sendSerialData(data){ if (serialWriter) await serialWriter.write(data); }

function parseShortcutToCodes(shortcutText) {
    var modCode = 0; var kCode = 0;
    if (shortcutText === "") return { m: 0, k: 0 };
    
    var tempStr = shortcutText;
    if (tempStr.includes("ctrl+")) { modCode = 128; tempStr = tempStr.replace("ctrl+", ""); }
    else if (tempStr.includes("shift+")) { modCode = 129; tempStr = tempStr.replace("shift+", ""); }
    else if (tempStr.includes("alt+")) { modCode = 130; tempStr = tempStr.replace("alt+", ""); }

    if (tempStr === "enter") kCode = 176;
    else if (tempStr === "esc") kCode = 177;
    else if (tempStr === "backspace") kCode = 178;
    else if (tempStr === "tab") kCode = 179;
    else if (tempStr === "space") kCode = 32;
    else if (tempStr === "printscreen") kCode = 206;
    else if (tempStr.length === 1) kCode = tempStr.charCodeAt(0);
    
    return { m: modCode, k: kCode };
}

function saveToDevice() {
    if (!serialPort || selectedKeyIndex === -1) return;
    
    var targetPage = featureEnabled ? currentPage : 0;
    var mode = parseInt(document.getElementById('key-mode').value);
    if (selectedKeyIndex === 11) mode = 0; 
    
    pageData[currentPage].keyModes[selectedKeyIndex] = mode;
    sendSerialData("SET_MODE:" + targetPage + ":" + selectedKeyIndex + ":" + mode + "\n");
    
    if (mode === 0 || mode === 2) { 
        pageData[currentPage].isString[selectedKeyIndex] = false;
        var shortcutText = document.getElementById('input-shortcut').value;
        pageData[currentPage].macros[selectedKeyIndex] = shortcutText;
        var codes = parseShortcutToCodes(shortcutText);
        sendSerialData("SET_MACRO:" + targetPage + ":" + selectedKeyIndex + ":" + codes.m + ":" + codes.k + "\n");
        
        if (mode === 2) {
            var bCount = document.getElementById('burst-count').value;
            var bSpeed = document.getElementById('burst-speed').value;
            pageData[currentPage].burstCounts[selectedKeyIndex] = bCount;
            pageData[currentPage].burstSpeeds[selectedKeyIndex] = bSpeed;
            sendSerialData("SET_BURST:" + targetPage + ":" + selectedKeyIndex + ":" + bCount + ":" + bSpeed + "\n");
        }
    } 
    else if (mode === 7) { 
        pageData[currentPage].isString[selectedKeyIndex] = true;
        var strText = document.getElementById('input-string').value;
        pageData[currentPage].strings[selectedKeyIndex] = strText;
        sendSerialData("SET_STRING:" + targetPage + ":" + selectedKeyIndex + ":" + strText + "\n");
    }
    else if (mode === 1) { 
        var tdS = document.getElementById('td-single').value;
        var tdD = document.getElementById('td-double').value;
        var tdH = document.getElementById('td-hold').value;
        
        pageData[currentPage].tdSingles[selectedKeyIndex] = tdS;
        pageData[currentPage].tdDoubles[selectedKeyIndex] = tdD;
        pageData[currentPage].tdHolds[selectedKeyIndex] = tdH;
        
        var cS = parseShortcutToCodes(tdS);
        var cD = parseShortcutToCodes(tdD);
        var cH = parseShortcutToCodes(tdH);
        
        sendSerialData("SET_TAP:" + targetPage + ":" + selectedKeyIndex + ":0:" + cS.m + ":" + cS.k + "\n");
        setTimeout(() => sendSerialData("SET_TAP:" + targetPage + ":" + selectedKeyIndex + ":1:" + cD.m + ":" + cD.k + "\n"), 50);
        setTimeout(() => sendSerialData("SET_TAP:" + targetPage + ":" + selectedKeyIndex + ":2:" + cH.m + ":" + cH.k + "\n"), 100);
    }
    else if (mode === 6) {
        var totpSecret = document.getElementById('input-totp').value;
        pageData[currentPage].totps[selectedKeyIndex] = totpSecret;
        sendSerialData("SET_TOTP:" + targetPage + ":" + selectedKeyIndex + ":" + totpSecret + "\n");
    }

    checkBluetoothPresence();

    var saveButton = document.getElementById('button-save');
    var originalText = saveButton.innerText;
    saveButton.innerText = "SAVING COMPLETED!";
    saveButton.style.background = "#188038";
    
    setTimeout(function() {
        saveButton.innerText = originalText;
        saveButton.style.background = "";
    }, 2000);
}

// ====================================================
// FLUXPAD COMMUNITY PRESETS ENGINE
// ====================================================

const DEFAULT_COMMUNITY_PRESETS = [
    {
        code: "PRO-OBS",
        name: "OBS Studio Pro",
        category: "Streaming",
        color: "#9900FF",
        likes: 312,
        macros: {0:"ctrl+alt+1", 1:"ctrl+alt+2", 2:"ctrl+alt+3", 3:"ctrl+f1", 4:"ctrl+f2", 5:"ctrl+f3", 6:"ctrl+f4", 7:"ctrl+shift+m", 8:"ctrl+shift+d", 9:"ctrl+alt+p", 10:"ctrl+alt+s"}
    },
    {
        code: "PRO-PR",
        name: "Premiere Timeline Pro",
        category: "Video Editing",
        color: "#0088FF",
        likes: 245,
        macros: {0:"v", 1:"c", 2:"b", 3:"shift+del", 4:"q", 5:"w", 6:"ctrl+shift+k", 7:"ctrl+r", 8:"g", 9:"ctrl+m", 10:"\\"}
    },
    {
        code: "PRO-RESOLVE",
        name: "DaVinci Color Nodes",
        category: "Color Grading",
        color: "#FF6600",
        likes: 198,
        macros: {0:"ctrl+b", 1:"ctrl+shift+x", 2:"n", 3:"i", 4:"o", 5:"alt+x", 6:"alt+s", 7:"shift+d", 8:"shift+z", 9:"ctrl+f12", 10:"shift+4"}
    },
    {
        code: "PRO-BLENDER",
        name: "Blender 3D Suite",
        category: "3D Modeling",
        color: "#FFCC00",
        likes: 275,
        macros: {0:"g", 1:"r", 2:"s", 3:"e", 4:"ctrl+r", 5:"i", 6:"alt+z", 7:"z", 8:"ctrl+alt+q", 9:".", 10:"f12"}
    },
    {
        code: "PRO-PHOTOSHOP",
        name: "Photoshop Creative",
        category: "Graphic Design",
        color: "#00FFFF",
        likes: 410,
        macros: {0:"b", 1:"e", 2:"s", 3:"w", 4:"ctrl+t", 5:"alt", 6:"ctrl+shift+i", 7:"ctrl+shift+alt+e", 8:"ctrl+m", 9:"ctrl+d", 10:"ctrl+shift+alt+s"}
    },
    {
        code: "PRO-EXCEL",
        name: "Excel Analytics Pro",
        category: "Productivity",
        color: "#00EA87",
        likes: 180,
        macros: {0:"alt+=", 1:"ctrl+t", 2:"ctrl+e", 3:"ctrl+shift+=", 4:"ctrl+-", 5:"ctrl+shift+l", 6:"ctrl+1", 7:"ctrl+alt+v", 8:"ctrl+a", 9:"ctrl+;", 10:"shift+f11"}
    },
    {
        code: "FP-DSC-MUTE",
        name: "Discord Quick Controls",
        category: "Communication",
        color: "#5865F2",
        likes: 142,
        macros: {0:"ctrl+shift+m", 1:"ctrl+shift+d", 2:"alt+up", 3:"alt+down", 4:"", 5:"", 6:"", 7:"", 8:"", 9:"", 10:""}
    },
    {
        code: "FP-SPT-MEDIA",
        name: "Spotify Master Deck",
        category: "Media",
        color: "#1DB954",
        likes: 98,
        macros: {0:"space", 1:"ctrl+right", 2:"ctrl+left", 3:"ctrl+up", 4:"ctrl+down", 5:"", 6:"", 7:"", 8:"", 9:"", 10:""}
    },
    {
        code: "FP-VSC-CODE",
        name: "VS Code Developer Map",
        category: "Development",
        color: "#007ACC",
        likes: 215,
        macros: {0:"ctrl+p", 1:"ctrl+shift+f", 2:"ctrl+`", 3:"ctrl+b", 4:"alt+up", 5:"alt+down", 6:"ctrl+d", 7:"f5", 8:"ctrl+f5", 9:"ctrl+z", 10:"ctrl+s"}
    }
];

function getCommunityPresets() {
    const local = localStorage.getItem("fluxpad_community_feed");
    if (!local) return DEFAULT_COMMUNITY_PRESETS;
    
    let list = JSON.parse(local);
    const codes = list.map(p => p.code);
    DEFAULT_COMMUNITY_PRESETS.forEach(def => {
        if (!codes.includes(def.code)) {
            list.push(def);
        }
    });

    return list;
}

function saveCommunityPresets(presets) {
    localStorage.setItem("fluxpad_community_feed", JSON.stringify(presets));
}

function generateUniqueCode(title) {
    const prefix = "FP-" + title.replace(/[^a-zA-Z]/g, "").substring(0, 3).toUpperCase();
    const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `${prefix}-${rand}`;
}

// Preset Sharing Logic
function openShareModal() { document.getElementById('share-modal').style.display = 'flex'; }
function closeShareModal() { document.getElementById('share-modal').style.display = 'none'; }

function submitSharePreset() {
    const title = document.getElementById('share-title').value.trim() || "Custom Layout";
    const category = document.getElementById('share-category').value.trim() || "Community";
    const scope = document.getElementById('share-scope').value;

    let feed = getCommunityPresets();

    if (scope === "current") {
        const newPost = {
            code: generateUniqueCode(title),
            name: title,
            category: category,
            color: pageData[currentPage].color,
            likes: 1,
            macros: Object.assign({}, pageData[currentPage].macros)
        };
        feed.unshift(newPost);
    } else {
        for (let p = 0; p < 9; p++) {
            const pageName = `${title} [Page ${p + 1}]`;
            const newPost = {
                code: generateUniqueCode(`${title}P${p + 1}`),
                name: pageName,
                category: category,
                color: pageData[p].color,
                likes: 1,
                macros: Object.assign({}, pageData[p].macros)
            };
            feed.unshift(newPost);
        }
    }

    saveCommunityPresets(feed);
    closeShareModal();
    populatePresetDropdown();
    openCommunityModal();
}

// Community Feed Modal Logic
function openCommunityModal() {
    document.getElementById('community-modal').style.display = 'flex';
    renderCommunityFeed("");
}

function closeCommunityModal() {
    document.getElementById('community-modal').style.display = 'none';
}

function filterCommunityFeed(query) {
    renderCommunityFeed(query.toLowerCase());
}

function renderCommunityFeed(filter) {
    const grid = document.getElementById('community-feed-grid');
    const presets = getCommunityPresets();
    grid.innerHTML = "";

    const userLikes = JSON.parse(localStorage.getItem("fluxpad_user_likes") || "{}");

    const filtered = presets.filter(p => 
        p.name.toLowerCase().includes(filter) || 
        p.category.toLowerCase().includes(filter) ||
        p.code.toLowerCase().includes(filter)
    );

    if (filtered.length === 0) {
        grid.innerHTML = `<p style="grid-column: 1/-1; text-align: center; color: var(--secondary-text);">No presets found matching your search.</p>`;
        return;
    }

    filtered.forEach(item => {
        const card = document.createElement('div');
        card.className = "feed-card";

        let miniKeysHtml = "";
        for (let i = 0; i < 11; i++) {
            const macroLabel = item.macros[i] || (i + 1);
            miniKeysHtml += `<div class="mini-key" title="Key ${i+1}: ${macroLabel}">${macroLabel.substring(0, 5)}</div>`;
            if (i === 2) {
                miniKeysHtml += `<div class="mini-key mini-knob" style="background:${item.color}; color:#fff;">VOL</div>`;
            }
        }

        const isLiked = userLikes[item.code] === true;
        const likeCount = (item.likes || 0) + (isLiked ? 1 : 0);

        card.innerHTML = `
            <div class="card-header">
                <span class="card-title" title="${item.name}">${item.name}</span>
                <span class="card-tag">${item.category}</span>
            </div>
            <div class="mini-keypad">
                ${miniKeysHtml}
            </div>
            <div class="card-footer">
                <button class="like-btn ${isLiked ? 'liked' : ''}" onclick="toggleLike('${item.code}')">
                    ❤️ <span>${likeCount}</span>
                </button>
                <span class="code-badge" onclick="copyPresetCode('${item.code}')" title="Click to copy code">📋 ${item.code}</span>
                <button class="primary-button" style="padding: 6px 12px; width:auto; font-size:11px;" onclick="applyPresetDirectly('${item.code}')">APPLY</button>
            </div>
        `;
        grid.appendChild(card);
    });
}

function toggleLike(code) {
    let userLikes = JSON.parse(localStorage.getItem("fluxpad_user_likes") || "{}");
    if (userLikes[code]) {
        delete userLikes[code];
    } else {
        userLikes[code] = true;
    }
    localStorage.setItem("fluxpad_user_likes", JSON.stringify(userLikes));
    renderCommunityFeed(document.getElementById('feed-search').value.toLowerCase());
}

function copyPresetCode(code) {
    navigator.clipboard.writeText(code);
    alert(`Code "${code}" copied to clipboard!`);
}

function applyPresetDirectly(code) {
    const presets = getCommunityPresets();
    const found = presets.find(p => p.code.toUpperCase() === code.trim().toUpperCase());

    if (!found) {
        alert("Preset code not found.");
        return;
    }

    pageData[currentPage].color = found.color;
    document.getElementById('page-color').value = found.color;
    updateThemeColor(found.color);

    for (let k = 0; k < 11; k++) {
        pageData[currentPage].keyModes[k] = 0;
        pageData[currentPage].macros[k] = found.macros[k] || "";
        pageData[currentPage].isString[k] = false;
    }

    refreshKeyUI();
    closeCommunityModal();
    alert(`Preset "${found.name}" loaded onto Page ${currentPage + 1}!`);
}

function importDirectCode() {
    const code = document.getElementById('direct-code-input').value;
    if (!code.trim()) return;
    applyPresetDirectly(code);
    document.getElementById('direct-code-input').value = "";
}

function populatePresetDropdown() {
    const select = document.getElementById('preset-select');
    if (!select) return;

    const presets = getCommunityPresets();
    select.innerHTML = '<option value="">-- Load Preset --</option>';

    presets.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.code;
        opt.textContent = `${p.name} (${p.category})`;
        select.appendChild(opt);
    });
}

function onPresetSelected(code) {
    if (!code) return;
    applyPresetDirectly(code);
    document.getElementById('preset-select').value = "";
}

// Lifecycle Init
document.addEventListener('DOMContentLoaded', function() {
    populatePresetDropdown();
    checkBluetoothPresence();
});
