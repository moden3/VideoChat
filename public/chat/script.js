//"use strict";
/********** Global variables *********/
// members
let rmembers = {};
let peercalls = {};
let peerready = {};
// microphone
let MicOn = false;
let hlimic = document.createElement('hli');
hlimic.innerHTML = `<div id="MicBtn"></div><select id="micselect" name="micdevices"></select>`;
document.querySelector('header_list').prepend(hlimic);
const MicBtn = document.getElementById("MicBtn");
// camera
let CameraOn = false;
let hlicam = document.createElement('hli');
hlicam.innerHTML = `<div id="CamBtn"></div><select id="camselect" name="camdevices" style="width:100%"></select>`;
document.querySelector('header_list').prepend(hlicam);
const CameraBtn = document.getElementById("CamBtn");
// screen
let ScreenOn = false;
let dispShareScr = false;
let hliscr = document.createElement('hli');
hliscr.innerHTML = `<div id="ScrBtn"></div>`;
document.querySelector('header_list').prepend(hliscr);
const ScreenBtn = document.getElementById("ScrBtn");
// video
const videoGrid = document.getElementById("video-grid");
// dummy stream
let dummyAudio = false;
let dummyVideo = true;
// deviceid
let micdevid = null;
let camdevid = null;
// chat
const chatfield = document.getElementById("chatfield");
let chatidxnew = -1;
let chatidxold = -1;
const chatlogbtn = document.getElementById("chatlogbtn");

// mystream
const mystream = getDummyStream();

/********** Video Initialize  *********/
initialize();
async function initialize(){
  // Request permission to access camera and microphone devices
  await navigator.mediaDevices.getUserMedia({video: true, audio: true}).then((stream) =>{
    stream.getTracks(track => {  // discard tracks
      track.stop();
      stream.removeTrack(track);
    })
  }).catch (err => {
    console.error(`Stream Initialize Error: ${err}`)
    alert("Cannot initialize camera & microphone devices")
  });
  // chat
  setChatCallback();
  socket.emit("Chat-RQ", {"Mode": "FetchLog", "LastIdx": -1, "Num": 10});
  // set my stream
  addVideoStream(mystream, socket.id);
  window.onresize = resizeVideowindow;
  // peersignal
  setPeerSignalCallback();
  // room data
  setRoomCallback();
  socket.emit("Auth-RQ", { Status: Status });
  // share screen
  setShareScrCallback();
  // button initialize
  setButtonCallback();
  await BtnControl();
  // device select option
  await deviceConnection();
  setSelectDevCallback();
}

/********** Callback Func *********/
// Room Data callback
function setRoomCallback(){
  socket.on("RData", (msg) => {
    rmembers = msg["RUsers"];
    // call peers
    callPeers();
    // each videos setting
    Object.keys(peercalls).forEach(userId => {
      if(userId in rmembers){
        if(rmembers[userId]["Status"] !== "Disconnect"){
          // rename users
          let uname = document.getElementById(`${userId}-name`);
          if(uname) uname.innerText = rmembers[userId]["Name"];
          return;
        }
      }
      // remove users
      removeVideoStream(userId);
    });
    // reset MyName
    document.getElementById(`${socket.id}-name`).innerText = MyName;
  });
}

// Share Screen callback
function setShareScrCallback(){  
  socket.on("ShareScr", async (msg) => {
    if(socket.id === msg["User"]){  // share my screen
      if(!ScreenOn){
        CameraOn = false;
        ScreenOn = true;
        dispShareScr = true;
        // switch camera => screen
        let constraints = {
          video: {
            cursor: "always",
            frameRate: 15,
          },
          audio: false,
        }
        // get stream to share screen
        let stream = await navigator.mediaDevices.getDisplayMedia(constraints).catch(err => {
          console.warn(`Share Screen Error: ${err}`);
          alert("Cannot Share screen");
          socket.emit("ShareScr", {"Mode": "OffRQ"});
        });
        if(stream){
          if(applyVstream(stream)){
            mystream.getVideoTracks().forEach(vtrack => {
              vtrack.enabled = true;
            });
          }else{  // failed to get sharescreen stream
            socket.emit("ShareScr", {"Mode": "OffRQ"});
          }
        }
      }
      expandScreen(socket.id);
    }else{  // end sharing or disp others screen
      if(ScreenOn){  // end sharing
        dispShareScr = false;
        ScreenOn = false;
        await deviceConnection(true, false);
      }
      if(msg["User"]){ // share others screen
        CameraOn = false;
        switchOnOff();
        dispShareScr = true;
        expandScreen(msg["User"]);
      }else{
        dispShareScr = false;
        shrinkScreen();
      }
    }
    dispBtn();
  });
}

