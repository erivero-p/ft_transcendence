import { throwAlert } from "../../app/render.js";
import { handleGetFriendList } from "../friends/app.js";
import { createTournament, createTournamentInvitation, deleteTournament} from "../../app/pong.js";
import { handleGetEditableTournaments, showEditTournamentSection } from "./edit.js";
import { preventMultipleClicks } from "../../app/router.js";
import { invitationStatuses } from "../chat/bubbles.js";
let requiredParticipants = 0;
let selectedFriends = [];

// Initializes the new tournament setup
export async function initializeNewTournament(addListener) {
    selectedFriends = [];
    const pendantTour = await handleGetEditableTournaments();
    //console.log("pendanTour: ", pendantTour);
    if (!pendantTour) {
        showNewTournamentSection();
    } else {
        showEditTournamentSection(pendantTour.token, addListener);
    }
}

function showNewTournamentSection() {
    const elements = getElements();
    elements.newContainer.style.display = 'block';
    elements.pendantContainer.style.display = 'none';
    elements.nameInput.value = '';
    setSwitches(elements);
    renderFriendList(elements);
    initStartNewTournament(elements);
}

// Retrieves the necessary DOM elements
function getElements() {
    return {
        newContainer: document.getElementById('new-tournament-container'),
        pendantContainer: document.getElementById('pendant-tournament-container'),
        switchButtons: document.querySelectorAll('.switch-btn'),
        friendsContainer: document.getElementById("friends-container"),
        friendList: document.getElementById('tournament-friends-list'),
        nameInput: document.getElementById('tournament-name-input')
    };
}

// Sets up event listeners for switch buttons to update participant requirements
function setSwitches(elements) {
    elements.switchButtons.forEach((button) => {
        button.addEventListener("click", (event) => {
            event.preventDefault();
            elements.switchButtons.forEach((btn) => btn.classList.remove("active"));
            button.classList.add("active");
            updateRequiredParticipants(button.getAttribute("data-participants"));
            elements.friendList.classList.add('show');
        });
    });
}

// Updates the required number of participants and manages the start button state
function updateRequiredParticipants(total) {

    const startBtn = document.getElementById('start-tournament-btn');

    requiredParticipants = Number.parseInt(total, 10); // -1 cause we already include the creator 
    if (selectedFriends.length === requiredParticipants - 1) {
        startBtn.disabled = false;
    } else {
        startBtn.disabled = true;
        if (selectedFriends.length >= requiredParticipants) {
            const excedent = selectedFriends.length - requiredParticipants;
            throwAlert(`You'll have to unselect ${excedent} friend${excedent === 1 ? '' : 's'}`);
        }
    }
}

// Refreshes the friend list for the tournament
export function refreshTournamentFriendList() {
    if (requiredParticipants) {
        const elements = getElements();
        renderFriendList(elements);
    }
}

// Renders the list of friends available for the tournament
async function renderFriendList(elements) {
    elements.friendsContainer.innerHTML = '';
    const friends = await handleGetFriendList(); 
    if (friends.length < 3) {
        elements.friendsContainer.innerText = `you dont have enough friends to start a tournament`
        return ;
    }
    friends.forEach((friend) => {
        const friendBtn = document.createElement("div")
        friendBtn.className = "friend-btn"
        friendBtn.innerHTML = `<p class="mb-0">${friend.username}</p>`
        elements.friendsContainer.appendChild(friendBtn)
        friendBtn.addEventListener("click", () => toggleFriendSelection(friend.username, friendBtn))
    })
}

// Toggles the selection of friends for the tournament
function toggleFriendSelection(username, btn) {
    const startBtn = document.getElementById('start-tournament-btn');
    //console.log("Before toggle:", selectedFriends);
    if (btn.classList.contains("selected")) {
        btn.classList.remove("selected");
        selectedFriends = selectedFriends.filter((u) => u !== username);
        //console.log(`Unselected friend with username: ${username}`);
    } else {
        if (selectedFriends.length === requiredParticipants - 1) {
            return throwAlert(`You already have ${requiredParticipants} selected friends`);
        }
        btn.classList.add("selected");
        selectedFriends.push(username);
        //console.log(`Selected friend with username: ${username}`);
    }
    startBtn.disabled = selectedFriends.length !== requiredParticipants - 1;
}

export function parseTournamentName(tournamentName) {
    const tournamentNameRegex = /^[a-zA-Z0-9 ]{1,20}$/;
    if (!tournamentName) {
        return throwAlert('Please, give your tournament a name');
    }
    if (!tournamentNameRegex.test(tournamentName)) {
        throwAlert('Tournament name can only contain alphanumeric characters and spaces, and must be no more than 20 characters long.');
        return false;
    }
    return true;
}

function initStartNewTournament(elements) {
    const startBtn = document.getElementById('start-tournament-btn');
    const newStartBtn = startBtn.cloneNode(true);
    startBtn.parentNode.replaceChild(newStartBtn, startBtn);
    selectedFriends = [];
    //console.log("adding event listener");
    newStartBtn.addEventListener('click', () => preventMultipleClicks(newStartBtn, handleCreateNewTournament));
}

async function handleCreateNewTournament() {
    const tournamentName = document.getElementById('tournament-name-input').value;
    if (parseTournamentName(tournamentName)) {
        await createNewTournament(tournamentName);
    }
}

// Creates a new tournament with the selected friends
async function createNewTournament(tournamentName) {
    handleCreateTournament(tournamentName).then(async (token) => {
        if (token) {
            try {
                for (const username of selectedFriends) {
                    await handleSendTournamentInvitation(token, username);
                }
                showEditTournamentSection(token, true, requiredParticipants);
            } catch (error) {
                throwAlert(`Failed to send invitation: ${error.message}`);
                await handleDeleteTournament(token); // Delete the tournament if any invitation fails
            }
        }
    });
}

export async function handleCreateTournament(tournamentName) {
    const response = await createTournament(tournamentName, requiredParticipants);
    if (response.status === "success") {      
        return response.tournament.token;
    } else {
        throwAlert(response.message);
        return null;
    }
}

export async function handleSendTournamentInvitation(token, friendName) {
    const response = await createTournamentInvitation(token, friendName);
    if (response.status !== "success") {
        throw new Error(response.message || `Failed to send invitation to ${friendName}`);
    }
}

export async function handleDeleteTournament(token) {
    const response = await deleteTournament(token);
    if (response.status !== "success") {
        throwAlert(`Failed to delete tournament: ${response.message}`);
    } else {
        initializeNewTournament(false);
    }
}

