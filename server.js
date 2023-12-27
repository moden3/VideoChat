/********** Modules *********/
const express = require("express");
const app = express();
const server = require("http").createServer(app);
const io = require("socket.io")(server);
const fs = require('fs');

/********** Variables *********/
let users = {}; // user data {userId1: {data: data, ...}, userId2: {data: data, ...}, ...}
let rooms = {}; // room data {roomName1: RoomObject1, roomName2: RoomObject2, ...}

let peerdata = [];
let shareUser = {};

/********** Basic Auth *********/
const authApp = express.Router();
app.use("/admin", authApp);
const basicAuth = require("basic-auth");
authApp.use(function (req, res, next) {
  const credentials = basicAuth(req);
  if ( !credentials || credentials.name !== "admin" || credentials.pass !== "mypass" ) {
    res
      .header("WWW-Authenticate", 'Basic realm="example"')
      .status(401)
      .end("Access denied");
  } else {
    next();
  }
});
authApp.use(express.static("./admin", {maxAge: 0}));
authApp.get("/", function (req, res) {
  res.sendFile(__dirname + "/admin/admin.html", {maxAge: 0});
});

/********** Socket *********/
io.on("connection", (socket) => {
  /********** Disconnect *********/
  socket.on("disconnect", () => {
    if(socket.id in users){
      users[socket.id]["Status"] = "Disconnect";
      let userroom = users[socket.id]["Room"];
      if(userroom !== "None"){
        // clear share screen
        if(shareUser[userroom] === socket.id){
          shareUser[userroom] = null;
          io.to(userroom).emit("ShareScr", {"User": null});
        }
        // update roomdata
        rooms[userroom].update();
        io.to(userroom).emit("RData", {RUsers: rooms[userroom].rusers});
      }
    }
    // delete peer user not in users list
    for(let i=peerdata.length-1; i>=0; i--){
      let inuserslist = (peerdata[i][0] in users) && (peerdata[i][1] in users);
      if(!inuserslist){
        peerdata.splice(i, 1);
      }
    }
    io.emit("Users", users);
  });
  
  /********** Auth *********/
  socket.on("Auth-RQ", (msg) => {
    let send_comment = "";
    let user = (msg["Status"] === "Entry-Wait") ? null : users[socket.id];
    switch(msg["Status"]){
      case "Entry-Wait":
        // check if the same UUID exists
        let old_sID = UUID2sID(msg["UUID"]);
        if(old_sID){
          // Errors opened in multiple windows under the same account
          if(users[old_sID]["Status"] !== "Disconnect"){
            io.to(socket.id).emit("Auth-RS", {"Status": "Error", "Msg": "You cannot open this page in multiple tabs under the same account.<br>Use a different browser."});
            return;
          }
          // swap socket ID
          users[socket.id] = users[old_sID];
          delete users[old_sID];
        }
        // set user
        if(socket.id in users){
          user = users[socket.id];
          user["Status"] = "Join";
          user["Time"] = msg["Time"];
          if(user["Room"] !== "None"){
            if(rooms[user["Room"]])  // check if room object exists
              socket.join(user["Room"]);
            else
              user["Room"] = "None";
          }
          if(user["User"] !== "Admin")
            user["User"] = msg["User"];
        }else {
          users[socket.id] = {"Name": `User${Math.floor(Math.random()*101)}`,
                              "Status": "Entry-Name",
                              "User": msg["User"],
                              "Room": "None",
                              "Time": msg["Time"],
                              "UUID": msg["UUID"]};
          user = users[socket.id];
        }
        break;
      case "Entry-Name":
        user["Name"] = msg["Name"];
        user["Status"] = "Join";
        io.emit("Rooms", getRlengths());
        break;
      case "Entry-Room":
        let Mroom = msg["Room"];
        let Mpass = msg["Pass"];
        let Oldroom = user["Room"];
        if(Mroom === Oldroom){         // same room
          user["Status"] = "Join";
          io.emit("Rooms", getRlengths());
          break;
        } else if(Mroom === "None"){        // leave room
          ;
        } else if(Mroom in rooms){          // addding to an existing room
          if(user["User"] !== "Admin" && Mpass !== rooms[Mroom].rpass){
            user["Status"] = "Entry-Room";
            send_comment = Mpass ? "Enter the Password Again" : "Enter the Password";
            break;
          }
        } else {                            // create a new room
          if(Mpass){
            rooms[Mroom] = new Room(Mroom, Mpass);
          }else{
            user["Status"] = "Entry-Room";
            send_comment = "Set a New Password";
            break;
          }
        }
        // left & join the room
        user["Status"] = "Join";
        user["Room"] = Mroom;
        if(Oldroom && Oldroom !== "None"){
          socket.leave(Oldroom);
          rooms[Oldroom].update();
          io.to(Oldroom).emit("RData", {RUsers: rooms[Oldroom].rusers});
        }
        if(Mroom && Mroom !== "None"){
          socket.join(Mroom);
          rooms[Mroom].update();
          io.to(Mroom).emit("RData", {RUsers: rooms[Mroom].rusers});
        }
        io.emit("Rooms", getRlengths());
        // save logdata
        if(Mroom !== Oldroom)
          saveLogFile();
        break;
      case "Join":
        io.emit("Rooms", getRlengths());
        if(user["Room"] !== "None"){
          rooms[user["Room"]].update();
          io.to(user["Room"]).emit("RData", {RUsers: rooms[user["Room"]].rusers});
        }
        break;
    }
    if(msg["Status"] != "Join"){
      io.to(socket.id).emit("Auth-RS", {"Status": user["Status"], "Name": user["Name"], "Room": user["Room"], "RPass": (user["Room"]==="None"?"none":rooms[user["Room"]].rpass), "Comment": send_comment});
    }
    io.emit("Users", users);
  });
  
  /********** Admin *********/
  socket.on("Admin-RQ", (msg) => {
    switch(msg["Mode"]){
      case "Rename":
        let user = users[socket.id];
        if(user){
          user["Name"] = msg["Name"];
          io.emit("Users", users);
          if(user["Room"] !== "None"){
            rooms[user["Room"]].update();
            io.to(user["Room"]).emit("RData", {RUsers: rooms[user["Room"]].rusers});
          }
        }
        break;
      case "delUser":
        if(msg["sID"] in users){
          let Oldroom = users[msg["sID"]]["Room"];
          io.to(msg["sID"]).emit("Auth-RS", {"Status": "Kick"});
          delete users[msg["sID"]];
          if(Oldroom !== "None"){
            // disable share screen if user owns
            if(shareUser[Oldroom] === msg["sID"]){
              shareUser[Oldroom] = null;
              io.to(Oldroom).emit("ShareScr", {"User": shareUser[Oldroom]});
            }
            // update room info
            rooms[Oldroom].update();
            io.to(Oldroom).emit("RData", {RUsers: rooms[Oldroom].rusers});
            io.emit("Rooms", getRlengths());
            saveLogFile();
          }
          io.emit("Users", users);
        }
        break;
    }
  });
  
  /********** Chat *********/
  socket.on("Chat-RQ", (msg) => {
    let uname = users[socket.id]["Name"];
    let uroomname = users[socket.id]["Room"];
    let uroomdata = rooms[uroomname];
    switch(msg["Mode"]){
      case "Send":
        let chattime = formatDate(getJPNdate(),"yyyy/MM/dd<br>HH:mm:ss");
        io.to(uroomname).emit("Chat-RS", [uroomdata.chatlog.length, uname, chattime, msg["Msg"]]);
        uroomdata.setchatlog(uname, chattime, msg["Msg"]);
        break;
      case "FetchLog":
        io.to(socket.id).emit("ChatLog-RS", uroomdata.getchatlog(msg["LastIdx"], msg["Num"]));
        break;
    }
  });
  
  /********** Peer Connection *********/
  socket.on("PeerReady", (msg) => {
    // check peer is ready
    let toidx = peerdata.findIndex(elm => {
      return (elm[1] === socket.id && elm[0] === msg["To"]);
    });
    // send signal or store buffer
    if(toidx >= 0){  // send ready to both user
      io.to(socket.id).emit("PeerReady", {"From": msg["To"]});
      io.to(msg["To"]).emit("PeerReady", {"From": socket.id});
    }else{  // store ready flag
      // get previous signal
      let myidx = peerdata.findIndex(elm => {
        return (elm[0] === socket.id && elm[1] === msg["To"]);
      });
      if(myidx < 0){
        peerdata.push([socket.id, msg["To"]]);
      }
    }
  });
  socket.on("PeerSignal", (msg) => {
      io.to(msg["To"]).emit("PeerSignal", {"From": socket.id, "Signal": msg["Signal"]});
  });
  
  /********** ShareScreen *********/
  socket.on("ShareScr", msg => {
    if(!users[socket.id]) return;
    let rname = users[socket.id]["Room"];
    switch(msg["Mode"]){
      case "OnRQ":
      case "OffRQ":
        if(msg["Mode"] === "OnRQ")
          shareUser[rname] = socket.id;
        else
          shareUser[rname] = null;
        io.to(rname).emit("ShareScr", {"User": shareUser[rname]});
        break;
      case "Fetch":
        io.to(socket.id).emit("ShareScr", {"User": shareUser[rname]});
        break;
    }
  });
  
  /********** Other Callbacks *********/
  
  /************************************/
});

