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
// add script tag
function addScriptFile(script_path){
  let nextscript = document.createElement('script');
    nextscript.src = script_path;
    document.getElementsByTagName('body')[0].appendChild(nextscript);
}
// show/hide roomcontent
let Room_old = "None";
function dispRoomContent(){
  if(MyRoom !== Room_old) {
    if(Room_old === "None") {
      document.querySelector('roomcontent').style.display = "grid";
      addScriptFile(`${location.origin}/chat/script.js`);
    } else {
      location.reload();
    }
  }
  Room_old = MyRoom;
}

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
      dispRoomContent();
      break;
    case "Kick":
      document.cookie = "UUID=;max-age=0;path=/*";
      socket.disconnect();
      document.querySelector('body').innerHTML = `Disconnected from the Server!`;
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
