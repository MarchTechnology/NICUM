const ws = new WebSocket('ws://202-155-94-64.domainesia.io:8080')
ws.binaryType = 'arraybuffer'

setInterval(() => {})

ws.onopen = () => {
    console.log('Connected to server as subscriber')
}

ws.onmessage = (e) => {
    const blob = new Blob([e.data], { type: 'image/jpeg' })
    const url = URL.createObjectURL(blob)
    document.getElementById('stream').src = url
}

ws.onerror = (err) => {
    console.error('WebSocket error: ', err)
}

ws.onclose = () => {
    console.log('Connection to server is disconnected')
}