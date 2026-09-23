# THIS PYTHON SCRIPT NEEDS TO BE STARTED EVERY TIME THE DEVICE IS TURNED ON.
# IT'S STILL POSSIBLE TO MAKE IT START AUTOMATICALLY FROM THE OPERATING SYSTEM SETTINGS (CHECK ON YOUR OWN).
# THIS SCRIPT IS USED TO ALLOW CONTINUOUS ACCESS TO THE CONFIGURATOR IF YOU DON'T WANT TO KEEP THE WEB PAGE OPEN
# AND IS ONLY NECESSARY FOR CONNECTIONS WITH EXTERNAL ENVIRONMENTS (LIKE HOME ASSISTANT)

import serial
import requests
import time
import webbrowser

# --- CONFIGURATION ---
SERIAL_PORT = 'COM3'  # Change to your actual COM port (e.g., 'COM3' on Windows, '/dev/ttyACM0' on Linux)
BAUD_RATE = 9600

# 1. SMART HOME CONFIGURATION
# Map the action ID to the specific Home Assistant Webhook URL
SMART_HOME_WEBHOOKS = {
    0: "http://homeassistant.local:8123/api/webhook/turn_on_studio_lights",
    1: "http://homeassistant.local:8123/api/webhook/turn_off_all",
    2: "http://homeassistant.local:8123/api/webhook/toggle_fan"
}

# 2. AI ASSISTANT CONFIGURATION
# Map the AI service ID to its respective URL
AI_SERVICES = {
    1: "https://chatgpt.com/",
    2: "https://gemini.google.com/",
    3: "https://claude.ai/",
    4: "https://www.perplexity.ai/"
}

def start_daemon():
    try:
        # Initialize Serial connection
        ser = serial.Serial(SERIAL_PORT, BAUD_RATE, timeout=1)
        print(f"FluxPad Daemon listening on {SERIAL_PORT}...")
        print("Unified Daemon Active: Ready for both Smart Home and AI commands.\n")
        
        while True:
            if ser.in_waiting > 0:
                # Read the incoming serial line
                line = ser.readline().decode('utf-8').strip()
                
                # --- HANDLE SMART HOME COMMANDS ---
                if line.startswith("DOMO:"):
                    try:
                        action_id = int(line.split(":")[1])
                        print(f"[SMART HOME] Triggering Action ID: {action_id}")
                        url = SMART_HOME_WEBHOOKS.get(action_id)
                        
                        if url:
                            response = requests.post(url)
                            print(f"[SMART HOME] Webhook sent! Status: {response.status_code}\n")
                        else:
                            print(f"[SMART HOME] Error: No webhook configured for action ID {action_id}\n")
                    except Exception as e:
                        print(f"[SMART HOME] Network error: {e}\n")
                
                # --- HANDLE AI ASSISTANT COMMANDS ---
                elif line.startswith("AI:"):
                    try:
                        ai_id = int(line.split(":")[1])
                        print(f"[AI ASSISTANT] Opening Service ID: {ai_id}")
                        url = AI_SERVICES.get(ai_id)
                        
                        if url:
                            webbrowser.open(url) # Automatically opens the default web browser
                            print(f"[AI ASSISTANT] Opened {url} in browser.\n")
                        else:
                            print(f"[AI ASSISTANT] Error: No AI service configured for ID {ai_id}\n")
                    except Exception as e:
                        print(f"[AI ASSISTANT] Browser error: {e}\n")
                        
            time.sleep(0.01) # Small delay to prevent high CPU usage
            
    except serial.SerialException:
        print(f"Waiting for FluxPad to connect on {SERIAL_PORT}...")
        time.sleep(5)
        start_daemon() # Recursively try to reconnect if the USB is unplugged
    except KeyboardInterrupt:
        print("\nFluxPad Daemon closed by user.")

if __name__ == "__main__":
    start_daemon()
        print("\nClosing the daemon.")

if __name__ == "__main__":
    avvia_daemon()