/********** HTTP request *********/
app.use(express.static("public", {maxAge: 0}));
// Earth
app.get("/earth", function (req, res) {
  res.sendFile(__dirname + "/public/earth/earth.html", {maxAge: 0});
});

// Chat
app.get("/chat", function (req, res) {
  res.sendFile(__dirname + "/public/chat/chat.html", {maxAge: 0});
});

// Gas wake-up
app.get('/gas', (req, res) => {
  res.sendStatus(200);
});

// polling
let startTimeStamp = formatDate(getJPNdate(),"yyyy/MM/dd, HH:mm:ss");
app.get('/polling/:name', (req, res) => {
  if(req.params.name === "FirstTime")
    res.status(202).send({"Data": startTimeStamp});
  else
    res.status(200).send({});
});


/********** Room class *********/
class Room{
  constructor(rname_, rpass_){
    this.rname = rname_;
    this.rpass = rpass_;
    this.rusers = {};
    this.rlength = 0;
    this.chatlog = [];
  }
  toJSON(){
    return {"RoomName": this.rname,
            "RoomPass": this.rpass,
            "ChatLog": (this.chatlog.length === 0) ? [] : this.chatlog.slice(Math.max(this.chatlog.length-10, 0), this.chatlog.length)
           };
  }
  update() {
    let userids = Object.keys(users).filter((asID) => {
      if(users[asID]["Room"] === this.rname)
        return true;
      return false;
    });
    this.rusers = {};
    userids.forEach(uid => { this.rusers[uid] = users[uid] });
    this.rlength = userids.length;
  }
  setchatlog(uname, time, msg){
    this.chatlog.push([this.chatlog.length, uname, time, msg]);
  }
  getchatlog(lastIdx, num){
    if(this.chatlog.length === 0) return null;
    if(lastIdx < 0)
      lastIdx = this.chatlog.length-1;
    else if(lastIdx > this.chatlog.length-1)
      lastIdx = this.chatlog.length-1;
    return this.chatlog.slice(Math.max(lastIdx+1-num, 0), lastIdx+1);
  }
}

