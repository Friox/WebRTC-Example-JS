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
	setStatus('calleeStatus', 'Waiting...', 'red')
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
		socket.on("connect_error", (e) => {
			console.error('signaling server connect error', e.message)
			forceAlert('error', '오류', e.message, true)
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

	randomStrBtn.onclick = () => {
		roomCode = getRandomStr(5)
		roomCodeInput.value = roomCode
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

	// 방 생성 버튼
	const roomCreateBtnEl = document.getElementById('roomCreateBtn')
	roomCreateBtnEl.onclick = () => {

		// 코드가 형식에 맞으면
		roomCode = roomCodeInput.value
		if (roomCode.match(/^[A-Z0-9]{5}$/g)) {
			socket.emit('CREATE_ROOM', roomCode)	// 시그널링서버로 생성 요청

			// 이미 방이 존재할때
			const ALREADY_EXIST_LISTENER = () => {
				console.log('ALREADY EXIST')
				forceAlert('error', '오류', '이미 존재하는 방입니다', true)
				socket.off('CREATED_ROOM', CREATED_ROOM_LISTENER)
			}

			// 방이 생성되었을때
			const CREATED_ROOM_LISTENER = (room) => {

				console.log('CREATED ROOM')

				// 상호 간 준비됐을때
				const READY_LISTENER = () => {
					console.log('READY!')
					setStatus('calleeStatus', 'Joined', 'green')
					toggleAccordion(4)
				}

				// 다른경우의 이벤트리스너는 해제하고 상호 간 준비됨을 기다림
				socket.off('ALREADY_EXIST', ALREADY_EXIST_LISTENER)
				socket.once('READY', READY_LISTENER)
				setStatus('roomStatus', `${room}`, 'green')
				setStatus('roomGuide', `${room}`)
				const roomGuideEl = document.getElementById('roomGuide')
				roomGuideEl.style.cursor = 'pointer'
				roomGuideEl.onclick = () => {
					navigator.clipboard.writeText(roomCode).then(() => {
						const guideIndiEl = document.getElementById('guideIndi')
						guideIndiEl.style.display = 'inline-block'
					})
				}
				toggleAccordion(3)
			}

			// 이벤트 리스너 등록
			socket.once('CREATED_ROOM', CREATED_ROOM_LISTENER)
			socket.once('ALREADY_EXIST', ALREADY_EXIST_LISTENER)
		} else {
			forceAlert('error', '오류', '코드 형식에 맞지 않습니다', true)
		}
	}

	// Offer SDP 송신 버튼
	const sendOfferBtnEl = document.getElementById('sendOfferBtn')
	sendOfferBtnEl.onclick = async () => {
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

		// 시그널링서버 - Answer SDP 수신 대기
		socket.once('ICE_ANSWER', async (description) => {
			console.log('ANSWER SDP RECEIVED')
			const remoteDesc = new RTCSessionDescription(description)
			await peerConnection.setRemoteDescription(remoteDesc)
			setStatus('remoteSDPStatus', 'OK', 'green')
		})

		// RTCPeerConnection 인스턴스 생성
		peerConnection = new RTCPeerConnection(DEFAULT_CONFIG)
		peerConnection.onicecandidate = (event) => {
			// 연결 후보가 하나 수집됐을때
			if (event.candidate) {
				// 시그널링 서버를 통해 Callee에게 후보 전송
				console.log('TRANSMITTING LOCAL CANDIDATE')
				socket.emit('ICE_CANDIDATE', event.candidate, 1)
			}
		}

		peerConnection.onconnectionstatechange = () => {
			// 연결이 수립됐을때
			if (peerConnection.connectionState == 'connected') {
				console.log('PEER CONNECTED!')
				setStatus('peerConnStatus', 'Connected', 'green')
				toggleAccordion(6)
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
			// 스트림이 유효하면 Offer SDP 생성, 설정 및 송신
			const offer = await peerConnection.createOffer()
			await peerConnection.setLocalDescription(offer)
			setStatus('localSDPStatus', 'OK', 'green')
			socket.emit('ICE_OFFER', offer)
			toggleAccordion(5)
		}
	}
}