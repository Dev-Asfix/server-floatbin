const WebSocket = require('ws');

// Dirección del servidor WebSocket
//const ws = new WebSocket('ws://192.168.18.20:3000/');
const ws = new WebSocket('ws://192.168.18.21:3000/');

// --- ¡NUEVA LÍNEA CLAVE AQUÍ! Define el ID del tacho que este simulador representa ---
const MY_DEVICE_ID = "Tacho-04"; // Asegúrate de que este ID coincida con el que espera tu frontend

ws.on('open', function open() {
  console.log(`Conectado al servidor WebSocket como: ${MY_DEVICE_ID}`); // Mensaje actualizado
  simulateSensorData();
});

ws.on('message', function incoming(data) {
  console.log(`Mensaje recibido del servidor para ${MY_DEVICE_ID}:`, data); // Mensaje actualizado
});

ws.on('close', function close() {
  console.log(`Conexión cerrada para ${MY_DEVICE_ID}`); // Mensaje actualizado
});

// Simular los datos del sensor
function simulateSensorData() {
  setInterval(() => {

    const distance = Math.random() * 30; // Distancia aleatoria entre 0 y 100 cm

    let estado = getEstado(distance); // Determinar el estado basado en la distancia

    // Crear un objeto con los datos simulados
    const data = JSON.stringify({
      // --- ¡AÑADE ESTA LÍNEA! ---
      deviceId: MY_DEVICE_ID, // Incluye el identificador del dispositivo
      estado: estado,
      distancia: distance,
      timestamp: Date.now() // Usar timestamp en milisegundos
    });

    // Enviar los datos al servidor WebSocket
    ws.send(data);
    console.log(`Datos enviados por ${MY_DEVICE_ID}: ${data}`); // Mensaje actualizado
  }, 20000); // Enviar cada 4 segundos (como en tu código original)
}

// Determinar el estado según la distancia simulada
function getEstado(distance) {
  if (distance > 30) {
    return 'Vacio';
  } else if (distance <= 30 && distance > 25) {
    return 'Bajo';
  } else if (distance <= 25 && distance > 20) {
    return 'Medio';
  } else if (distance <= 20 && distance > 10) {
    return 'Alto';
  } else {
    return 'Lleno';
  }
}