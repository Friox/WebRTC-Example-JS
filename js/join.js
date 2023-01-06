let socket
let roomCode
let peerConnection
let isStreamOK

const DEFAULT_CONFIG = {
	iceServers: [
		{ urls: "stun:stun.l.google.com:19302" },
		{
			urls: [
				"turn:eu-0.turn.peerjs.com:3478",
				"turn:us-0.turn.peerjs.com:3478",
			],
			username: "peerjs",
			credential: "peerjsp",
		}
	]
}

function setStatus(id, text, color = 0) {
	const el = document.getElementById(id)
	if (el) {
		el.innerText = text
		if (color) el.style.color = color
	}
}

function toggleAccordion(idx) {
	new bootstrap.Collapse(document.querySelectorAll('.collapse')[idx - 1], {
		toggle: true
	})
}

function init() {
	setStatus('signalingStatus', 'Disconnected', 'red')
	setStatus('roomStatus', 'none', 'red')
	setStatus('localSDPStatus', 'NO', 'red')
	setStatus('remoteSDPStatus', 'NO', 'red')
	setStatus('peerConnStatus', 'Disconnected', 'red')
	setStatus('originStr', location.origin)
}

window.onload = () => {
	init()
	const localVideoEl = document.getElementById('localVideo')
	const remoteVideoEl = document.getElementById('remoteVideo')

	// 시그널링 서버 연결 버튼
	const serverConnectBtnEl = document.getElementById('serverConnectBtn')
	serverConnectBtnEl.onclick = () => {

		// 서버 연결
		socket = io(window.location.origin, {
			reconnection: false,
			transports: ["websocket"]
		})

		// 서버 연결 실패 시
		socket.on("connect_error", (err) => {
			console.error('signaling server connect error', e.message)
			forceAlert('error', '오류', err.message, true)
		})

		// 서버 연결 성공 시
		socket.on('connect', () => {
			console.log('SIGNALING SERVER CONNECTED')
			setStatus('signalingStatus', 'Connected', 'green')
			toggleAccordion(2)
		})

		// 서버 연결 해제 시
		socket.on('disconnect', () => {
			console.log('SIGNALING SERVER DISCONNECTED')
			setStatus('signalingStatus', 'Disconnected', 'red')
			forceAlert('error', '오류', '시그널링 서버와 연결이 끊어졌습니다, 새로고침합니다.', true, () => {
				location.reload()
			})
		})
	}

	roomCodeInput.onkeyup = (e) => {
		roomCodeInput.value = roomCodeInput.value.replace(/(?![A-Za-z0-9])./g, '').toUpperCase()
	}

	roomCodeInput.onpaste = (e) => {
		const data = e.clipboardData.getData('text/plain')
		if (data.match(/(?![A-Za-z0-9])./g)) {
			e.preventDefault()
			timerAlert('error', '오류', '사용할 수 없는 문자가 포함되어있습니다', true)
		}
	}

	// 방 입장 버튼
	const joinRoomBtnEl = document.getElementById('joinRoomBtn')
	joinRoomBtnEl.onclick = () => {

		// 코드가 형식에 맞으면
		roomCode = roomCodeInput.value
		if (roomCode.match(/^[A-Z0-9]{5}$/g)) {
			socket.emit('JOIN_ROOM', roomCode)	// 시그널링서버로 입장 요청

			const FULL_ROOM_LISTENER = () => {
				socket.off('JOINED_ROOM', JOINED_ROOM_LISTENER)
				socket.off('NOT_EXIST', NOT_EXIST_LISTENER)
				forceAlert('error', '오류', '꽉 찬 방입니다', true)
			}

			const NOT_EXIST_LISTENER = () => {
				socket.off('JOINED_ROOM', JOINED_ROOM_LISTENER)
				socket.off('FULL_ROOM', FULL_ROOM_LISTENER)
				forceAlert('error', '오류', '없는 방입니다', true)
			}

			// 방에 들어갔을때
			const JOINED_ROOM_LISTENER = (room) => {

				console.log('JOINED ROOM')

				// 상호 간 준비됐을때
				const READY_LISTENER = () => {
					console.log('READY!')
					socket.off('FULL_ROOM', FULL_ROOM_LISTENER)
					socket.off('NOT_EXIST', NOT_EXIST_LISTENER)

					// 시그널링서버 - ICE Candidate 수신 대기
					socket.on('ICE_CANDIDATE', async candidate => {
						console.log('REMOTE CANDIDATE RECEIVED')
						if (candidate.candidate) {
							try {
								await peerConnection.addIceCandidate(candidate)
							} catch (e) {
								console.error('add Candidate error', e)
							}
						}
					})

					// 시그널링 서버 - Offer SDP 수신 대기
					socket.once('ICE_OFFER', async (description) => {
						console.log('OFFER SDP RECEIVED')
						await peerConnection.setRemoteDescription(new RTCSessionDescription(description))
						setStatus('remoteSDPStatus', 'OK', 'green')
						toggleAccordion(4)
					})

					// RTCPeerConnection 인스턴스 생성
					peerConnection = new RTCPeerConnection(DEFAULT_CONFIG)
					peerConnection.onicecandidate = (event) => {
						// 연결 후보가 하나 수집됐을 때
						if (event.candidate) {
							// 시그널링 서버를 통해 Caller에게 후보 전송
							console.log('TRANSMITTING LOCAL CANDIDATE')
							socket.emit('ICE_CANDIDATE', event.candidate, 2)
						}
					}

					peerConnection.ontrack = (event) => {
						// 상대방의 스트림이 추가됐을때
						if (event.track.kind == 'video' || event.track.kind == 'audio') {
							console.log(`DETECT REMOTE ${event.track.kind.toUpperCase()} TRACK`)
							if (!remoteVideoEl.srcObject) {
								const inboundStream = new MediaStream();
								remoteVideoEl.srcObject = inboundStream;
							}
							remoteVideoEl.srcObject.addTrack(event.track)
						}
					}
					
					setStatus('roomStatus', `${room}`, 'green')
					toggleAccordion(3)
				}
				socket.once('READY', READY_LISTENER)
			}

			// 이벤트 리스너 등록
			socket.once('JOINED_ROOM', JOINED_ROOM_LISTENER)
			socket.once('FULL_ROOM', FULL_ROOM_LISTENER)
			socket.once('NOT_EXIST', NOT_EXIST_LISTENER)
		} else {
			forceAlert('error', '오류', '코드 형식에 맞지 않습니다', true)
		}
	}

	const sendAnswerBtnEl = document.getElementById('sendAnswerBtn')
	sendAnswerBtnEl.onclick = async () => {
		peerConnection.onconnectionstatechange = () => {
			// 연결이 수립됐을때
			if (peerConnection.connectionState == 'connected') {
				console.log('PEER CONNECTED!')
				setStatus('peerConnStatus', 'Connected', 'green')
				toggleAccordion(5)
			}
		}

		// 사용자 미디어 스트림 생성
		const openMediaDevices = async (constraints) => {
			return await navigator.mediaDevices.getUserMedia(constraints)
		}
	
		try {
			forceAlert('info', '스트림 생성중...', '브라우저에서 권한을 요청하면 허용해주세요!')
			const stream = await openMediaDevices({
				video: true,
				audio: true
			})
			const videoTrack = stream.getTracks().find((el) => {
				if (el.kind == 'video') return true
			})
			const audioTrack = stream.getTracks().find((el) => {
				if (el.kind == 'audio') return true
			})
			console.log('[LOCAL MEDIA] available devices', stream.getTracks())
			console.log('[LOCAL MEDIA] current videoTrack', videoTrack)
			console.log('[LOCAL MEDIA] current audioTrack', audioTrack)
			if (videoTrack) {
				localVideoEl.srcObject = new MediaStream()
				localVideoEl.srcObject.addTrack(videoTrack)
				setStatus('localStreamVideoStr', videoTrack.label)
				peerConnection.addTrack(videoTrack)
			}
			if (audioTrack) {
				setStatus('localStreamAudioStr', audioTrack.label)
				peerConnection.addTrack(audioTrack)
			}
			Swal.close()
			isStreamOK = true
		} catch (e) {
			console.error('create stream error', e)
			timerAlert('error', '오류', '스트림을 생성할 수 없습니다, 권한을 확인해주세요', true)
			isStreamOK = false
		}

		if (isStreamOK) {
			// 스트림이 유효하면 Answer SDP 생성, 설정 및 송신
			const answer = await peerConnection.createAnswer()
			await peerConnection.setLocalDescription(answer)
			setStatus('localSDPStatus', 'OK', 'green')
			socket.emit('ICE_ANSWER', answer)
		}
	}
}