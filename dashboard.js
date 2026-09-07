var serialPort;
var serialWriter;
var reader;

var keyStats = Array(12).fill(0);
var totalClicks = 0;
var totalUptimeMinutes = 0;

const keyLayout = [
    { id: 0, label: "1" }, { id: 1, label: "2" }, { id: 2, label: "3" }, { id: 11, label: "VOL", isKnob: true },
    { id: 3, label: "4" }, { id: 4, label: "5" }, { id: 5, label: "6" }, { id: 6, label: "7" },
    { id: 7, label: "8" }, { id: 8, label: "9" }, { id: 9, label: "10" }, { id: 10, label: "11" }
];

document.addEventListener('DOMContentLoaded', () => {
    initHeatmapGrid();
});

function initHeatmapGrid() {
    const grid = document.getElementById('heatmap');
    grid.innerHTML = "";
    keyLayout.forEach(k => {
        let div = document.createElement('div');
        div.className = 'heat-key';
        if (k.isKnob) div.classList.add('knob');
        div.id = 'heat-' + k.id;
        div.innerText = k.label;
        grid.appendChild(div);
    });
}

async function connectSerial() {
    if ("serial" in navigator) {
        try {
            if(!serialPort) {
                serialPort = await navigator.serial.requestPort();
                await serialPort.open({ baudRate: 9600 });
                const textEncoder = new TextEncoderStream();
                textEncoder.readable.pipeTo(serialPort.writable);
                serialWriter = textEncoder.writable.getWriter();
                
                readLoop();
            }
            
            document.getElementById('connect-btn').innerText = "Connected";
            document.getElementById('connect-btn').style.background = "var(--green-pastel)";
            document.getElementById('connect-btn').style.color = "var(--green-dark)";
            
            await serialWriter.write("GET_STATS\n");
            document.getElementById('stat-shortcuts').innerText = "Connected. Analyzing...";

        } catch (error) { 
            console.error(error);
            alert("Connection error or port busy."); 
        }
    } else { 
        alert("Web Serial is not supported by your browser."); 
    }
}

async function readLoop() {
    const textDecoder = new TextDecoderStream();
    const readableStreamClosed = serialPort.readable.pipeTo(textDecoder.writable);
    reader = textDecoder.readable.getReader();
    let buffer = "";

    try {
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += value;
            let lines = buffer.split('\n');
            buffer = lines.pop();
            
            for (let line of lines) {
                parseStats(line.trim());
            }
        }
    } catch (error) {
        console.error("Reading interrupted", error);
    }
}

function parseStats(data) {
    if (data.startsWith("STATS:")) {
        let parts = data.split(':');
        if (parts.length >= 15) {
            totalUptimeMinutes = parseInt(parts[1]);
            totalClicks = parseInt(parts[2]);
            
            for(let i = 0; i < 12; i++) {
                keyStats[i] = parseInt(parts[3 + i]);
            }
            
            updateDashboardUI();
        }
    }
}

function updateDashboardUI() {
    let hours = Math.floor(totalUptimeMinutes / 60);
    let mins = totalUptimeMinutes % 60;
    document.getElementById('stat-uptime').innerText = `${hours}h ${mins}m`;

    document.getElementById('stat-total-clicks').innerText = totalClicks.toLocaleString();
    let secondsSaved = totalClicks * 1.5;
    let minutesSaved = Math.round(secondsSaved / 60);
    document.getElementById('stat-saved').innerText = minutesSaved;
    
    let progressDegree = Math.min((minutesSaved / 100) * 360, 360);
    document.querySelector('.circular-progress').style.background = `conic-gradient(var(--blue-accent) ${progressDegree}deg, var(--blue-pastel) 0deg)`;

    let eff = totalUptimeMinutes > 0 ? (totalClicks / totalUptimeMinutes).toFixed(1) : 0;
    document.getElementById('stat-efficiency').innerText = eff + " / min";

    let maxClicks = Math.max(...keyStats);
    let mostUsedKeyIdx = keyStats.indexOf(maxClicks);
    
    if (maxClicks > 0) {
        let muKey = keyLayout.find(k => k.id === mostUsedKeyIdx);
        document.getElementById('stat-most-used').innerText = `Key ${muKey.label} (${maxClicks.toLocaleString()} taps)`;
    } else {
        document.getElementById('stat-most-used').innerText = "No data";
    }

    keyLayout.forEach(k => {
        let div = document.getElementById('heat-' + k.id);
        let clicks = keyStats[k.id];
        
        if (maxClicks === 0 || clicks === 0) {
            div.style.backgroundColor = "var(--bg-color)";
            div.style.color = "var(--text-main)";
        } else {
            let ratio = clicks / maxClicks;
            let hue = (1 - ratio) * 210; 
            div.style.backgroundColor = `hsl(${hue}, 80%, 65%)`;
            div.style.color = "#ffffff";
            div.title = `${clicks.toLocaleString()} clicks`;
        }
    });
    
    document.getElementById('stat-shortcuts').innerText = "Data synchronized successfully.";
}