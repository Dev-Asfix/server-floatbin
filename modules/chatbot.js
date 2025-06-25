// modules/chatbot.js - MEJORADO PARA MÚLTIPLES TACHOS Y PATRONES DE IA (SIN @google/generative-ai SDK)

const axios = require('axios');
const { tachoLocations } = require('../config/ubiserver');

/**
 * Configura la ruta POST para el chatbot.
 * @param {express.Application} app - La instancia de la aplicación Express.
 * @param {object} sharedState - Objeto con el estado compartido (contendrá 'bins').
 * @param {string} API_KEY - La clave de la API de Gemini.
*/
module.exports = (app, sharedState, API_KEY) => {

    const GEMINI_MODEL_CONFIG = {
        model: "gemini-1.5-flash",
        generationConfig: {
            temperature: 0.7,
            topP: 0.95,
            topK: 60,
        },
        safetySettings: [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
        ],
        tools: [
            {
                functionDeclarations: [
                    {
                        name: "getBinStatus",
                        description: "Obtiene el estado actual de un tacho específico o de todos los tachos.",
                        parameters: {
                            type: "OBJECT",
                            properties: {
                                deviceId: {
                                    type: "string",
                                    description: "El ID del tacho (ej. Tacho-01, Tacho-02). Opcional, si no se especifica, se obtendrán todos los tachos."
                                }
                            },
                            required: []
                        }
                    },
                    {
                        name: "getBinLocation",
                        description: "Obtiene la información de ubicación detallada, descripción e imágenes de un tacho específico.",
                        parameters: {
                            type: "OBJECT",
                            properties: {
                                deviceId: {
                                    type: "string",
                                    description: "El ID del tacho (ej. Tacho-01, Tacho-02)."
                                }
                            },
                            required: ["deviceId"]
                        }
                    },
                    {
                        name: "getBinsByStatus",
                        description: "Lista todos los tachos que tienen un estado particular (ej. Lleno, Vacio, Medio, Alto, Bajo).",
                        parameters: {
                            type: "OBJECT",
                            properties: {
                                status: {
                                    type: "string",
                                    description: "El estado del tacho (ej. Lleno, Vacio, Medio, Alto, Bajo)."
                                }
                            },
                            required: ["status"]
                        }
                    },
                    {
                        name: "getActiveBins",
                        description: "Obtiene una lista de todos los IDs de los tachos que están actualmente enviando datos (activos).",
                        parameters: {
                            type: "OBJECT",
                            properties: {},
                            required: []
                        }
                    },
                    {
                        name: "getBinNames",
                        description: "Obtiene una lista de los nombres y IDs de todos los tachos configurados en el sistema, independientemente de si están activos o no.",
                        parameters: {
                            type: "OBJECT",
                            properties: {},
                            required: []
                        }
                    },
                    {
                        name: "getBinCount",
                        description: "Obtiene el número total de tachos activos y el número total de tachos configurados en el sistema.",
                        parameters: {
                            type: "OBJECT",
                            properties: {},
                            required: []
                        }
                    }
                ]
            }
        ]
    };

    const getRandomResponse = (responses) => responses[Math.floor(Math.random() * responses.length)];

    function formatTime(ms) {
        if (ms === null || ms === undefined || isNaN(ms)) return "No disponible";
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) return `${days} día${days > 1 ? 's' : ''}`;
        if (hours > 0) return `${hours} hora${hours > 1 ? 's' : ''}`;
        if (minutes > 0) return `${minutes} minuto${minutes > 1 ? 's' : ''}`;
        return `${seconds} segundo${seconds > 1 ? 's' : ''}`;
    }

    // --- Funciones internas que ahora devuelven { message, options } ---

    function getBinStatus(deviceId = null) {
        let message = '';
        let options = [];

        if (deviceId) {
            const binData = sharedState.bins[deviceId]?.lastData;
            const averageFillTime = sharedState.bins[deviceId]?.averageFillTime;
            const binLocation = tachoLocations[deviceId];

            let binName = binLocation ? `**${binLocation.name}** (ID: ${deviceId})` : `tacho **${deviceId}**`;

            if (binData && binData.estado) {
                message = `El ${binName} está **${binData.estado}** (distancia: ${binData.distancia} cm).`;

                switch (binData.estado) {
                    case 'Lleno':
                        message += getRandomResponse([
                            ' ¡Es crucial vaciarlo ahora para evitar desbordamiento!',
                            ' ¡Atención! Está completamente lleno. Si no lo vacías, podrías tener un problema.'
                        ]);
                        options.push(`¿Dónde está ${deviceId}?`);
                        break;
                    case 'Vacio':
                        message += getRandomResponse([
                            ' Está vacío, listo para recibir más residuos.',
                            ' Este tacho está vacío. ¡Perfecto para empezar a reciclar!'
                        ]);
                        if (averageFillTime && !isNaN(averageFillTime) && averageFillTime > 0) {
                            message += ` En promedio, tarda **${formatTime(averageFillTime)}** en llenarse.`;
                        } else {
                            message += ` No tengo datos de tiempo de llenado promedio para este tacho.`;
                        }
                        options.push(`¿Cuáles están llenos?`);
                        options.push(`Dime el nombre de todos los tachos`);
                        break;
                    case 'Bajo':
                        message += getRandomResponse([
                            ' aún queda bastante espacio.',
                            ' tiene espacio suficiente, aunque está empezando a llenarse.'
                        ]);
                        options.push(`¿Qué tachos están altos?`);
                        options.push(`Recomendación para ${deviceId}`);
                        break;
                    case 'Medio':
                        message += getRandomResponse([
                            ' Considera vaciarlo pronto.',
                            ' Es buen momento para vaciarlo antes de que suba más.'
                        ]);
                        options.push(`¿Qué tachos están altos?`);
                        options.push(`Recomendación para ${deviceId}`);
                        break;
                    case 'Alto':
                        message += getRandomResponse([
                            ' Es recomendable vaciarlo pronto.',
                            ' ¡Atención! Está cerca de llenarse. Vacíalo pronto.'
                        ]);
                        options.push(`¿Dónde está ${deviceId}?`);
                        options.push(`¿Cuáles están llenos?`);
                        options.push(`Recomendación para ${deviceId}`);
                        break;
                }
                options.push(`Comandos`); // Opción general
            } else {
                message = `No tengo datos de estado recientes para el ${binName}. Por favor, asegúrate de que esté conectado y enviando datos.`;
                options.push(`¿Cómo están los tachos?`);
                options.push(`Dime los tachos activos`);
            }
        } else { // Si no se especifica deviceId, dar el estado de todos
            const deviceIds = Object.keys(sharedState.bins);
            if (deviceIds.length > 0) {
                let activeBinsCount = 0;
                let responseParts = [];

                const activeBins = deviceIds.filter(id => sharedState.bins[id]?.lastData?.estado);
                const inactiveBins = deviceIds.filter(id => !sharedState.bins[id]?.lastData?.estado);

                if (activeBins.length > 0) {
                    responseParts.push("Aquí tienes el estado actual de los tachos activos:");
                    activeBins.forEach(id => {
                        const bin = sharedState.bins[id];
                        const binLocation = tachoLocations[id];
                        let binName = binLocation ? `**${binLocation.name}** (ID: ${id})` : `Tacho **${id}**`;
                        activeBinsCount++;
                        responseParts.push(`• ${binName}: **${bin.lastData.estado}** (distancia: ${bin.lastData.distancia} cm)`);
                        if (bin.averageFillTime && !isNaN(bin.averageFillTime) && bin.averageFillTime > 0) {
                            responseParts[responseParts.length - 1] += `. Tiempo de llenado promedio: **${formatTime(bin.averageFillTime)}**`;
                        }
                    });
                    options.push(`¿Cuáles están llenos?`);
                    options.push(`¿Cuáles están vacíos?`);
                    options.push(`Dime los tachos activos`);
                }

                if (inactiveBins.length > 0) {
                    if (activeBins.length > 0) {
                        responseParts.push("\nLos siguientes tachos no están enviando datos o están inactivos:");
                    } else {
                        responseParts.push("No hay tachos activos en este momento.");
                        responseParts.push("Los siguientes tachos están registrados pero no envían datos:");
                    }
                    inactiveBins.forEach(id => {
                        const binLocation = tachoLocations[id];
                        let binName = binLocation ? `**${binLocation.name}** (ID: ${id})` : `Tacho **${id}**`;
                        responseParts.push(`• ${binName}`);
                    });
                    responseParts.push("Por favor, asegúrate de que estén conectados y funcionando.");
                }

                if (activeBins.length === 0 && inactiveBins.length === 0) {
                    message = 'No tengo datos de ningún tacho en este momento. Parece que ningún dispositivo está conectado o configurado.';
                    options.push(`Dime el nombre de todos los tachos`);
                } else {
                    message = responseParts.join('\n');
                }
                options.push(`¿Cuántos tachos hay?`);
                options.push(`Comandos`);
            } else {
                message = 'No tengo datos de ningún tacho en este momento. Parece que ningún dispositivo está conectado.';
                options.push(`Dime el nombre de todos los tachos`);
                options.push(`Comandos`);
            }
        }
        return { message, options };
    }

    function getBinLocation(deviceId) {
        let message = '';
        let options = [];
        const locationData = tachoLocations[deviceId];
        if (locationData) {
            message = `El tacho **${locationData.name}** (ID: ${deviceId}) se describe como: "${locationData.description}".\n`;
            message += `Su ubicación exacta es: **${locationData.exactLocation}**.\n`;
            message += `Coordenadas: Latitud ${locationData.coordinates.lat}, Longitud ${locationData.coordinates.lng}.\n`;

            if (locationData.images && locationData.images.length > 0) {
                message += `Aquí tienes algunas imágenes:\n`;
                locationData.images.forEach(img => {
                    message += `![${locationData.name} image](${img})\n`;
                });
            }
            if (locationData.mapUrl) {
                message += `Puedes verlo en el siguiente mapa: [Ver en Google Maps](${locationData.mapUrl})\n`;
            }
            if (locationData.mapIframe) {
                message += `También puedes incrustar este mapa con el siguiente código HTML:\n\`\`\`html\n${locationData.mapIframe}\n\`\`\`\n`;
            }
            options.push(`¿Cuál es el estado del ${deviceId}?`);
            options.push(`¿Cómo están los tachos?`);
            options.push(`Comandos`);
        } else {
            if (sharedState.bins[deviceId]) {
                message = `Tengo datos de actividad para el tacho **${deviceId}**, pero no tengo información de ubicación configurada para él.`;
            } else {
                message = `Lo siento, no tengo información de ubicación para el tacho **${deviceId}**. Asegúrate de que su ID esté correctamente configurado.`;
            }
            options.push(`Dime el nombre de todos los tachos`);
            options.push(`Comandos`);
        }
        return { message, options };
    }

    // Añade esta función dentro de modules/chatbot.js, antes de la ruta POST.
    // Puedes colocarla junto a las otras funciones como getBinStatus, getBinLocation, etc.

    function getProjectInfo() {
        const message = `¡Con gusto te cuento sobre **FloatBin AI**!\n\n` +
            `FloatBin AI es un innovador **proyecto de gestión de residuos inteligentes** que utiliza **Tachos IoT (Internet de las Cosas)**. Nuestro objetivo es optimizar la recolección y mejorar la eficiencia del reciclaje.\n\n` +
            `*✨ Características clave:*\n` +
            `  • **Registro de Estados en Tiempo Real:** Monitorizamos el nivel de llenado (Vacío, Bajo, Medio, Alto, Lleno) y el estado general de cada tacho al instante.\n` +
            `  • **Predicciones Inteligentes:** Utilizamos redes neuronales y algoritmos avanzados para predecir cuándo un tacho se llenará, permitiendo una planificación proactiva.\n` +
            `  • **Diseño y Monitoreo en Tiempo Real:** Interfaz intuitiva para ver el estado y la ubicación de los tachos en un mapa en vivo.\n` +
            `  • **Optimización de Rutas:** Con los datos de llenado y ubicación, el sistema sugiere las rutas más eficientes para la recolección, reduciendo tiempo y combustible.\n` +
            `  • **Estadísticas Detalladas:** Ofrecemos análisis del comportamiento de llenado, historial y eficiencia.\n` +
            `  • **Notificaciones Personalizadas:** Recibe alertas instantáneas por WhatsApp sobre el estado crítico de los tachos.\n\n` +
            `Somos un equipo de **Paita, Piura, Perú**. Los desarrolladores son:\n` +
            `  • **Pablo Rosas Ramirez:** Backend Developer del IESTP "Hermanos Carcamo"\n` +
            `  • **Dayron Urbina Zapata**\n\n` +
            `Nuestro proyecto busca hacer la gestión de residuos más eficiente y sostenible para nuestra comunidad.`;

        const options = [
            "¿Que es un tacho IoT?",
            "¿Cómo funciona la optimización de rutas?",
            "¿Qué son las redes neuronales en FloatBin?",
            "El equipo",
            "Comandos"
        ];

        return { message, options };
    }

    function getTachoIoTInfo() {
        const message = `Un **Tacho IoT (Internet de las Cosas)**, como los de FloatBin AI, es un contenedor de residuos equipado con **sensores y conectividad a internet**. Estos sensores (por ejemplo, ultrasónicos para medir el nivel de llenado) recolectan datos en tiempo real.\n\n` +
            `La información es enviada a nuestra plataforma, permitiéndonos:\n` +
            `  • Saber su **estado de llenado** (vacío, bajo, medio, alto, lleno).\n` +
            `  • Conocer su **ubicación exacta**.\n` +
            `  • Recibir **alertas y notificaciones** cuando requieren atención.\n\n` +
            `Esto transforma un tacho común en un dispositivo inteligente que nos ayuda a gestionar los residuos de forma mucho más eficiente y optimizada.`;
        const options = [
            "¿Qué más hace FloatBin AI?",
            "¿Cómo ayuda a la gestión de residuos?",
            "¿Qué sensores usa?",
            "Comandos"
        ];
        return { message, options };
    }

    function getRouteOptimizationInfo() {
        const message = `La **optimización de rutas** en FloatBin AI funciona así:\n\n` +
            `1.  Recopilamos el **estado de llenado en tiempo real** de todos los tachos.\n` +
            `2.  Identificamos cuáles tachos están **cerca de llenarse o ya están llenos**.\n` +
            `3.  Utilizamos un **algoritmo inteligente** que considera la ubicación de estos tachos en el mapa.\n` +
            `4.  Calculamos la **ruta más corta y eficiente** para que los equipos de recolección vacíen solo los tachos que lo necesitan, evitando viajes innecesarios a tachos vacíos o con poco contenido.\n\n` +
            `Esto reduce el consumo de combustible, el tiempo de recolección y la huella de carbono.`;
        const options = [
            "¿Qué es FloatBin AI?",
            "¿Cómo usa las redes neuronales?",
            "¿Qué beneficios tiene?",
            "Comandos"
        ];
        return { message, options };
    }

    function getNeuralNetworksInfo() {
        const message = `En FloatBin AI, las **redes neuronales** son parte fundamental de nuestras **predicciones inteligentes**.\n\n` +
            `Funcionan analizando grandes volúmenes de datos históricos de llenado de los tachos. Aprenden patrones como:\n` +
            `  • **Horas y días** de mayor y menor llenado.\n` +
            `  • **Factores externos** que pueden influir (si aplicara, como eventos).\n\n` +
            `Basándose en estos patrones aprendidos, la red neuronal puede **predecir con alta precisión** cuándo un tacho específico alcanzará ciertos niveles de llenado (por ejemplo, "Alto" o "Lleno"). Esto nos permite alertar con anticipación y planificar la recolección de manera proactiva, en lugar de reactiva.`;
        const options = [
            "¿Cómo son las predicciones?",
            "¿Qué más hace la IA de FloatBin?",
            "¿Cómo es el monitoreo en tiempo real?",
            "Comandos"
        ];
        return { message, options };
    }

    function getDevelopersInfo() {
        const message = `El equipo de desarrollo de FloatBin AI está compuesto por talentos de **Paita, Piura, Perú**:\n\n` +
            `  • **Pablo Rosas Ramirez:** Él es nuestro **Backend Developer** y egresado del IESTP "Hermanos Carcamo". Es el cerebro detrás de la lógica del servidor y la integración de datos.\n` +
            `  • **Dayron Urbina Zapata:** Un miembro clave del equipo, contribuyendo significativamente al desarrollo del proyecto.\n\n` +
            `Ambos son los creadores de esta solución innovadora para la gestión de residuos.`;
        const options = [
            "¿De qué trata FloatBin AI?",
            "¿Qué es el IESTP Hermanos Carcamo?", // Si quieres añadir una respuesta para esto
            "Comandos"
        ];
        return { message, options };
    }

    function getTeamOriginInfo() {
        const message = `Somos un equipo de **Paita, Piura, Perú**. ¡Orgullosos de desarrollar tecnología que beneficie a nuestra comunidad desde aquí!`;
        const options = [
            "¿Qué es FloatBin AI?",
            "El equipo",
            "Comandos"
        ];
        return { message, options };
    }

    function getBinsByStatus(status) {
        let message = '';
        let options = [];
        const normalizedStatus = status.toLowerCase();

        const matchingBins = Object.keys(sharedState.bins).filter(deviceId =>
            sharedState.bins[deviceId]?.lastData?.estado?.toLowerCase() === normalizedStatus
        );

        if (matchingBins.length > 0) {
            message = `Los siguientes tachos están **${status}**:\n`;
            matchingBins.forEach(deviceId => {
                const binLocation = tachoLocations[deviceId];
                let binName = binLocation ? `**${binLocation.name}** (ID: ${deviceId})` : `Tacho **${deviceId}**`;
                const distance = sharedState.bins[deviceId].lastData.distancia;
                message += `• ${binName} (distancia: ${distance} cm)\n`;
                options.push(`¿Cuál es el estado del ${deviceId}?`);
            });
            options.push(`¿Cómo están los tachos?`);
            options.push(`Dime los tachos activos`);
        } else {
            message = `No hay tachos registrados como **${status}** en este momento.`;
            options.push(`¿Cómo están los tachos?`);
            options.push(`Dime los tachos activos`);
        }
        options.push(`Comandos`);
        return { message, options };
    }

    function getActiveBins() {
        let message = '';
        let options = [];
        const activeBinIds = Object.keys(sharedState.bins).filter(deviceId => sharedState.bins[deviceId]?.lastData);
        if (activeBinIds.length > 0) {
            const binNames = activeBinIds.map(id => {
                const binLocation = tachoLocations[id];
                options.push(`Estado del ${id}`); // Añadir opción para cada tacho activo
                return binLocation ? `**${binLocation.name}** (ID: ${id})` : `Tacho **${id}**`;
            });
            message = `Actualmente tengo datos de los siguientes ${activeBinIds.length} tachos: ${binNames.join(', ')}.`;
            options.push(`¿Cuántos tachos hay?`);
            options.push(`¿Cómo están los tachos?`);
        } else {
            message = 'No hay ningún tacho enviando datos en este momento.';
            options.push(`Dime el nombre de todos los tachos`);
        }
        options.push(`Comandos`);
        return { message, options };
    }

    function getBinNames() {
        let message = '';
        let options = [];
        const configuredBinIds = Object.keys(tachoLocations);
        if (configuredBinIds.length > 0) {
            const binList = configuredBinIds.map(id => {
                const binName = tachoLocations[id]?.name || `Tacho desconocido (ID: ${id})`;
                options.push(`Ubicación del ${id}`); // Añadir opción para cada tacho configurado
                return `**${binName}** (ID: ${id})`;
            });
            message = `Los tachos que conozco son:\n ${binList.join('\n ')}.`;
            options.push(`¿Cómo están los tachos?`);
            options.push(`Dime los tachos activos`);
        } else {
            message = 'No tengo ningún tacho configurado en mi sistema de ubicaciones.';
            options.push(`Comandos`);
        }
        options.push(`Comandos`);
        return { message, options };
    }

    function getBinCount() {
        let message = '';
        let options = [];
        const activeBins = Object.keys(sharedState.bins).filter(deviceId => sharedState.bins[deviceId]?.lastData);
        const configuredBins = Object.keys(tachoLocations);

        const activeCount = activeBins.length;
        const configuredCount = configuredBins.length;

        message = `Actualmente hay **${activeCount}** tacho(s) enviando datos.`;
        if (configuredCount > 0) {
            message += ` En total, tengo **${configuredCount}** tacho(s) configurado(s) en el sistema.`;
        } else {
            message += ` No hay tachos configurados en el sistema de ubicaciones.`;
        }
        options.push(`Dime los tachos activos`);
        options.push(`Dime el nombre de todos los tachos`);
        options.push(`¿Cómo están los tachos?`);
        options.push(`Comandos`);
        return { message, options };
    }

    function getAvailableCommands() {
        const message =
            `--- **Comandos disponibles**  ---\n\n` +
            `• "Hola"\n` +
            `• "Comandos" o _"Lista de comandos"_\n` +
            `• "¿Cómo están los tachos?"\n` +
            `• "¿Cuántos tachos hay?"\n` +
            `• "Dime los tachos activos"\n` +
            `• "Dime el nombre de todos los tachos"\n\n` +
            `--- 📦 **Comandos por Estado** ---\n` +
            `• "¿Cuáles están llenos?"\n` +
            `• "¿Cuáles están vacíos?"\n` +
            `• "¿Tachos medio?"\n` +
            `• "¿Tachos altos?"\n` +
            `• "¿Tachos bajos'"\n\n` +
            `--- 🔍 **Comandos por Tacho específico** ---\n` +
            `• "¿Cuál es el estado del Tacho-01?"\n` +
            `• "¿Dónde está el Tacho-02?"\n\n` +

            `--- 💡 **Sobre FloatBin AI** ---\n` +
            `• "¿De que trata el proyecto?"\n` +
            `• "¿Qué es un tacho IoT?"\n` +
            `• "¿Cómo optimizan las rutas?"\n` +
            `• "¿Qué son las redes neuronales?"\n` +
            `• "Informacion del proyecto"\n` +
            `• "¿De donde son?"\n` +
            `• "¿Que es la predicción?"\n` +
            `• "¿Monitoreo en tiempo real?"\n` +
            `• "¿Estadisticas de llenado?"\n` +
            `• "¿Notificaciones WhatsApp?"\n\n` +
            `Puedes escribir cualquiera de estos comandos o preguntar libremente.`;

        const options = [
            "¿Cómo están los tachos?",
            "¿Dónde está el Tacho-02?",
            "Estado del Tacho-02",

            "¿Cuáles están llenos?",
            "De que trata el proyecto?",
            "¿Qué es un tacho IoT?",
            "El equipo",
            "Dime los tachos activos",
            "Tachos vacíos"
        ];

        return { message, options };
    }

    // Ruta principal del chatbot
    app.post('/api/chat', async (req, res) => {
        const userMessage = req.body.message;
        let context = req.body.context || [];

        const lowerCaseMessage = userMessage.toLowerCase();
        let directResponse = null; // Ahora directResponse será un objeto { message, options }

        // --- Lógica de respuesta directa (sin IA) ---
        if (lowerCaseMessage.includes("comandos") || lowerCaseMessage.includes("lista de comandos") || lowerCaseMessage.includes("que puedo usar") || lowerCaseMessage.includes("qué puedo preguntar")) {
            directResponse = getAvailableCommands();
        } else if (lowerCaseMessage.includes("hola")) {
            directResponse = {
                message: getRandomResponse([
                    "**¡Hola!** ¿En qué puedo ayudarte hoy con tus tachos?",
                    "¡Saludos! Dime, ¿qué **información** necesitas sobre tus dispositivos?",
                    "¡Qué gusto verte! Estoy aquí para ayudarte con el **estado de los tachos**. ¿Qué necesitas?",
                    // --- Nuevas opciones breves, profesionales y amigables con formato ---
                    "**¡Hola!** Tu asistente **FloatBin AI** está lista para ayudar. ¿Qué **información** buscas hoy?",
                    "¡Bienvenido/a! Estoy aquí para ofrecerte el mejor **soporte** con tus datos. ¿__Cómo te asisto__?",
                    "¡Saludos! Siempre es un placer. ¿En qué estado quieres **verificar tus tachos**?",
                    "**¡Hola!** ¿Necesitas alguna **actualización** o **reporte**? Estoy a tu disposición.",
                    "¡Conectado/a! ¿__Cómo puedo hacer tu gestión de residuos más eficiente hoy__?",
                    "¡Un gusto verte! Estoy lista para responder tus preguntas sobre los **tachos inteligentes**.",
                    "¡Hey! Estoy aquí para asegurar que tus **datos estén claros**. ¿Qué te gustaría saber?",
                    "¡Hola de nuevo! Dime, ¿__cómo optimizamos tus procesos de recolección__?",
                    "¡Tu **asistente dedicada** está en línea! ¿Qué **información importante** necesitas?",
                    "¡Listo/a para ayudarte! ¿Qué podemos lograr juntos con tus **tachos FloatBin**?"
                ]),
                options: ["¿Cómo están los tachos?", "Comandos"]
            };
        } else if (lowerCaseMessage.includes("de que trata el proyecto") || lowerCaseMessage.includes("informacion del proyecto") || lowerCaseMessage.includes("explicame floatbin") || lowerCaseMessage.includes("sobre floatbin ai")) {
            directResponse = getProjectInfo();
        } else if (lowerCaseMessage.includes("que es un tacho iot") || lowerCaseMessage.includes("que es un tacho inteligente") || lowerCaseMessage.includes("como funciona un tacho inteligente")) {
            directResponse = getTachoIoTInfo();
        } else if (lowerCaseMessage.includes("optimiza rutas") || lowerCaseMessage.includes("optimizacion de rutas") || lowerCaseMessage.includes("mapas y rutas") || lowerCaseMessage.includes("como optimizan las rutas")) {
            directResponse = getRouteOptimizationInfo();
        } else if (lowerCaseMessage.includes("redes neuronales") || lowerCaseMessage.includes("como funciona la ia") || lowerCaseMessage.includes("inteligencia artificial") || lowerCaseMessage.includes("ia de floatbin")) {
            directResponse = getNeuralNetworksInfo();
        } else if (lowerCaseMessage.includes("quienes son los desarrolladores") || lowerCaseMessage.includes("el equipo") || lowerCaseMessage.includes("quien programo") || lowerCaseMessage.includes("quienes son los creadores")) {
            directResponse = getDevelopersInfo();
        } else if (lowerCaseMessage.includes("somos de paita") || lowerCaseMessage.includes("de donde son") || lowerCaseMessage.includes("origen del equipo")) {
            directResponse = getTeamOriginInfo();
        } else if (lowerCaseMessage.includes("tiene predicciones") || lowerCaseMessage.includes("que es la prediccion") || lowerCaseMessage.includes("predicciones de llenado")) {
            directResponse = {
                message: "Sí, **FloatBin AI** utiliza **redes neuronales** para hacer **predicciones** sobre cuándo se llenará un tacho, basándose en patrones históricos de llenado. Esto nos permite optimizar la recolección y anticiparnos a las necesidades.",
                options: ["¿Qué son las redes neuronales?", "Optimizacion de rutas", "Comandos"]
            };
        } else if (lowerCaseMessage.includes("diseño en tiempo real") || lowerCaseMessage.includes("monitoreo en tiempo real") || lowerCaseMessage.includes("ver tachos en vivo")) {
            directResponse = {
                message: "¡Claro! **FloatBin AI** ofrece un **diseño y monitoreo en tiempo real** de los tachos. Puedes ver el estado de llenado, la ubicación y otros datos relevantes en nuestra interfaz de usuario en vivo. Esto te da control total sobre tus dispositivos.",
                options: ["¿Cómo se ve el diseño?", "¿Qué datos puedo ver?", "Comandos"] // Puedes expandir estas opciones si tienes más detalles
            };
        } else if (lowerCaseMessage.includes("ofrece estadistica") || lowerCaseMessage.includes("estadisticas de llenado") || lowerCaseMessage.includes("datos historicos")) {
            directResponse = {
                message: "**FloatBin AI** recopila y te ofrece **estadísticas detalladas** sobre el comportamiento de llenado de los tachos, su uso, eficiencia de rutas y más. Esto te ayuda a tomar decisiones informadas para una mejor gestión de residuos.",
                options: ["¿Qué tipo de estadísticas?", "Cómo optimizan las rutas", "Comandos"]
            };
        } else if (lowerCaseMessage.includes("envia notificaciones al whatsapp") || lowerCaseMessage.includes("alertas por whatsapp") || lowerCaseMessage.includes("notificaciones por whatsapp")) {
            directResponse = {
                message: "¡Así es! **FloatBin AI** puede enviarte **notificaciones directamente a tu WhatsApp** cuando un tacho alcanza un estado crítico (por ejemplo, 'Alto' o 'Lleno'), o si hay alguna otra incidencia importante. Te mantenemos informado en tiempo real.",
                options: ["¿Cómo configuro las notificaciones?", "¿Qué otras alertas hay?", "Comandos"]
            };
        }


        const tachoIdMatch = lowerCaseMessage.match(/(tacho|bote|contenedor)-(\d+)/);
        const deviceId = tachoIdMatch ? `Tacho-${tachoIdMatch[2].padStart(2, '0')}` : null;

        if (!directResponse && deviceId) {
            if (lowerCaseMessage.includes("estado") || lowerCaseMessage.includes("cómo está")) {
                directResponse = getBinStatus(deviceId);
            } else if (lowerCaseMessage.includes("ubicación") || lowerCaseMessage.includes("dónde está")) {
                directResponse = getBinLocation(deviceId);
            } else if (lowerCaseMessage.includes("recomendación") || lowerCaseMessage.includes("qué hago con")) {
                const binData = sharedState.bins[deviceId]?.lastData;
                let recommendationMessage = '';
                let recommendationOptions = [`¿Cuál es el estado del ${deviceId}?`, `Comandos`];

                if (binData && binData.estado) {
                    recommendationMessage = `Para el tacho **${deviceId}** (estado: ${binData.estado}): `;
                    switch (binData.estado) {
                        case 'Lleno':
                            recommendationMessage += "¡Necesita ser vaciado urgentemente para evitar desbordamientos!";
                            break;
                        case 'Alto':
                            recommendationMessage += "Sería buena idea planificar su vaciado pronto, está casi lleno.";
                            break;
                        case 'Medio':
                            recommendationMessage += "Puedes considerar vaciarlo en tu próxima ruta, tiene espacio, pero está a la mitad.";
                            break;
                        case 'Bajo':
                            recommendationMessage += "Todavía tiene mucho espacio, no requiere atención inmediata.";
                            break;
                        case 'Vacio':
                            recommendationMessage += "Está vacío, listo para seguir recibiendo residuos. ¡Buen trabajo!";
                            break;
                        default:
                            recommendationMessage += "No tengo una recomendación específica para este estado. Puedes revisar sus datos.";
                    }
                } else {
                    recommendationMessage = `No tengo datos recientes para el tacho **${deviceId}** para dar una recomendación.`;
                }
                directResponse = { message: recommendationMessage, options: recommendationOptions };
            }
        }

        if (!directResponse) {
            if (lowerCaseMessage.includes("cuántos tachos") || lowerCaseMessage.includes("número de tachos")) {
                directResponse = getBinCount();
            } else if (lowerCaseMessage.includes("tachos activos") || lowerCaseMessage.includes("dime los activos")) {
                directResponse = getActiveBins();
            } else if (lowerCaseMessage.includes("nombre de todos los tachos") || lowerCaseMessage.includes("cómo se llaman los tachos") || lowerCaseMessage.includes("dime los nombres de los tachos")) {
                directResponse = getBinNames();
            } else if (lowerCaseMessage.includes("estado de los tachos") || lowerCaseMessage.includes("cómo están los tachos") || lowerCaseMessage === "estado") {
                directResponse = getBinStatus();
            } else if (lowerCaseMessage.includes("tachos llenos") || lowerCaseMessage.includes("cuáles están llenos")) {
                directResponse = getBinsByStatus("Lleno");
            } else if (lowerCaseMessage.includes("tachos vacíos") || lowerCaseMessage.includes("cuáles están vacíos")) {
                directResponse = getBinsByStatus("Vacio");
            } else if (lowerCaseMessage.includes("tachos a la mitad") || lowerCaseMessage.includes("tachos medio")) {
                directResponse = getBinsByStatus("Medio");
            } else if (lowerCaseMessage.includes("tachos casi llenos") || lowerCaseMessage.includes("tachos altos")) {
                directResponse = getBinsByStatus("Alto");
            } else if (lowerCaseMessage.includes("tachos con poco") || lowerCaseMessage.includes("tachos bajos")) {
                directResponse = getBinsByStatus("Bajo");
            }
        }

        if (directResponse) {
            context.push({ role: 'user', parts: [{ text: userMessage }] });
            context.push({ role: 'model', parts: [{ text: directResponse.message }] });
            return res.json({ response: directResponse.message, context: context, options: directResponse.options });
        }
        // --- FIN DE LA LÓGICA DE RESPUESTA DIRECTA (SIN IA) ---

        try {
            const contents = [...context.map(entry => ({
                role: entry.role,
                parts: [{ text: entry.parts[0].text }]
            })),
            { role: 'user', parts: [{ text: userMessage }] }
            ];

            const geminiRequestPayload = {
                contents: contents,
                ...GEMINI_MODEL_CONFIG
            };

            const geminiResponse = await axios.post(
                `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL_CONFIG.model}:generateContent?key=${API_KEY}`,
                geminiRequestPayload,
                { headers: { 'Content-Type': 'application/json' } }
            );

            const candidate = geminiResponse?.data?.candidates?.[0];
            const call = candidate?.content?.parts?.[0]?.functionCall;

            let finalBotResponse = '';
            let finalOptions = [];

            if (call) {
                let toolResponseObject; // Esto almacenará { message, options }

                if (call.name === 'getBinStatus') {
                    toolResponseObject = getBinStatus(call.args.deviceId);
                } else if (call.name === 'getBinLocation') {
                    toolResponseObject = getBinLocation(call.args.deviceId);
                } else if (call.name === 'getBinsByStatus') {
                    toolResponseObject = getBinsByStatus(call.args.status);
                } else if (call.name === 'getActiveBins') {
                    toolResponseObject = getActiveBins();
                } else if (call.name === 'getBinNames') {
                    toolResponseObject = getBinNames();
                } else if (call.name === 'getBinCount') {
                    toolResponseObject = getBinCount();
                } else {
                    toolResponseObject = { message: `Error: Función ${call.name} no reconocida o no implementada.`, options: [] };
                }

                // Usar la 'message' del objeto para la respuesta de la herramienta
                const toolResponseMessage = {
                    role: 'function',
                    parts: [{
                        functionResponse: {
                            name: call.name,
                            response: { result: toolResponseObject.message }, // Gemini espera un string aquí
                        },
                    }],
                };

                const newContents = [...contents, { role: 'model', parts: [{ functionCall: call }] }, toolResponseMessage];

                const secondGeminiResponse = await axios.post(
                    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL_CONFIG.model}:generateContent?key=${API_KEY}`,
                    { contents: newContents, ...GEMINI_MODEL_CONFIG },
                    { headers: { 'Content-Type': 'application/json' } }
                );

                finalBotResponse = secondGeminiResponse?.data?.candidates?.[0]?.content?.parts?.[0]?.text;
                // Las opciones provienen directamente de la función de la herramienta
                finalOptions = toolResponseObject.options;

            } else {
                finalBotResponse = candidate?.content?.parts?.[0]?.text || 'Lo siento, no pude entender tu pregunta. ¿Puedes reformularla?';
                finalOptions = ["¿Cómo están los tachos?", "Comandos"]; // Opciones por defecto si la IA no usa una herramienta
            }

            context.push({ role: 'user', parts: [{ text: userMessage }] });
            context.push({ role: 'model', parts: [{ text: finalBotResponse }] });
            return res.json({ response: finalBotResponse, context: context, options: finalOptions });

        } catch (error) {
            console.error('Error en el chatbot (direct Axios):', error.response ? error.response.data : error.message);
            let errorMessage = 'Lo siento, no pude procesar tu solicitud. Ha ocurrido un error interno.';
            let errorOptions = ["Comandos"]; // Opciones en caso de error

            if (error.response && error.response.data && error.response.data.error && error.response.data.error.message.includes("blocked due to safety reasons")) {
                errorMessage = "Lo siento, tu consulta fue bloqueada por razones de seguridad. Por favor, intenta de nuevo con una pregunta diferente.";
            } else if (error.message.includes("exceeded the maximum context length")) {
                errorMessage = "Lo siento, la conversación se ha vuelto demasiado larga. Por favor, inicia una nueva conversación.";
                context = [];
                errorOptions.push("Hola"); // Sugerir empezar de nuevo
            } else if (error.response && error.response.status === 429) {
                errorMessage = "¡Uhm, lo siento! He recibido **demasiadas preguntas** en poco tiempo. Por favor, espera un minuto e inténtalo de nuevo. Mientras tanto, puedes explorar mis 'Comandos' para ver qué más puedo hacer.";
                // Asegurarte de que "Comandos" esté en las opciones si no lo está por defecto
                if (!errorOptions.includes("Comandos")) {
                    errorOptions.push("Comandos");
                }
                if (!errorOptions.includes("Hola")) { // Podrías añadir "Hola" también
                    errorOptions.push("Hola");
                }
            }

            if (context.length > 0) {
                context.push({ role: 'user', parts: [{ text: userMessage }] });
                context.push({ role: 'model', parts: [{ text: errorMessage }] });
            } else {
                context = [{ role: 'user', parts: [{ text: userMessage }] }, { role: 'model', parts: [{ text: errorMessage }] }];
            }

            res.status(500).json({ error: errorMessage, context: context, options: errorOptions });
        }
    });
};

