// /modules/websocket.js
// Este módulo se encarga de toda la lógica relacionada con las conexiones WebSocket.

const WebSocket = require('ws'); // <-- ¡AÑADE ESTA LÍNEA AQUÍ!

/**
 * Calcula el tiempo promedio de llenado del tacho.
 * @param {Array} fullTimes - Array de timestamps cuando el tacho estaba "Lleno".
 * @returns {number} El tiempo promedio de llenado en milisegundos.
 */
function calculateAverageFillTime(fullTimes) {
    if (fullTimes.length >= 2) {
        // Calcula la diferencia entre el último y el primer timestamp de "Lleno"
        // y divide por el número de intervalos de llenado completos.
        const totalFillTime = new Date(fullTimes[fullTimes.length - 1]) - new Date(fullTimes[0]);
        return totalFillTime / (fullTimes.length - 1);
    }
    // Retorna 0 si no hay suficientes datos para calcular un promedio significativo.
    return 0;
}

/**
 * Configura los manejadores de eventos para el servidor WebSocket.
 * @param {WebSocket.Server} wss - La instancia del servidor WebSocket.
 * @param {object} sharedState - Objeto con el estado compartido (lastData, states, fullTimes, averageFillTime).
 * @param {object} mlFunctions - Objeto que contiene las funciones de Machine Learning (trainModel, predictFillTime).
 * @param {object} wppFunctions - Objeto que contiene las funciones de WhatsApp (sendWhatsAppMessage).
 */
module.exports = (wss, sharedState, mlFunctions, wppFunctions) => {
    // Desestructura las funciones de ML y WhatsApp para un uso más fácil.
    const { trainModel, predictFillTime } = mlFunctions;
    const { sendWhatsAppMessage } = wppFunctions;

    // Manejador de conexiones WebSocket entrantes.
    wss.on('connection', ws => {
        console.log('Cliente WebSocket conectado.'); // Log para depuración

        // Manejador de mensajes recibidos de un cliente WebSocket.
        ws.on('message', message => {
            const data = JSON.parse(message); // Parsear el mensaje JSON
            sharedState.lastData = { ...data, timestamp: new Date().toLocaleString() }; // Actualizar el último dato recibido

            // Lógica para actualizar el tiempo de llenado si el estado es "Lleno".
            if (data.estado === 'Lleno') {
                sharedState.fullTimes.push(data.timestamp);
                sharedState.averageFillTime = calculateAverageFillTime(sharedState.fullTimes);

                // Lógica de envío de mensajes de WhatsApp (actualmente comentada en el original).
                /*
                sendWhatsAppMessage('whatsapp:+51925418808', 'El tacho está lleno.')
                    .then(() => console.log('Mensaje de WhatsApp enviado.'))
                    .catch(error => console.error('Error al enviar el mensaje de WhatsApp:', error));
                */
            }

            // Guardar el estado para entrenar la red neuronal.
            if (data.estado !== 'Lleno') {
                sharedState.states.push({ distancia: data.distancia, tiempoParaLlenar: sharedState.averageFillTime });
            }

            // Entrenar la red neuronal si hay suficientes datos.
            if (sharedState.states.length > 5) {
                trainModel(sharedState.states);
            }

            // Realizar una predicción si la red ha sido entrenada y el tacho no está lleno.
            if (data.estado !== 'Lleno' && sharedState.states.length > 5) {
                try {
                    const predictedTime = predictFillTime(data.distancia);
                    sharedState.lastData.predictedFillTime = predictedTime;
                } catch (error) {
                    console.error('Error al predecir el tiempo de llenado:', error.message);
                }
            }

            // Esta línea se mantiene para replicar el comportamiento original del array 'states'.
            sharedState.states.push(sharedState.lastData);

            // Enviar los datos actualizados a todos los clientes WebSocket conectados.
            wss.clients.forEach(client => {
                // Ahora 'WebSocket' está definido dentro de este módulo
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({ ...sharedState.lastData, averageFillTime: sharedState.averageFillTime }));
                }
            });
        });

        // Manejador de cierre de conexión WebSocket.
        ws.on('close', () => {
            console.log('Cliente WebSocket desconectado.');
        });

        // Manejador de errores de conexión WebSocket.
        ws.on('error', (error) => {
            console.error('Error en el WebSocket:', error);
        });
    });
};