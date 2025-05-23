import { getUsername } from "../../app/auth.js";
import { consoleSuccess, throwToast } from "../../app/render.js";
import { refreshFriendsFriendlist, refreshFriendData } from "../friends/app.js";
import { refreshTournamentFriendList } from "../tournament/new.js";
import { refreshChatFriendList } from "../chat/app.js";
import { renderPendingFriendRequests, refreshIfDeclined } from "../friends/requests.js";
import { getNotificationText, updateNotificationBell } from "./app.js";
import { handleAcceptedInvitation, handleDeclinedInvitation } from "../home/game-invitation.js";
import { handleCancelledInvitation } from "../chat/bubbles.js";
import { state } from "../chat/socket.js";
import { refreshFriendStatusOnHome } from "../home/app.js";
import { handleJoinMatchmakingMatch } from "../home/matchMaking.js";
import { handleJoinTournamentMatch } from "../tournament/started.js";
import { initializeNewTournament } from "../tournament/new.js";
import { initializeOngoingTournaments } from "../tournament/started.js";
import { GATEWAY_HOST } from "../../app/sendRequest.js";

let notiSocket = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_DELAY = 30000;



const notificationHandlers = {

    // Friends changes
    friend_added: (data) => handleFriendChanges('friend_added', data, 1),
    friend_removed: (data) => handleFriendChanges('friend_removed', data, -1),
    avatar_changed: (data) => handleFriendChanges('avatar_changed', data),
	friend_status_updated: (data) => handleFriendChanges('friend_status_updated', data),
    user_deleted: (data) => handleFriendChanges('user_deleted', data, -1),
    username_changed: (data) => handleFriendChanges('friend_username_changed', data),

    // Friend requests
    request_sent: () => handleFriendRequestChanges('request_sent'),
    request_declined: (data) => handleFriendRequestChanges('request_declined', data),
    request_cancelled: () => handleFriendRequestChanges('request_cancelled'),

    // Pong Match Events
    match_invitation: () => console.log("[NOTISOCKET] Match invitation received"),
    tournament_end: () => console.log("[NOTISOCKET] Tournament ended"),
    pong_match_accepted: (data) => handleAcceptedInvitation('pong', data.game_key),
    pong_match_decline: () => handleDeclinedInvitation(),
    pong_match_cancelled: (data) => handleCancelledInvitation(data.invitation_token),

    // Pong Tournament Events
    pong_tournament_closed: () => handleTournamentEvents('open'),
    pong_tournament_match_ready: (data) => handleJoinTournamentMatch(data.game_key),
    pong_tournament_players_update: () => handleTournamentEvents('invitation'),
    pong_tournament_match_finished: () => handleTournamentEvents('match'),
    pong_tournament_round_finished: () => handleTournamentEvents('match'),
    // Chess Match Events
    chess_match_accepted: (data) => handleAcceptedInvitation('chess', data.game_key),
    chess_match_decline: () => handleDeclinedInvitation(),
    chess_match_cancelled: (data) => handleCancelledInvitation(data.invitation_token),
    chess_match_accepted_random: (data) => handleJoinMatchmakingMatch(data.game_key),
};
 

export function initializeNotificationsSocket() {
    if (notiSocket && notiSocket.readyState !== WebSocket.CLOSED) {
        console.log("[NOTISOCKET] Already connected or connecting...");
        return;
    }

    notiSocket = new WebSocket(`wss://${GATEWAY_HOST}/ws/events/`);

    notiSocket.onopen = () => {
        
        consoleSuccess("[NOTISOCKET] Connection established succesfully");
        reconnectAttempts = 0; // Reset reconnection attempts
        startKeepAlive();
    };

    notiSocket.onmessage = (event) => {
        handleReceivedNotification(event);
    };

    notiSocket.onerror = (error) => {
        console.error("[NOTISOCKET] Error:", error);
    };

    notiSocket.onclose = () => {
        if (state.intentionalClose) {
            consoleSuccess("[NOTISOCKET] closed succesfully");
            notiSocket = null;
            return ; 
        }
        console.warn("[NOTISOCKET] Disconnected, attempting to reconnect...");
        scheduleReconnect();
    };
}

function scheduleReconnect() {
    const delay = Math.min(1000 * (2 ** reconnectAttempts), MAX_RECONNECT_DELAY);
    console.log(`[NOTISOCKET] Reconnecting in ${delay / 1000} seconds...`);
    setTimeout(initializeNotificationsSocket, delay);
    reconnectAttempts++;
}

function startKeepAlive() {
    setInterval(() => {
        if (notiSocket?.readyState === WebSocket.OPEN) {
            notiSocket.send(JSON.stringify({ event_type: "ping" }));
        }
    }, 30000);
}

function handleReceivedNotification(event) {
    try {
        const data = JSON.parse(event.data);
		const type = data.event_type;
		if (data.user === getUsername() || type == 'ping') {
            return ;
		}
        console.log("[NOTISOCKET] Notification received:", event.data);
		const handler = notificationHandlers[type];
        if (handler) {
            handler(data);
        }
        const text = getNotificationText(data);
        if (text) {
            throwToast(text);
            updateNotificationBell("on");
        }

    } catch (error) {
        console.error("[NOTISOCKET] Error parsing message:", error);
    }
}

let friendStatusUpdateTimeout = null;

function handleFriendChanges(type, data, add = 0) {
    const path = window.location.pathname;

    if (type === 'friend_status_updated')
        return handleStatusUpdate(path, data, add);
    if (path === '/friends') {
        const username = data.old_username || data.user;
        refreshFriendsFriendlist(username, add);
		if (add === 0) {
			refreshFriendData(username);
		}
    } if (path === '/home' && type === 'friend_status_updated') {

    }
    if (add) { // we dont see avatar or status on chat or tournament
        refreshChatFriendList(); // chat refreshes in all paths
        if (path === '/unstarted-tournament') {
            refreshTournamentFriendList();
        }
	}
}

function handleStatusUpdate(path, data, add) {
        // Clear any existing timeout for friend_status_updated
        clearTimeout(friendStatusUpdateTimeout);

        // Set a new timeout to handle the event
        friendStatusUpdateTimeout = setTimeout(() => {
            if (path === '/home') {
                refreshFriendStatusOnHome(); // Handle the event after the timeout
            } else if (path === '/friends') {
                const username = data.old_username || data.user;
                refreshFriendsFriendlist(username, add);
                if (add === 0) {
                    refreshFriendData(username);
                }
            }
        }, 1000); // Adjust the timeout duration as needed (500ms in this case)
        return;
}

function handleFriendRequestChanges(type, data = null) {
    if (window.location.pathname != '/friends') return ;
	if (type === 'request_sent' || type === 'request_cancelled') {
		renderPendingFriendRequests();
	} else {
		refreshIfDeclined(data.user);
	}
}
function handleTournamentEvents(type) {

    switch (type) {
        case 'invitation':
            if (window.location.pathname === '/unstarted-tournaments') {
                initializeNewTournament(false);
            } break ;
        case 'match':
            if (window.location.pathname === '/started-tournaments') {
                initializeOngoingTournaments(false);
            } break;
        case 'open':
            if (window.location.pathname === '/started-tournaments') {
                initializeOngoingTournaments(true);
            } break;
    }
}



export { notiSocket }