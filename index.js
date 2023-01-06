const http = require('http');
const express = require('express')
const { Server } = require("socket.io");

const port = 8081
const app = express()
const server = http.createServer(app)
const io = new Server(server);
const role = ['🟡 SIGNALING', '🔵 CALLER', '🔴 CALLEE']

app.use('/css', express.static('./css'))
app.use('/js', express.static('./js'))

app.get('/', (req, res) => {
	res.send('<a href="/create">Caller</a> <a href="/join">Callee</a>')
})

app.get('/create', (req, res) => {
	res.sendFile(__dirname + '/create.html')
})

app.get('/join', (req, res) => {
	res.sendFile(__dirname + '/join.html')
})

server.listen(port, () => {
	console.log(`listening on port ${port}`)
})

function serverLog(type, str) {
	console.log(`[${role[type]}] ${str}`)
}

io.on('connection', (socket) => {
	socket.on('CREATE_ROOM', room => {
		serverLog(1, `REQUEST CREATE a room named ${room}`)
		let roomInstance = io.sockets.adapter.rooms.get(room)
		let roomClients = roomInstance ? roomInstance.size : 0
		serverLog(0, `${room} has ${roomClients} clients`)
		if (roomClients == 0) {
			serverLog(0, 'REQUEST ACCEPT ✅\r\n')
			socket.join(room)
			socket.emit('CREATED_ROOM', room)
		} else {
			serverLog(0, `${room} is ALREADY EXISTS, REQUEST REJECT ❌\r\n`)
			socket.emit('ALREADY_EXIST')
		}
	})

	socket.on('JOIN_ROOM', room => {
		serverLog(2, `REQUEST JOIN to ${room}`)
		let roomInstance = io.sockets.adapter.rooms.get(room)
		let roomClients = roomInstance ? roomInstance.size : 0
		serverLog(0, `${room} has ${roomClients} Clients`)
		if (roomClients == 1) {
			serverLog(0, `REQUEST ACCEPT ✅\r\n`)
			io.sockets.in(room).emit('JOIN_ROOM', room)
			socket.join(room)
			socket.emit('JOINED_ROOM', room)
			io.sockets.in(room).emit('READY')
		} else if (roomClients == 2) {
			serverLog(0, `${room} is FULL, REQUEST REJECT ❌\r\n`)
			socket.emit('FULL_ROOM')
		} else {
			serverLog(0, `${room} is INVALID CODE, REQUEST REJECT ❌\r\n`)
			socket.emit('NOT_EXIST')
		}
	})

	socket.on('ICE_CANDIDATE', (candidate, type) => {
		serverLog(type, `REQUEST : CANDIDATE ==> ${role[type == 1 ? 2 : 1]}`)
		socket.broadcast.emit('ICE_CANDIDATE', candidate)
		serverLog(0, `CANDIDATE transmitted to ${role[type == 1 ? 2 : 1]}\r\n`)
	})

	socket.on('ICE_OFFER', description => {
		serverLog(1, `REQUEST : OFFER SDP ==> ${role[2]}`)
		socket.broadcast.emit('ICE_OFFER', description)
		serverLog(0, `OFFER SDP transmitted to ${role[2]}\r\n`)
	})

	socket.on('ICE_ANSWER', description => {
		serverLog(2, `REQUEST : ANSWER SDP ==> ${role[1]}`)
		socket.broadcast.emit('ICE_ANSWER', description)
		serverLog(0, `ANSWER SDP transmitted to ${role[1]}\r\n`)
	})
})