// Buttons callback
function setButtonCallback(){ 
  // microphone
  MicBtn.addEventListener("click", (e) => {
    MicOn = !MicOn;
    BtnControl();
  });
  // camera
  CameraBtn.addEventListener("click", (e) => {
    if(dispShareScr) return; // diable when sharing screen
    CameraOn = !CameraOn;
    BtnControl();
  });
  // screen
  ScreenBtn.addEventListener("click", (e) => {
    socket.emit("ShareScr", {"Mode": (ScreenOn ? "OffRQ" : "OnRQ")});
  });
}

// Chat callback
function setChatCallback(){
  // get new chat
  socket.on("Chat-RS", (msg) => {
    // block until getting log
    if(chatidxold < 0) return;
    // update logidx
    if(msg[0] <= chatidxnew) return;
    chatidxnew = msg[0];
    // add new chat section
    let csection = document.createElement("chatsection");
    csection.innerHTML = `<chatname>${msg[1]}</chatname>
                          <chattime>${msg[2]}</chattime>`
    let cmsg = document.createElement("chatmsg");
    cmsg.innerText = `${msg[3]}`;
    csection.appendChild(cmsg);
    chatfield.prepend(csection);
  });
  // get chat log
  socket.on("ChatLog-RS", (msg) => {
    // update logidx
    if(!msg){
      chatidxold = 1;
      chatidxnew = -1;
      return;
    }
    // update logidx
    chatidxold = msg[0][0];
    if(chatidxnew < 0) chatidxnew = msg[msg.length-1][0];
    // add old chat sections
    msg.reverse().forEach(elm => {
      let csection = document.createElement("chatsection");
      csection.innerHTML = `<chatname>${elm[1]}</chatname>
                            <chattime>${elm[2]}</chattime>`
      let cmsg = document.createElement("chatmsg");
      cmsg.innerText = `${elm[3]}`;
      csection.appendChild(cmsg);
      chatfield.appendChild(csection);
    });
    // add logbutton
    if(chatidxold > 0){
      chatfield.appendChild(chatlogbtn);
      chatlogbtn.style.display = "block";
    }
  });
  // send chat button
  document.getElementById("subbtn").addEventListener("click", (e) => {
    e.preventDefault();
    let sendtxt = document.getElementById("msgtxt");
    if (sendtxt.value) {
      socket.emit("Chat-RQ", {"Mode": "Send", "Msg": sendtxt.value});
      sendtxt.value = "";
    }
  });
  // request chat log
  chatlogbtn.addEventListener("click", e => {
    e.preventDefault();
    chatlogbtn.style.display = "none";
    socket.emit("Chat-RQ", {"Mode": "FetchLog", "LastIdx": chatidxold-1, "Num": 10});
  })
}

// Device Select callback
function setSelectDevCallback(){
  // change device
  navigator.mediaDevices.ondevicechange = (event) => {deviceConnection();};
  // user select device
  document.getElementById("camselect").addEventListener('change', async event => {
    if(camdevid === event.currentTarget.value) return;
    camdevid = event.currentTarget.value;
    await changeMediaDevice(true, false);
    await setMediaConstraints();
    switchOnOff();
    dispBtn();
  });
  document.getElementById("micselect").addEventListener('change', async event => {
    if(micdevid === event.currentTarget.value) return;
    micdevid = event.currentTarget.value;
    await changeMediaDevice(false, true);
    await setMediaConstraints();
    switchOnOff();
    dispBtn();
  });
}

