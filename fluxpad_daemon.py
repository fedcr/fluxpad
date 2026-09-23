# THIS PYTHON SCRIPT NEEDS TO BE STARTED EVERY TIME THE DEVICE IS TURNED ON.
# IT'S STILL POSSIBLE TO MAKE IT START AUTOMATICALLY FROM THE OPERATING SYSTEM SETTINGS (CHECK ON YOUR OWN).
# THIS SCRIPT IS USED TO ALLOW CONTINUOUS ACCESS TO THE CONFIGURATOR IF YOU DON'T WANT TO KEEP THE WEB PAGE OPEN
# AND IS ONLY NECESSARY FOR CONNECTIONS WITH EXTERNAL ENVIRONMENTS (LIKE HOME ASSISTANT)

import serial
import requests
import time

# ENTER YOUR COM PORT (e.g., 'COM3' on Windows or '/dev/ttyACM0' on Linux)
PORTA_SERIALE = 'COM3'  
BAUD_RATE = 9600

# Link the key index (0-11) here to the Home Assistant Webhook
WEBHOOKS = {
    0: "http://homeassistant.local:8123/api/webhook/...",
    1: "http://homeassistant.local:8123/api/webhook/...",
    # Aggiungi gli altri tasti se necessario...
}

def avvia_daemon():
    try:
        ser = serial.Serial(PORTA_SERIALE, BAUD_RATE, timeout=1)
        print(f"FluxPad Daemon waiting on {PORTA_SERIALE}...")
        
        while True:
            if ser.in_waiting > 0:
                linea = ser.readline().decode('utf-8').strip()
                

                if linea.startswith("DOMO:"):
                    try:
                        indice_tasto = int(linea.split(":")[1])
                        print(f"Smart home button pressed: {indice_tasto}")
                        
                        url = WEBHOOKS.get(indice_tasto)
                        if url:
                           
                            response = requests.post(url)
                            print(f"Command sent! Status: {response.status_code}")
                        else:
                            print(f"No webhook configured in the script for the {button_index} button")
                            
                    except Exception as e:
                        print(f"Errore di rete: {e}")
                        
            time.sleep(0.01)
            
    except serial.SerialException:
        print(f"Waiting for FluxPad on {SERIAL_PORT}...)
        time.sleep(5)
        avvia_daemon()
    except KeyboardInterrupt:
        print("\nClosing the daemon.")

if __name__ == "__main__":
    avvia_daemon()
