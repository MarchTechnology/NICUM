const express = require('express')
const http = require('http')
const WebSocket = require('ws')
const { URL } = require('url')

const app = express()
const port = 8080

let latestFrame = null
let latestSettings = null
let latestBattery = null
let publisherState = false
let pingId

const server = http.createServer(app)
const wss = new WebSocket.Server({ server })

wss.on('connection', (ws, req) => {
    const url = new URL(req.url, `http://202-155-94-64.domainesia.io`)
    const role = url.searchParams.get('role')
    ws.role = role

    function setPing() {
        publisherState = false
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

    if (ws.role === 'publisher') {
        publisherState = true
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
            clearInterval(pingId)
            pingId = setInterval(setPing, 10000)

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
            clearInterval(pingId)
            publisherState = false
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

    console.log(`New ${ws.role} connected`)
})

server.listen(port)