// get number of users in each room
function getRlengths(){
  let rlengths = {};
  let dellist = [];
  Object.keys(rooms).forEach(rname => {
    if(rooms[rname].rlength === 0)
      dellist.push(rname);
    else
      rlengths[rname] = rooms[rname].rlength;
  });
  dellist.forEach(dr => {
    delete rooms[dr];
  });
  return rlengths;
}

/********** Other Functions or classes *********/

/***********************************************/


/********** Utility Functions *********/
// get socket id from UUID
function UUID2sID(UUID_){
  return Object.keys(users).find((asID) => {
    if(users[asID]["UUID"] === UUID_)
      return true;
    return false;
  })
}

// get Japan timestamp
function getJPNdate(){
  return new Date(Date.now() + ((new Date().getTimezoneOffset() + (9 * 60)) * 60 * 1000));
}

// format date text
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


/********** Start Process *********/
loadLogFile(); // load log.txt

// server listen
const listenport = process.env.PORT || 3000;
const listener = server.listen(listenport, function (err) {
  if (err) {
    console.error("Connection Error");
  } else {
    console.log(`Start Server (Port=${listener.address().port})`);
  }
});

/********** End Prcess *********/
// exit
process.on('exit', () => {
  console.log("Sever Reloading");
  saveLogFile();
});
process.on('SIGINT', () => {process.exit();});
process.on('SIGHUP', () => {process.exit();});
process.on('SIGTERM', () => {process.exit();});
process.on('SIGQUIT', () => {process.exit();});
process.on('SIGTSTP', () => {process.exit();});
process.on('SIGPWR', () => {process.exit();});
process.on('SIGCONT', () => {process.exit();});


// write log file
function saveLogFile(){
  try{
    let data = JSON.stringify({"users": users, "rooms": rooms}, null, 4);
    fs.writeFileSync("./log.txt", data, 'utf-8');
  } catch (err) {
    console.error(`Cannot Write LogFile: ${err}`);
  }
}

// read log file
function loadLogFile(){
  try{
    let data = JSON.parse(fs.readFileSync("./log.txt", 'utf-8'));
    // load users
    if(data["users"]){
      users = data["users"];
      Object.keys(users).forEach(asID => {
        users[asID]["Status"] = "Disconnect";
      });
    }
    // load rooms
    if(data["rooms"]){
    let roomlogs = data["rooms"];
      Object.keys(roomlogs).forEach(rname => {
        rooms[rname] = new Room(rname, roomlogs[rname]["RoomPass"]);
        rooms[rname].update();
        rooms[rname].chatlog = roomlogs[rname]["ChatLog"];
        rooms[rname].chatlog.forEach((msg, idx) => {
          rooms[rname].chatlog[idx][0] = idx;  // reset log index
        })
      });
    }
  } catch (err) {
    console.warn(`Cannot Read LogFile: ${err}`);
  }
}
