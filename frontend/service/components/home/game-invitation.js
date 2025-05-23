import { createPongMatchInvitation, acceptPongInvitation, denyPongInvitation, cancelPongInvitation } from "../../app/pong.js";
import { createChessMatchInvitation, acceptChessInvitation, denyChessInvitation, cancelChessInvitation, getChessInvitationDetail } from "../../app/chess.js";
import { hideModalGently, throwAlert, throwToast } from "../../app/render.js";
import { navigateTo } from "../../app/router.js";
import { chessVariant } from "./app.js";
import { setInvitationStatus } from "../chat/bubbles.js";

export async function handleSendGameInvitation(gameData, button) {
    button.disabled = true;
    const token = await sendQuickGameInvitation(gameData.game, gameData.friend);
    if (token < 0) {
        return ;
    }
    launchWaitModal(gameData.friend, gameData.game, token);


    // Re-enable the button after a few seconds
    let countdown = 5; // Adjust the countdown duration as needed
    button.innerText = `Please, don't spam ${countdown}s`;
    const interval = setInterval(() => {
        countdown -= 1;
        button.innerText = `Please, don't spam ${countdown}s`;

        if (countdown <= 0) {
            clearInterval(interval);
            button.disabled = false;
            button.innerText = 'Start game with friend'; // Reset the button text
        }
    }, 1000);

}

async function sendQuickGameInvitation(game, friendName) {
    const response = game === 'pong' ? await createPongMatchInvitation(friendName) : await createChessMatchInvitation(friendName, chessVariant);
    if (response.status === "success") {
        console.log(`[${game.toUpperCase()}] Invitation sent successfully`);
        return response.invitation.token;
    } else {
        console.error('Failed to send invitation:', response.message);
        return -1;
    }
}

export function handleAcceptedInvitation(game, key) {
    const modalElement = document.getElementById('wait-game');
    if (modalElement) {
        const modalInstance = bootstrap.Modal.getInstance(modalElement);
        if (modalInstance) {
            modalInstance.hide();
        }
        sessionStorage.setItem('inGame', `/${game}`);
    }
    navigateTo(`/${game}`, key);
}

export function handleDeclinedInvitation() {
    const modalElement = document.getElementById('wait-game');
    if (modalElement) {
        const modalInstance = bootstrap.Modal.getInstance(modalElement);
        if (modalInstance) {
            hideModalGently(modalInstance);
        }
        const name = modalElement.querySelector('#modal-text').dataset.username;
        throwToast(`${name} declined your invitation`);
    }
}

export async function handleAcceptQuickGameInvitation(game, token) {
    const response = game ==='pong' ? await acceptPongInvitation(token) : await acceptChessInvitation(token);
    if (response.status === "success") {
        if (window.location.pathname == `/${game}`) // if you're aready playing local
            await navigateTo('/home');
        sessionStorage.setItem('inGame', `/${game}`);
        await navigateTo(`/${game}`, response.game_key);
        setInvitationStatus(token, 'accepted');
        return (1);
    } else {
        console.error('Failed to accept invitation:', response.message);
        if (response.message.includes("already")) throwAlert(response.message);
        return (0);
    }
}

export async function handleDeclineInvitation(game, token) {
    const response = game ==='pong' ? await denyPongInvitation(token) : await denyChessInvitation(token);
    if (response.status === "success") {
        console.log(`[${game.toUpperCase()}] invitation declined successfully`);
        setInvitationStatus(token, 'declined');
    } else {
        console.error('Failed to accept invitation:', response.message);
    }
}

async function handleCancelQuickGameInvitation(game, token) {
    const response = game === 'pong' ? await cancelPongInvitation(token) : await cancelChessInvitation(token);
    setInvitationStatus(token, 'cancelled');
    if (response.status === "success") {
        console.log(`[${game.toUpperCase()}] invitation canceled successfully`);
    } else {
        console.error('Failed to accept invitation:', response.message);
    }
}


function launchWaitModal(friendName, game, token) {
    const modalHTML = `
        <div class="modal fade" id="wait-game" tabindex="-1" aria-labelledby="waitGameLabel" aria-hidden="true">
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title ctm-text-title" id="waitGameLabel">Waiting for ${friendName}</h5>
                    </div>
                    <div class="modal-body">
                        <p id="modal-text" data-username=${friendName}>Waiting for ${friendName} to start a game of ${game}...</p>
                        <div class="progress mt-3 position-relative" style="height: 30px;">
                            <div id="progress-bar" class="progress-bar" style="width: 100%" role="progressbar" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100"></div>
                            <span id="timer" class="position-absolute top-50 start-50 translate-middle"></span>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn ctm-btn" data-bs-dismiss="modal" data-action="cancel-invitation">Cancel</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    const modalElement = document.createElement('div');
    modalElement.innerHTML = modalHTML;
    document.body.appendChild(modalElement);

    const modal = new bootstrap.Modal(modalElement.querySelector('#wait-game'), {
        backdrop: 'static', // Evita cerrar la modal al hacer clic fuera
        keyboard: false     // Evita cerrar la modal con la tecla escape
    });
    modal.show();


    handleProgressBar(modal, modalElement, token);

    const cancelBtn = modalElement.querySelector('[data-action="cancel-invitation"]');
    cancelBtn.addEventListener('click', () => {
        handleCancelQuickGameInvitation(game, token);
        modal.hide();
    });

    modalElement.querySelector('#wait-game').addEventListener('hidden.bs.modal', () => {
        modalElement.remove();
    });
}

function handleProgressBar(modal, modalElement, token, game) {
	const progressBar = modalElement.querySelector('#progress-bar');
	const timer =  modalElement.querySelector('#timer');
	const waitGame = modalElement.querySelector('#wait-game');

    let progress = 100;
    const interval = setInterval(() => {
        let time = Math.floor(progress / 100 * 30);
        progress -= 1;
        progressBar.style.width = `${progress}%`;
        progressBar.setAttribute('aria-valuenow', progress);
        timer.textContent = `${time}`;
        if (progress <= 0) {
            clearInterval(interval);
            handleCancelQuickGameInvitation(game, token);
            modal.hide();
        }
        if (progress < 50) {
            timer.style.color = `var(--light)`;
        } else {
            timer.style.color = `var(--dark)`;
        }
    }, 300);
    waitGame.addEventListener('hidden.bs.modal', () => {
        clearInterval(interval);
        progressBar.style.width = '100%';
        progressBar.setAttribute('aria-valuenow', 100);
        timer.textContent = '30s';
        timer.style.color = 'var(--dark);'
    });
}
