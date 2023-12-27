"use strict";
/********** Entry *********/
let Status = "Entry-Wait";
let UUID = 0,
    MyRoom = "None",
    MyName,
    rlengths = {},
    room_next = undefined;
/********** Functions *********/
// io connection / disconnection
let socket = io();
socket.on("connect", () => {
  if (Status !== "Kick" && Status !== "Entry-Wait") location.reload();
  else start_connection();
});
socket.on("disconnect", () => {
  if (Status !== "Kick" && Status !== "Reload") location.reload();
});
// display RoomDetail
function dispRoomDetails(open_){
  if(open_)
    document.getElementById("RoomDetails").style.display = "block";
  else
    document.getElementById("RoomDetails").style.display = "none";
}
// cookie UUID
function getCookie(ckey) {
  let value = document.cookie.match(new RegExp(ckey + "=([^;]*);*"));
  return value ? decodeURIComponent(value[1]) : null;
}
UUID = getCookie("UUID") || encodeURIComponent(crypto.randomUUID());
document.cookie = "UUID=" + UUID + `;max-age=${86400*7};path=/`;
// Start Connection
function start_connection() {
  socket.emit("Auth-RQ", {
    User: "Admin",
    Status: Status,
    Room: "None",
    Time: formatDate(new Date(),"yyyy/MM/dd, HH:mm:ss"),
    UUID: UUID
  });
  console.log("Send UUID to server");
}
// get Date
function formatDate(date, format) {
  format = format.replace(/yyyy/g, date.getFullYear());
  format = format.replace(/MM/g, ('0' + (date.getMonth() + 1)).slice(-2));
  format = format.replace(/dd/g, ('0' + date.getDate()).slice(-2));
  format = format.replace(/HH/g, ('0' + date.getHours()).slice(-2));
  format = format.replace(/mm/g, ('0' + date.getMinutes()).slice(-2));
  format = format.replace(/ss/g, ('0' + date.getSeconds()).slice(-2));
  format = format.replace(/SSS/g, ('00' + date.getMilliseconds()).slice(-3));
  return format;
};

/********** Receive Auth-Message *********/
socket.on("Auth-RS", (msg) => {
  Status = msg["Status"];
  switch (Status) {
    case "Entry-Name":
      let name = prompt("Set Your User Name", msg["Name"]) || msg["Name"];
      socket.emit("Auth-RQ", { Status: Status, Name: name });
      break;
    case "Entry-Room":
      let inputpass = prompt(msg["Comment"]);
      while(inputpass === "") {
        inputpass = prompt(msg["Comment"]);
      }
      Status = "Entry-Room";
      if(inputpass){
        socket.emit("Auth-RQ", { Status: Status, Room: room_next, Pass: inputpass });
      } else{
        socket.emit("Auth-RQ", { Status: Status, Room: MyRoom});
      }
      break;
    case "Join":
      MyName = msg["Name"];
      MyRoom = msg["Room"];
      document.getElementById("MyName").innerText = MyName;
      document.getElementById("MyRoom").innerText = MyRoom;
      document.getElementById("RoomPass").innerText = msg["RPass"];
      socket.emit("Auth-RQ", { Status: Status });
      break;
    case "Kick":
      document.cookie = "UUID=;max-age=0;path=/*";
      socket.disconnect();
      document.querySelector('body').innerHTML = `Disconnected from the Server!`;
      console.log("get Kick");
      break;
    case "Error":
      document.querySelector('body').innerHTML = msg["Msg"];
      break;
    case "Reload":
      document.querySelector('body').innerHTML = `Sorry, we are temporarily disconnecting to reload the server.<br>m(__)m`;
      break;
  }
});

/********** Receive Room-Message *********/
socket.on("Rooms", (msg) => {
  rlengths = msg; //JSON.parse(JSON.stringify(msg));
  let ss = `<tr>
            <th class="_sticky">Button</th>
            <th>Rooms(member)</th>
            </tr>`;
  for(const rn in rlengths) {
    let num = rlengths[rn];
    ss += `<tr>
            <td class="_sticky"><button id=${rn} class="rbtn" type="button" style="font-size:85%">${(rn === MyRoom) ? "Leave" : "Join"}</button></td>
            <td>${rn} (${rlengths[rn]})</td>
           </tr>`
  }
  ss += `<tr><td colspan="2"><button id="NewRoomBtn" type="button" style="font-size:85%">Create & Join a New Room</button></td></tr>`;
  document.getElementById("RoomList").innerHTML = ss;
  // add room button
  const rbtns = document.querySelectorAll('.rbtn')
  rbtns.forEach(rbtn => {
    rbtn.addEventListener('click', (e) => {
      e.preventDefault();
      room_next = event.target.id;
      if(room_next === MyRoom)
        room_next = "None";
      Status = "Entry-Room";
      socket.emit("Auth-RQ", {"Status": Status, "Room": room_next});
      dispRoomDetails(false);
    });
  });
  // create new room button
  document.getElementById("NewRoomBtn").addEventListener('click', (e) => {
    e.preventDefault();
    room_next = prompt("Set a New Room Name");
    while(true){
      if(room_next in rlengths){
        room_next = prompt(`The name has already been used. Enter another name.`);
      } else if(room_next === "") {
        room_next = prompt("Set a New Room Name");
      } else {
        break;
      }
    }
    if(room_next){
      Status = "Entry-Room";
      socket.emit("Auth-RQ", {"Status": Status, "Room": room_next});
      dispRoomDetails(false);
    }
  });
});

