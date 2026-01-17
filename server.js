const express = require('express')
const http = require('http')
const WebSocket = require('ws')
const { URL } = require('url')

const app = express()
const port = 8080

let latestFrame = null
let latestSettings = null
let latestBattery = null
let publisherSocket = null
let publisherState = false
let lastPublisherPing  = Date.now()

const server = http.createServer(app)
const wss = new WebSocket.Server({
    server,
    perMessageDeflate: false
})

wss.on('connection', (ws, req) => {
    const url = new URL(req.url, `http://${req.headers.host}`)
    const role = url.searchParams.get('role')
    ws.role = role

    if (!['publisher', 'client'].includes(role)) {
        ws.close(1008, 'Invalid role')
        return
    }

    if (ws.role === 'publisher') {
        lastPublisherPing = Date.now()
        publisherState = true
        publisherSocket = ws
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN && client.role === 'client') {
                client.send(JSON.stringify({
                    data: {
                        state: true,
                        lux: 0.0,
                        hum: 0.0,
                        temp: 0.0
                    }
                }))
            }
        })
    } else {
        if (latestFrame)
            ws.send(latestFrame, { binary: true })

        ws.send(JSON.stringify({
            data: {
                state: publisherState,
                lux: 0.0,
                hum: 0.0,
                temp: 0.0
            },
            settings: latestSettings,
            battery: latestBattery
        }))
    }

    ws.on('message', (message, isBinary) => {
        if (ws.role === 'publisher') {
            lastPublisherPing = Date.now()
            if (isBinary) {
                latestFrame = message
                wss.clients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN && client.role === 'client') {
                        client.send(message, { binary: true })
                    }
                })
            } else {
                try {
                    const raw = JSON.parse(message)
                    if ('settings' in raw) {
                        latestSettings = raw.settings
                    }
                    
                    if ('data' in raw) {
                        raw.data.state = true
                    }

                    if ('battery' in raw) {
                        latestBattery = raw.battery
                    }

                    wss.clients.forEach(client => {
                        if (client.readyState === WebSocket.OPEN && client.role === 'client') {
                            client.send(JSON.stringify(raw))
                        }
                    })
                } catch (err) {
                    wss.clients.forEach(client => {
                        if (client.readyState === WebSocket.OPEN && client.role === 'client') {
                            client.send(`Error parsing data. error: ${err}`)
                        }
                    })
                }
            }
        } else {
            try {
                const raw = JSON.parse(message)
                if ('request' in raw) {
                    ws.send(JSON.stringify({ settings: latestSettings, battery: latestBattery }))
                } else {
                    wss.clients.forEach(client => {
                        if (client.readyState === WebSocket.OPEN && client.role === 'publisher') {
                            client.send(JSON.stringify(raw))
                        }
                    })
                }
            } catch (err) {
                ws.send(`Error parsing data. error: ${err}`)
            }
        }
    })

    ws.on('close', () => {
        if (ws.role === 'publisher') {
            publisherState = false
            publisherSocket = null
            lastPublisherPing = 0
            wss.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN && client.role === 'client') {
                    client.send(JSON.stringify({
                        data: {
                            state: false,
                            lux: 0.0,
                            hum: 0.0,
                            temp: 0.0
                        }
                    }))
                }
            })
        }
    })

    ws.on('error', err => {
        console.error('WebSocket error:', err.message)
        ws.close(1002, 'Protocol error')
    })

    console.log(`New ${ws.role} connected`)
})

setInterval(() => {
    const alive = Date.now() - lastPublisherPing < 10000
    if (alive !== publisherState) {
        publisherState = alive
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN && client.role === 'client') {
                client.send(JSON.stringify({
                    data: {
                        state: alive,
                        lux: 0.0,
                        hum: 0.0,
                        temp: 0.0
                    }
                }))
            }
        })
    }
}, 3000)

server.listen(port)
