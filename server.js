const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 8080 });

let snakes = {};
let foodItems = [];
let powerUp = null; // Stores the current power-up item
let lastUpdateTime = Date.now();
let powerUpTimer = 0; // Tracks when to spawn the next power-up

const canvasWidth = 800;
const canvasHeight = 600;
const foodCount = 20;
const initialSnakeLength = 5;
const segmentSize = 10;
const powerUpSize = 20; // Size of power-up (larger than normal food)
const speedMultiplier = 2;
const powerUpDuration = 5000; // 5 seconds in milliseconds
const powerUpInterval = 60000; // 60 seconds for power-up respawn

// Utility function to generate a random color for each player
function generateRandomColor() {
    const letters = '0123456789ABCDEF';
    let color = '#';
    for (let i = 0; i < 6; i++) {
        color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
}

// Utility function to generate random food positions
function generateRandomFood() {
    return {
        x: Math.random() * canvasWidth,
        y: Math.random() * canvasHeight
    };
}

// Function to spawn a new power-up
function spawnPowerUp() {
    powerUp = {
        x: Math.random() * canvasWidth,
        y: Math.random() * canvasHeight
    };
}

// Function to update all snakes' positions and handle power-up logic
function updateSnakes() {
    let now = Date.now();
    let deltaTime = (now - lastUpdateTime) / 1000;
    lastUpdateTime = now;

    for (let id in snakes) {
        let snake = snakes[id];

        // Move the head
        let newX = snake.body[0].x + snake.direction.x * snake.speed * deltaTime;
        let newY = snake.body[0].y + snake.direction.y * snake.speed * deltaTime;

        // Handle screen wrapping
        if (newX < 0) newX = canvasWidth;
        if (newX > canvasWidth) newX = 0;
        if (newY < 0) newY = canvasHeight;
        if (newY > canvasHeight) newY = 0;

        // Move the body (snake grows by shifting the body segments)
        snake.body.unshift({ x: newX, y: newY });
        if (snake.body.length > snake.length) {
            snake.body.pop(); // Remove the last segment to keep snake size consistent
        }

        // Check if the snake eats food
        foodItems.forEach((food, index) => {
            if (Math.abs(newX - food.x) < segmentSize && Math.abs(newY - food.y) < segmentSize) {
                snake.length += 1; // Increase snake's length
                foodItems[index] = generateRandomFood(); // Respawn the food
            }
        });

        // Check if the snake eats the power-up
        if (powerUp && Math.abs(newX - powerUp.x) < powerUpSize && Math.abs(newY - powerUp.y) < powerUpSize) {
            snake.speed *= speedMultiplier; // Double the speed
            snake.powerUpActive = true; // Mark snake as having an active power-up
            snake.powerUpEndTime = Date.now() + powerUpDuration; // Set the end time for power-up effect
            powerUp = null; // Remove the power-up from the field
        }

        // Check if power-up effect should end
        if (snake.powerUpActive && Date.now() > snake.powerUpEndTime) {
            snake.speed /= speedMultiplier; // Reset the speed to normal
            snake.powerUpActive = false; // Power-up effect is over
        }

        // Check for collisions with other snakes
        for (let otherId in snakes) {
            if (id !== otherId) {
                let otherSnake = snakes[otherId];
                if (Math.abs(newX - otherSnake.body[0].x) < segmentSize && Math.abs(newY - otherSnake.body[0].y) < segmentSize) {
                    // Collision detected!
                    
                    // Transfer the losing snake's length to the winning snake
                    let transferLength = otherSnake.length - initialSnakeLength; // Extra length to transfer
                    if (transferLength > 0) {
                        snake.length += transferLength; // Increase the winning snake's length
                    }

                    // Reset the losing snake to its initial length
                    otherSnake.length = initialSnakeLength;
                    otherSnake.body = otherSnake.body.slice(0, initialSnakeLength); // Reset body length
                }
            }
        }
    }

    // Power-up logic: Spawn a new power-up every minute
    if (!powerUp && Date.now() > powerUpTimer) {
        spawnPowerUp();
        powerUpTimer = Date.now() + powerUpInterval; // Set next spawn time
    }
}

// Initialize food items
function initializeFood() {
    for (let i = 0; i < foodCount; i++) {
        foodItems.push(generateRandomFood());
    }
}

// Handle a new client connection
wss.on('connection', (ws) => {
    let id = Math.floor(Math.random() * 100000);
    let color = generateRandomColor();
    let name = "Player" + id; // Default name until client sends a real one

    // Create a new snake for the player
    snakes[id] = {
        body: [{ x: Math.random() * canvasWidth, y: Math.random() * canvasHeight }], // Start with one segment
        length: initialSnakeLength, // Length in segments
        direction: { x: 1, y: 0 },
        speed: 50,
        color: color,
        name: name,
        powerUpActive: false, // Whether the snake has an active power-up
        powerUpEndTime: null // The time when the power-up effect ends
    };

    ws.on('message', (message) => {
        const data = JSON.parse(message);

        if (data.type === 'start') {
            // When player submits their name
            snakes[id].name = data.name;

            // Send back the player ID so the client knows which snake it controls
            ws.send(JSON.stringify({ type: 'init', id }));
        } else if (data.type === 'move') {
            if (snakes[data.id]) {
                snakes[data.id].direction = data.direction;
            }
        }
    });

    ws.on('close', () => {
        delete snakes[id];
    });

    if (foodItems.length === 0) {
        initializeFood();
    }

    setInterval(() => {
        updateSnakes();
        const gameState = JSON.stringify({
            type: 'update',
            snakes,
            foodItems,
            powerUp // Include power-up data in the game state
        });
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(gameState);
            }
        });
    }, 50);
});

console.log("WebSocket server running on ws://localhost:8080");
