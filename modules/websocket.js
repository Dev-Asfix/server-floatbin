// modules/websocket.js
// Este módulo se encarga de toda la lógica relacionada con las conexiones WebSocket.

const WebSocket = require('ws'); // Necesario para la clase WebSocket.

/**
 * Calcula el tiempo promedio de llenado del tacho.
 * @param {Array} fullTimes - Array de timestamps cuando el tacho estaba "Lleno".
 * @returns {number} El tiempo promedio de llenado en milisegundos.
 */
function calculateAverageFillTime(fullTimes) {
    if (fullTimes.length >= 2) { // Cambia a >=3 si quieres que el backend también espere 3 llenados
        const totalFillTime = new Date(fullTimes[fullTimes.length - 1]) - new Date(fullTimes[0]);
        return totalFillTime / (fullTimes.length - 1);
    }
    return null; // <-- Cambiado de 0 a null
}

/**
 * Configura los manejadores de eventos para el servidor WebSocket.
 * @param {WebSocket.Server} wss - La instancia del servidor WebSocket.
 * @param {object} sharedState - Objeto con el estado compartido (lastData, states, fullTimes, averageFillTime).
 * @param {object | null} mlFunctions - Objeto que contendría las funciones de Machine Learning (ahora se pasa como null y no se usa).
 * @param {object} wppFunctions - Objeto que contiene las funciones de WhatsApp (sendWhatsAppMessage).
 */
module.exports = (wss, sharedState, mlFunctions, wppFunctions) => {
    // Las funciones de ML ya no se desestructuran ni se usan aquí.
    // const { trainModel, predictFillTime } = mlFunctions;

    // La función de WhatsApp también se comenta si no se está utilizando activamente en este módulo.
    // const { sendWhatsAppMessage } = wppFunctions; 

    // Manejador de conexiones WebSocket entrantes.
    wss.on('connection', ws => {
        console.log('Cliente WebSocket conectado.'); // Mensaje de depuración.

        // Manejador de mensajes recibidos de un cliente WebSocket.
        ws.on('message', message => {
            const data = JSON.parse(message); // Parsear el mensaje JSON recibido.
            // Actualiza los últimos datos recibidos del sensor, incluyendo una marca de tiempo local.
            sharedState.lastData = { ...data, timestamp: new Date().toLocaleString() };

            // Si el estado recibido es "Lleno", registra el tiempo y recalcula el promedio.
            if (data.estado === 'Lleno') {
                sharedState.fullTimes.push(data.timestamp);
                sharedState.averageFillTime = calculateAverageFillTime(sharedState.fullTimes);

                // Lógica para enviar mensajes de WhatsApp (originalmente comentada).
                // Si deseas activarla, descomenta y asegúrate de que 'wppFunctions' y 'sendWhatsAppMessage' sean válidos.
                /*
                if (wppFunctions && wppFunctions.sendWhatsAppMessage) {
                    wppFunctions.sendWhatsAppMessage('whatsapp:+51925418808', 'El tacho está lleno.')
                        .then(() => console.log('Mensaje de WhatsApp enviado.'))
                        .catch(error => console.error('Error al enviar el mensaje de WhatsApp:', error));
                }
                */
            }

            // --- LÓGICA DE MACHINE LEARNING (ML) COMENTADA/ELIMINADA ---
            // Las siguientes líneas estaban relacionadas con el uso de la red neuronal y han sido eliminadas/comentadas
            // según tu solicitud.
            // if (data.estado !== 'Lleno') {
            //     sharedState.states.push({ distancia: data.distancia, tiempoParaLlenar: sharedState.averageFillTime });
            // }
            // if (sharedState.states.length > 5 && mlFunctions && mlFunctions.trainModel) {
            //     mlFunctions.trainModel(sharedState.states);
            // }
            // if (data.estado !== 'Lleno' && sharedState.states.length > 5 && mlFunctions && mlFunctions.predictFillTime) {
            //     try {
            //         const predictedTime = mlFunctions.predictFillTime(data.distancia);
            //         sharedState.lastData.predictedFillTime = predictedTime;
            //     } catch (error) {
            //         console.error('Error al predecir el tiempo de llenado (ML deshabilitado):', error.message);
            //     }
            // }
            // sharedState.states.push(sharedState.lastData); // Esta línea también estaba relacionada con la acumulación para ML.
            // --- FIN LÓGICA DE ML COMENTADA/ELIMINADA ---

            // Enviar los datos actualizados a todos los clientes WebSocket conectados.
            // La predicción del ML ya no se incluye en el objeto enviado.
            wss.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({
                        estado: sharedState.lastData.estado,
                        distancia: sharedState.lastData.distancia,
                        timestamp: sharedState.lastData.timestamp,
                        averageFillTime: sharedState.averageFillTime // Solo se envía el promedio
                    }));
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