/********** Set Screen Size *********/

function expandScreen(userId){
  let vtags = document.getElementsByTagName("videosection");
  for(let i=0; i<vtags.length; i++)
    vtags[i].style.display = "none";
  let Vsect = document.getElementById(`${userId}-section`);
  if(!Vsect) return;
  videoGrid.style["grid-template-columns"] = null;
  Vsect.style.display = "block";
  let Vstyle = document.getElementById(`${userId}-video`).style;
  Vstyle.width = "100%";
  Vstyle.heght = "100%";
  Vstyle["aspect-ratio"] = null;
  Vstyle["object-fit"] = "contain";
};
function shrinkScreen(){
  let vtags = document.getElementsByTagName("videosection");
  for(let i=0; i<vtags.length; i++){
    vtags[i].style.display = "block";
  }
  resizeVideowindow();
}

/********** Video Initialize  *********/

function setPeerSignalCallback(){
  socket.on("PeerReady", (msg) => {
    peerready[msg["From"]] = "Connect";
    callPeers();
  });
  socket.on("PeerSignal", msg => {
    if(msg["From"] in peercalls){
      peercalls[msg["From"]].signal(msg["Signal"]);
    }else
      console.warn("PeerSignal Error: get signal from unknown Peer");
  });
}

/********** Dummy Stream  *********/
function getDummyVideoStream(){
  dummyVideo = true;
  CameraOn = false;
  const dcanvas = document.createElement('canvas');
  dcanvas.width = 1;
  dcanvas.height = 1;
  dcanvas.getContext('2d').fillRect(0, 0, 1, 1);
  return dcanvas.captureStream();
}

function getDummyAudioStream(){
  dummyAudio = true;
  MicOn = false;
  return new AudioContext().createMediaStreamDestination().stream;
}

function getDummyStream(){
  let dstream = getDummyVideoStream();
  let tmpstream = getDummyAudioStream();
  tmpstream.getAudioTracks().forEach(track => {
    dstream.addTrack(track);
    track.stop();
  });
  tmpstream.getTracks().forEach(track => tmpstream.removeTrack(track));
  return dstream;
}

/********** Peer Calls *********/
function callPeers(){
  Object.keys(rmembers).forEach(userId => {
    if(userId in peercalls) return;
    if(rmembers[userId]["Status"] === "Disconnect") return;
    if(userId === socket.id) return;
    let initiatorflag = (userId < socket.id);
    if(!peerready[userId]){
      peerready[userId] = "Ready";
      socket.emit("PeerReady", {"To": userId});
    }
    if(initiatorflag && peerready[userId] !== "Connect") return;
    let peer = new SimplePeer({
      initiator: initiatorflag,
      stream: mystream
      //trickle: false
    });
    peercalls[userId] = peer;
    peer.on("signal", data => {
      socket.emit("PeerSignal", {"To": userId, "Signal": JSON.stringify(data)});
    });
    peer.on("stream", stream => {
      addVideoStream(stream, userId);
    });
    //peer.on("close", () => console.log("Closed"));
    peer.on("error", err => {
      console.error(`peer error ${err}`);
    });
  });
}

/********** Video Setting  *********/
async function BtnControl(){
  await setMediaConstraints();
  switchOnOff();
  dispBtn();
}

function dispBtn(){
  CameraBtn.innerHTML = `Camera <b>${CameraOn ? "ON " : "OFF"}</b>`;
  MicBtn.innerHTML = `Mic. <b>${MicOn ? "ON " : "OFF"}</b>`;
  ScreenBtn.innerHTML = `ShareSc.<br><b>${ScreenOn ? "ON": "OFF"}</b>`;
}

function switchOnOff(){
  if(!dispShareScr){ // disable when sharing screen
    mystream.getVideoTracks().forEach(vtrack => {
      vtrack.enabled = CameraOn;
    });
  }
  mystream.getAudioTracks().forEach(atrack => {
    atrack.enabled = MicOn;
  });
}