/********** Rename Button *********/
document.getElementById("MyNameBtn").addEventListener("click", (e) => {
  MyName = prompt("User Name", MyName) || MyName;
  document.getElementById("MyName").innerText = MyName;
  socket.emit("Admin-RQ", { Mode: "Rename", Name: MyName });
});

/********** Room Button *********/
let openRoomTab = false;
dispRoomDetails(false);
document.getElementById("MyRoomBtn").addEventListener("click", (e) => {
  openRoomTab = !openRoomTab;
  dispRoomDetails(openRoomTab);
});

/********** LogOut Button *********/
document.getElementById("LogoutBtn").addEventListener("click", (e) => {
  e.preventDefault();
  socket.emit("Admin-RQ", {"Mode": "delUser", "sID": socket.id});
})

/*****************************/



/********** Admin Page *********/
//get users
socket.on("Users", (msg) => {
  let users = structuredClone(msg);
  let ss = `<caption class="_sticky">Users List</caption>
            <tr>
              <th class="_sticky">Button</th>
              <th>Name</th>
              <th>User</th>
              <th>Room</th>
              <th>Status</th>
              <th>TimeStamp</th>
              <th>UUID</th>
              <th>SocketID</th>
            </tr>`;
  for(const AsID in users) {
    let auser = users[AsID];
    ss += `<tr>
            <td class="_sticky"><button id=${AsID} class="delbtn" type="button">Delete</button></td>
            <td>${auser["Name"]}</td>
            <td>${auser["User"]}</td>
            <td>${auser["Room"]}</td>
            <td>${auser["Status"]}</td>
            <td>${auser["Time"]}</td>
            <td><code>${auser["UUID"]}</code></td>
            <td><code>${AsID}</code></td>
          </tr>`
  }
  document.getElementById("userslist").innerHTML = ss;
  document.querySelectorAll('.delbtn').forEach(dbtn => {
    dbtn.addEventListener('click', (e) => {
      e.preventDefault();
      socket.emit("Admin-RQ", {"Mode": "delUser", "sID": event.target.id});
    });
  });
});

/********** Polling Button *********/
let startpolling = (getCookie("Polling") === "true");
let pollingtimeoutId = null;
dispPollingStatus();
let pollingCount = 0;
if(startpolling) longPolling();

function dispPollingStatus(){
  let onId = document.getElementById(startpolling?"PollingOn":"PollingOff").classList;
  let offId = document.getElementById(startpolling?"PollingOff":"PollingOn").classList;
  if(onId.contains("BtnOff"))
    onId.replace("BtnOff", "BtnOn");
  else
    onId.add("BtnOn");
  if(offId.contains("BtnOn"))
    offId.replace("BtnOn", "BtnOff");
  else
    offId.add("BtnOff");
  document.cookie = "Polling=" + (startpolling?"true":"false") + ";max-age=86400;path=/";
}
function longPolling(){
  if(pollingtimeoutId !== null) return;
  fetch(getURL()).then((response) => {
    if(response.status === 200 || response.status === 202){
      document.getElementById("PollingLog").innerHTML = `Last Response: ${formatDate(new Date(),"yyyy/MM/dd, HH:mm:ss")}`;
      pollingCount++;
      if(pollingCount > 5){  // refresh window every 5 polling (25min)
        pollingCount = 0;
        location.reload();
      }
      if(startpolling)
        pollingtimeoutId = setTimeout(() => {
          pollingtimeoutId = null;
          longPolling();
        }, 5*60000);          // polling 5 min
    }else
      errResponse();
    return response.json();
  }).then(jsondata => {
    if(jsondata["Data"]) document.getElementById("SartServerLog").innerHTML = `Server Refreshed: ${jsondata["Data"]}`;
  }).catch(err => { errResponse(); console.error(`Polling Error: ${err}`); });
  function errResponse(){
    document.getElementById("PollingLog").innerHTML = `<mark style="color:#ff0000">Polling Error: ${formatDate(new Date(),"yyyy/MM/dd, HH:mm:ss")}</mark>`;
    startpolling = false;
    pollingtimeoutId = null;
    dispPollingStatus();
  }
  function getURL(){
    if(pollingCount === 0)
      return `${location.href}../polling/FirstTime`;
    return `${location.href}../polling/normal`;
  }
}
document.getElementById("PollingBtn").addEventListener("click", e => {
  startpolling = !startpolling;
  if(startpolling){
    longPolling();
  }else if(pollingtimeoutId){
    clearTimeout(pollingtimeoutId);
    pollingtimeoutId = null;
  }
  dispPollingStatus();
});
/*****************************/
