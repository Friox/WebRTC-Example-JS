function forceAlert(icon, title, text, confirm, confirmFunc = () => {}) {
	Swal.fire({
		icon: icon,
		title: title,
		text: text,
		showDenyButton: false,
		showCancelButton: false,
		showConfirmButton: confirm,
		allowOutsideClick: false
	}).then((res) => {
		if (res.isConfirmed) {
			confirmFunc()
		}
	})
}

function timerAlert(icon, title, text, progress, closeFunc = () => {}) {
	if (title.length) {
		Swal.fire({
			icon: icon,
			title: title,
			text: text,
			showConfirmButton: false,
			timer: 2000,
			willClose: closeFunc,
			timerProgressBar: progress
		})
	} else {
		Swal.fire({
			icon: icon,
			text: text,
			showConfirmButton: false,
			timer: 1500,
			willClose: closeFunc
		})
	}	
}

function getRandomStr(num) {
    const str = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    const strlen = str.length
    let res = ''
    for (let i = 0; i < num; ++i) res += str.charAt(Math.floor(Math.random() * strlen))
    return res
}