async function setMediaConstraints(){
  if(!(CameraOn || MicOn)) return;
  if(dispShareScr) return; // disable when sharing screen
  let vnum = document.getElementsByTagName("video").length;
  if(vnum === 0) return;
  let idealwidth = Math.round(720 / Math.ceil(Math.sqrt(vnum)));
  let vconstraints = {
    width: `${idealwidth}`,
    aspectRatio: 1.7777778,
    frameRate: 15,
    /*width: {min: 320, ideal: 1280, max: 1920}*/
  };
  mystream.getVideoTracks().forEach(async vtrack => {
    await vtrack.applyConstraints(vconstraints);
  });
  //console.log(navigator.mediaDevices.getSupportedConstraints());
}

/********** set Devices  *********/
// change device function
async function deviceConnection(reconnectV = false, reconnectA = false){
  let dlists = await getDeviceLists();
  let vselect = dlists[0] , aselect = dlists[1];
  let vchange = (!dlists[2]) || reconnectV;
  let achange = (!dlists[3]) || reconnectA;
  await changeMediaDevice(vchange, achange);
  await setMediaConstraints();
  switchOnOff();
  dispBtn();
}
// set select lists
async function getDeviceLists(){
  let devices = await navigator.mediaDevices.enumerateDevices().catch(err => console.error('enumerateDevide ERROR:', err));
  let vselect = document.getElementById("camselect");
  let aselect = document.getElementById("micselect");
  vselect.innerHTML = "";
  aselect.innerHTML = "";
  let vidx = 0, aidx = 0;
  let vfind = false, afind = false;
  // create select options
  devices.forEach(elm => {
    let opt = document.createElement("option");
    opt.value = elm.deviceId;
    if(elm.kind === "videoinput"){
      opt.innerText = elm.label || `Camera${vidx}`;
      vselect.appendChild(opt);
      if(elm.deviceId === camdevid){
        vselect.options[vidx].selected = true;
        vfind = true;
      }
      vidx++;
    }else if(elm.kind === "audioinput"){
      opt.innerText = elm.label || `Microphone${aidx}`;
      aselect.appendChild(opt);
      if(elm.deviceId === micdevid){
        aselect.options[aidx].selected = true;
        afind = true;
      }
      aidx++;
    }
  });
  // if current device disconnected
  if(!vfind){
    // if no device found
    if(vselect.options.length === 0){
      let opt = document.createElement("option");
      opt.value = null;
      opt.innerText = "No Device";
      vselect.appendChild(opt);
    }
    // change device and camera off
    vselect.options[0].selected = true;
    CameraOn = false;
  }
  if(!afind){
    // if no device found
    if(aselect.options.length === 0){
      let opt = document.createElement("option");
      opt.value = null;
      opt.innerText = "No Device";
      aselect.appendChild(opt);
    }
    // change device and camera off
    aselect.options[0].selected = true;
    MicOn = false;
  }
  camdevid = vselect.value;
  micdevid = aselect.value;
  // return [video device list, audio device list, find same camera id, find same mic id]
  return [vselect, aselect, vfind, afind];
}
// reflect device change to stream tracks
async function changeMediaDevice(vchange, achange){
  if(dispShareScr) // disable when sharing screen
    vchange = false;
  // main process
  let getMediaFlag = false;
  if(vchange){
    if(camdevid){  // change to another device
      getMediaFlag = true;
    }else if(!dummyVideo){ // use dummyvideo
      applyVstream(getDummyVideoStream());
    }
  }
  if(achange){
    if(micdevid){  // change to another device
      getMediaFlag = true;
    }else if(!dummyAudio){ // use dummyvideo
      applyAstream(getDummyAudioStream());
    }
  }
  if(getMediaFlag){
    let constraints = {};
    constraints["video"] = (vchange && camdevid) ? {deviceId: camdevid} : "false";
    constraints["audio"] = (achange && micdevid) ? {deviceId: micdevid} : "false";
    // stop tracks
    if(vchange) mystream.getVideoTracks().forEach(track => track.stop());
    if(achange) mystream.getAudioTracks().forEach(track => track.stop());
    // get new tracks
    let devstream = await navigator.mediaDevices.getUserMedia(constraints).catch(err => {
      console.error(`Stream Error: ${err}`);
      alert(`Cannot get device. Please reload this page.`);
      if(vchange) applyVstream(getDummyVideoStream());
      if(achange) applyAstream(getDummyAudioStream());
    });
    if(vchange){
      dummyVideo = false;
      applyVstream(devstream);
    }
    if(achange){
      dummyAudio = false;
      applyAstream(devstream);
    }
  }
}

// handle tracks
function replaceTracks(mytracks, newtracks){
  mytracks.forEach(track => track.stop());
  newtracks.forEach(track => track.enabled = false);
  Object.keys(peercalls).forEach(userId => peercalls[userId].replaceTrack(mytracks[0], newtracks[0], mystream));
  mytracks.forEach(track => mystream.removeTrack(track));
  newtracks.forEach(track => mystream.addTrack(track));
}
function applyVstream(stream){
  let mytracks = mystream.getVideoTracks();
  let newtracks = stream.getVideoTracks();
  let notrack = (newtracks.length === 0);
  if(notrack){
    stream = getDummyVideoStream();
    newtracks = stream.getVideoTracks();
    CameraOn = false;
  }
  replaceTracks(mytracks, newtracks);
  return !notrack;
}
function applyAstream(stream){
  let mytracks = mystream.getAudioTracks();
  let newtracks = stream.getAudioTracks();
  let notrack = (newtracks.length === 0);
  if(notrack){
    stream = getDummyAudioStream();
    newtracks = stream.getAudioTracks();
    MicOn = false;
  }
  replaceTracks(mytracks, newtracks);
  return !notrack;
}

/********** Diplay Video  *********/
function addVideoStream(stream, userId) {
  const video = document.createElement('video');
  video.id = `${userId}-video`;
  video.autoplay = true;
  video.playsinline = true;
  video.srcObject = stream;
  const videosection = document.createElement('videosection');
  videosection.id = `${userId}-section`;
  videosection.style.border = "solid 1px #00ff00"
  if(userId === socket.id){
    video.muted = true;
    videosection.innerHTML = `<div id="${userId}-name" class="videocaption">${MyName}</div>`;
  }else{
    videosection.innerHTML = `<div id="${userId}-name" class="videocaption">${rmembers[userId]["Name"]}</div>`;
    socket.emit("ShareScr", {"Mode": "Fetch"});
  }
  videosection.appendChild(video);
  videoGrid.append(videosection);
  resizeVideowindow();
}

function removeVideoStream(userId){
  peercalls[userId].destroy();
  delete peercalls[userId];
  let video = document.getElementById(`${userId}-video`);
  let videosection = document.getElementById(`${userId}-section`);
  if(video) video.remove();
  if(videosection) videosection.remove();
  resizeVideowindow();
}

function resizeVideowindow(){
  if(dispShareScr) return; // disable when sharing screen
  // resize video size
  let vtags = document.getElementsByTagName("video");
  let vnum = vtags.length;
  let vwidth_max = videoGrid.clientWidth;
  let vheight_max = videoGrid.clientHeight;
  // calc each video size
  let colnum = 1;
  let vwidth = vwidth_max;
  for(colnum=1; colnum<=vnum; colnum++){
    vwidth = Math.floor(vwidth_max / colnum);
    let vheight = Math.ceil(vwidth * 9.0 / 16.0);
    let rownum = Math.ceil(vnum / colnum);
    if(vheight*rownum <= vheight_max)
      break;
    if(rownum === 1){
      vwidth = Math.floor(vheight_max * 16.0 / 9.0);
      break;
    }
  }
  // set video grid size
  videoGrid.style["grid-template-columns"] = `repeat(${colnum}, ${vwidth-1}px)`;
  for(let i=0; i<vnum; i++) {
    vtags[i].style.width = `${vwidth-1}px`;
    vtags[i].style["aspect-ratio"] = 16.0/9.0;
    vtags[i].style["object-fit"] = "cover";
  }
}